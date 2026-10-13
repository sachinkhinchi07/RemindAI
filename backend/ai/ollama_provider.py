import json
import logging
import re
from typing import Type, TypeVar, Optional
import httpx
from pydantic import BaseModel, ValidationError

from .provider import LLMProvider
from .models import AIGenerationRequest, AIGenerationResponse, AIHealthStatus
from .exceptions import (
    ProviderUnavailableError,
    ModelUnavailableError,
    AIRequestTimeoutError,
    InvalidResponseError,
    MalformedStructuredOutputError,
)

logger = logging.getLogger("remind_ai.ollama")

T = TypeVar("T", bound=BaseModel)

class OllamaProvider(LLMProvider):
    """Production Ollama implementation of the LLMProvider interface."""

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "llama3.2",
        timeout: float = 30.0,
        default_temperature: float = 0.2,
        default_max_tokens: int = 1024,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.default_temperature = default_temperature
        self.default_max_tokens = default_max_tokens

    async def generate_response(self, request: AIGenerationRequest) -> AIGenerationResponse:
        """Call Ollama /api/generate endpoint with comprehensive error handling and logging."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": request.prompt,
            "stream": False,
            "options": {
                "temperature": request.temperature if request.temperature is not None else self.default_temperature,
                "num_predict": request.max_tokens if request.max_tokens is not None else self.default_max_tokens,
            },
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt

        logger.info(
            "Sending generation request to Ollama [model=%s, base_url=%s, timeout=%.1fs]",
            self.model,
            self.base_url,
            self.timeout,
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(url, json=payload)
        except httpx.TimeoutException as exc:
            logger.warning("Ollama request timed out after %.1fs: %s", self.timeout, exc)
            raise AIRequestTimeoutError(f"Request to Ollama timed out after {self.timeout}s") from exc
        except httpx.ConnectError as exc:
            logger.warning("Failed to connect to Ollama server at %s: %s", self.base_url, exc)
            raise ProviderUnavailableError(f"Cannot connect to Ollama at {self.base_url}") from exc
        except httpx.RequestError as exc:
            logger.error("HTTP network transport error with Ollama: %s", exc)
            raise ProviderUnavailableError(f"Network error communicating with Ollama: {exc}") from exc

        # Handle specific Ollama HTTP status codes
        if response.status_code == 404:
            logger.warning("Model '%s' not found on Ollama server (HTTP 404)", self.model)
            raise ModelUnavailableError(f"Model '{self.model}' not found in Ollama.")
        if response.status_code >= 500:
            logger.error("Ollama server error (HTTP %d): %s", response.status_code, response.text)
            raise InvalidResponseError(f"Ollama internal server error (HTTP {response.status_code})")
        if response.status_code != 200:
            logger.warning("Ollama unexpected response code (HTTP %d): %s", response.status_code, response.text)
            raise InvalidResponseError(f"Ollama returned HTTP {response.status_code}: {response.text}")

        # Parse JSON response body safely
        try:
            data = response.json()
        except Exception as exc:
            logger.error("Malformed non-JSON response from Ollama: %s", exc)
            raise InvalidResponseError(f"Failed to parse Ollama JSON response: {exc}") from exc

        content = data.get("response")
        if content is None or not str(content).strip():
            logger.warning("Empty response text returned by Ollama model '%s'", self.model)
            raise InvalidResponseError("Ollama returned an empty response body.")

        logger.info("Successfully received %d characters from Ollama", len(content))
        return AIGenerationResponse(
            content=content,
            model=self.model,
            provider="ollama",
            metadata={
                "total_duration": data.get("total_duration"),
                "eval_count": data.get("eval_count"),
                "prompt_eval_count": data.get("prompt_eval_count"),
            },
        )

    async def generate_structured_response(
        self, request: AIGenerationRequest, schema: Type[T]
    ) -> T:
        """Enforce and parse JSON-structured responses conforming to target Pydantic schema."""
        schema_json = json.dumps(schema.model_json_schema(), indent=2)
        guidance = (
            f"\nYou must return ONLY valid JSON matching this schema:\n{schema_json}\n"
            "Do NOT include explanations, markdown code fences, or text outside the JSON."
        )

        structured_prompt = f"{request.prompt}\n{guidance}"
        system_instruction = (
            f"{request.system_prompt}\nRespond strictly with valid JSON."
            if request.system_prompt
            else "Respond strictly with valid JSON."
        )

        mod_request = AIGenerationRequest(
            prompt=structured_prompt,
            system_prompt=system_instruction,
            temperature=request.temperature or 0.0,
            max_tokens=request.max_tokens,
        )

        raw_resp = await self.generate_response(mod_request)
        cleaned_text = self._extract_json_string(raw_resp.content)

        try:
            parsed_dict = json.loads(cleaned_text)
            return schema.model_validate(parsed_dict)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.warning(
                "Structured validation failed for schema %s: %s (Raw response snippet: %s)",
                schema.__name__,
                exc,
                raw_resp.content[:150],
            )
            raise MalformedStructuredOutputError(
                f"Model response could not be validated against schema {schema.__name__}: {exc}"
            ) from exc

    def _extract_json_string(self, text: str) -> str:
        """Strip markdown fences or find the outermost JSON dictionary block."""
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if match:
            return match.group(1).strip()
        return text.strip()

    async def health_check(self) -> AIHealthStatus:
        """Check Ollama reachability and verify that the configured model is installed."""
        tags_url = f"{self.base_url}/api/tags"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(tags_url)

            if res.status_code != 200:
                logger.warning("Ollama /api/tags returned HTTP %d", res.status_code)
                return AIHealthStatus(
                    provider="ollama",
                    model=self.model,
                    is_reachable=True,
                    is_model_available=False,
                    status="degraded",
                    message=f"HTTP {res.status_code} from Ollama tags endpoint",
                )

            data = res.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            # Match exact name or prefix (e.g., 'llama3.2' matches 'llama3.2:latest')
            has_model = any(self.model in m for m in models)

            if has_model:
                logger.info("Ollama health check: healthy (model '%s' present)", self.model)
                return AIHealthStatus(
                    provider="ollama",
                    model=self.model,
                    is_reachable=True,
                    is_model_available=True,
                    status="healthy",
                    message=None,
                )
            else:
                logger.warning(
                    "Ollama health check: model '%s' not found. Available models: %s",
                    self.model,
                    models,
                )
                return AIHealthStatus(
                    provider="ollama",
                    model=self.model,
                    is_reachable=True,
                    is_model_available=False,
                    status="model_unavailable",
                    message=f"Model '{self.model}' not found in Ollama. Available: {models}",
                )

        except httpx.ConnectError:
            logger.info("Ollama health check: unreachable at %s", self.base_url)
            return AIHealthStatus(
                provider="ollama",
                model=self.model,
                is_reachable=False,
                is_model_available=False,
                status="provider_unavailable",
                message=f"Cannot reach Ollama at {self.base_url}",
            )
        except Exception as exc:
            logger.warning("Ollama health check error: %s", exc)
            return AIHealthStatus(
                provider="ollama",
                model=self.model,
                is_reachable=False,
                is_model_available=False,
                status="provider_unavailable",
                message=str(exc),
            )
