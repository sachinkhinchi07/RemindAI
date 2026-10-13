from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class AISettings(BaseSettings):
    """Configuration for AI Service and LLM Providers."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ai_provider: str = Field(default="ollama")
    llm_model: str = Field(default="llama3.2")
    llm_base_url: str = Field(default="http://localhost:11434")
    request_timeout: float = Field(default=30.0)
    temperature: float = Field(default=0.2)
    max_tokens: int = Field(default=1024)
    ml_risk_enabled: bool = Field(default=False)

ai_settings = AISettings()
