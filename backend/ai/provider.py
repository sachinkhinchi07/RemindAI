from abc import ABC, abstractmethod
from typing import Type, TypeVar
from pydantic import BaseModel
from .models import AIGenerationRequest, AIGenerationResponse, AIHealthStatus

T = TypeVar("T", bound=BaseModel)

class LLMProvider(ABC):
    """Abstract interface defining required behaviors for any LLM provider."""

    @abstractmethod
    async def generate_response(self, request: AIGenerationRequest) -> AIGenerationResponse:
        """Generate unstructured text from a prompt."""
        pass

    @abstractmethod
    async def generate_structured_response(
        self, request: AIGenerationRequest, schema: Type[T]
    ) -> T:
        """Generate a response validated and deserialized into a target Pydantic schema."""
        pass

    @abstractmethod
    async def health_check(self) -> AIHealthStatus:
        """Check provider reachability and model availability."""
        pass
