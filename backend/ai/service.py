from typing import Type, TypeVar
from pydantic import BaseModel
from .provider import LLMProvider
from .models import AIGenerationRequest, AIGenerationResponse, AIHealthStatus
from .ollama_provider import OllamaProvider
from backend.config import ai_settings

T = TypeVar("T", bound=BaseModel)

class AIService:
    """Core AI Service orchestrator. Decouples business domains from specific LLM providers."""

    def __init__(self, provider: LLMProvider):
        self._provider = provider

    @property
    def provider(self) -> LLMProvider:
        return self._provider

    async def generate_response(self, request: AIGenerationRequest) -> AIGenerationResponse:
        """Forward prompt generation to the active provider."""
        return await self._provider.generate_response(request)

    async def generate_structured_response(
        self, request: AIGenerationRequest, schema: Type[T]
    ) -> T:
        """Forward structured extraction to the active provider with Pydantic validation."""
        return await self._provider.generate_structured_response(request, schema)

    async def health_check(self) -> AIHealthStatus:
        """Run health check on the active provider."""
        return await self._provider.health_check()


def get_ai_service() -> AIService:
    """Factory creating the configured AIService instance."""
    provider_type = ai_settings.ai_provider.lower()
    if provider_type == "ollama":
        provider = OllamaProvider(
            base_url=ai_settings.llm_base_url,
            model=ai_settings.llm_model,
            timeout=ai_settings.request_timeout,
            default_temperature=ai_settings.temperature,
            default_max_tokens=ai_settings.max_tokens,
        )
    else:
        # Default or fallback
        provider = OllamaProvider(
            base_url=ai_settings.llm_base_url,
            model=ai_settings.llm_model,
        )
    return AIService(provider=provider)
