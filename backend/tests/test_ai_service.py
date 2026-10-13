import asyncio
import pytest
import httpx
from pydantic import BaseModel
from unittest.mock import patch

from backend.ai.models import AIGenerationRequest, AIHealthStatus
from backend.ai.ollama_provider import OllamaProvider
from backend.ai.service import AIService, get_ai_service
from backend.ai.exceptions import (
    ProviderUnavailableError,
    ModelUnavailableError,
    AIRequestTimeoutError,
    InvalidResponseError,
    MalformedStructuredOutputError,
)

class SampleTaskSchema(BaseModel):
    title: str
    priority: str

def test_successful_ollama_request():
    """1. Test successful text generation via OllamaProvider."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434", model="llama3.2")
        service = AIService(provider=provider)
        req = AIGenerationRequest(prompt="Hello, introduce yourself as ReMind AI.")

        fake_response = httpx.Response(
            status_code=200,
            json={
                "model": "llama3.2",
                "response": "Hello! I am ReMind AI, your proactive cognitive memory assistant.",
                "total_duration": 450000000,
            },
            request=httpx.Request("POST", "http://localhost:11434/api/generate"),
        )

        with patch("httpx.AsyncClient.post", return_value=fake_response):
            res = await service.generate_response(req)
            assert res.content == "Hello! I am ReMind AI, your proactive cognitive memory assistant."
            assert res.model == "llama3.2"
            assert res.provider == "ollama"

    asyncio.run(run())

def test_ollama_unavailable_handling():
    """2. Test handling when Ollama server is unreachable."""
    async def run():
        provider = OllamaProvider(base_url="http://127.0.0.1:9999", timeout=1.0)
        service = AIService(provider=provider)
        req = AIGenerationRequest(prompt="Test prompt")

        with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("Connection refused")):
            with pytest.raises(ProviderUnavailableError) as exc_info:
                await service.generate_response(req)
            assert "Cannot connect to Ollama" in str(exc_info.value)

    asyncio.run(run())

def test_ollama_timeout_handling():
    """3. Test request timeout handling."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434", timeout=0.01)
        service = AIService(provider=provider)
        req = AIGenerationRequest(prompt="Test prompt")

        with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Read timed out")):
            with pytest.raises(AIRequestTimeoutError) as exc_info:
                await service.generate_response(req)
            assert "timed out" in str(exc_info.value)

    asyncio.run(run())

def test_model_unavailable_handling():
    """4. Test handling when configured model does not exist on Ollama."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434", model="nonexistent-model")
        service = AIService(provider=provider)
        req = AIGenerationRequest(prompt="Test prompt")

        fake_404 = httpx.Response(
            status_code=404,
            text="model 'nonexistent-model' not found",
            request=httpx.Request("POST", "http://localhost:11434/api/generate"),
        )

        with patch("httpx.AsyncClient.post", return_value=fake_404):
            with pytest.raises(ModelUnavailableError) as exc_info:
                await service.generate_response(req)
            assert "not found in Ollama" in str(exc_info.value)

    asyncio.run(run())

def test_malformed_provider_response_handling():
    """5. Test handling when Ollama returns invalid/empty response."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434")
        service = AIService(provider=provider)
        req = AIGenerationRequest(prompt="Test prompt")

        # Response with empty response field
        fake_empty = httpx.Response(
            status_code=200,
            json={"response": ""},
            request=httpx.Request("POST", "http://localhost:11434/api/generate"),
        )

        with patch("httpx.AsyncClient.post", return_value=fake_empty):
            with pytest.raises(InvalidResponseError) as exc_info:
                await service.generate_response(req)
            assert "empty response" in str(exc_info.value)

    asyncio.run(run())

def test_server_error_handling():
    """6. Test handling when Ollama encounters an internal server error (HTTP 500)."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434")
        service = AIService(provider=provider)
        req = AIGenerationRequest(prompt="Test prompt")

        fake_500 = httpx.Response(
            status_code=500,
            text="Ollama GPU out of memory",
            request=httpx.Request("POST", "http://localhost:11434/api/generate"),
        )

        with patch("httpx.AsyncClient.post", return_value=fake_500):
            with pytest.raises(InvalidResponseError) as exc_info:
                await service.generate_response(req)
            assert "server error" in str(exc_info.value)

    asyncio.run(run())

def test_health_check_healthy():
    """7. Test health check when Ollama is running and model is installed."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434", model="llama3.2")
        service = AIService(provider=provider)

        fake_tags = httpx.Response(
            status_code=200,
            json={"models": [{"name": "llama3.2:latest"}, {"name": "nomic-embed-text:latest"}]},
            request=httpx.Request("GET", "http://localhost:11434/api/tags"),
        )

        with patch("httpx.AsyncClient.get", return_value=fake_tags):
            status = await service.health_check()
            assert isinstance(status, AIHealthStatus)
            assert status.is_reachable is True
            assert status.is_model_available is True
            assert status.status == "healthy"

    asyncio.run(run())

def test_health_check_model_missing():
    """8. Test health check when Ollama is running but configured model is not pulled."""
    async def run():
        provider = OllamaProvider(base_url="http://localhost:11434", model="mistral")
        service = AIService(provider=provider)

        fake_tags = httpx.Response(
            status_code=200,
            json={"models": [{"name": "llama3.2:latest"}]},
            request=httpx.Request("GET", "http://localhost:11434/api/tags"),
        )

        with patch("httpx.AsyncClient.get", return_value=fake_tags):
            status = await service.health_check()
            assert status.is_reachable is True
            assert status.is_model_available is False
            assert status.status == "model_unavailable"

    asyncio.run(run())
