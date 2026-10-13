class AIServiceError(Exception):
    """Base exception for all AI Service errors."""
    pass

class ProviderUnavailableError(AIServiceError):
    """Raised when the LLM provider service cannot be reached or connected to."""
    pass

class ModelUnavailableError(AIServiceError):
    """Raised when the requested model is not found or loaded in the provider."""
    pass

class AIRequestTimeoutError(AIServiceError):
    """Raised when an AI generation request exceeds the configured timeout."""
    pass

class InvalidResponseError(AIServiceError):
    """Raised when the provider returns an unparseable or empty response."""
    pass

class MalformedStructuredOutputError(AIServiceError):
    """Raised when structured JSON output does not conform to the expected schema."""
    pass
