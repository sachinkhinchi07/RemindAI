# AI Service Architecture Documentation

## 1. Overview & Location

The modular AI service layer is located under `backend/ai/`:

```
backend/
├── main.py                     # FastAPI application entrypoint with health endpoints
├── config.py                   # Pydantic v2 AISettings (env-driven configuration)
└── ai/
    ├── __init__.py             # Public module exports
    ├── exceptions.py           # Domain exceptions (ProviderUnavailable, Timeout, etc.)
    ├── models.py               # Pydantic request, response, and health models
    ├── provider.py             # LLMProvider abstract base class (interface)
    ├── ollama_provider.py      # Ollama implementation of LLMProvider
    └── service.py              # AIService orchestrator & dependency injection factory
```

## 2. Architecture & Provider Abstraction

The layer follows a strict dependency inversion pattern:

```
FastAPI Router / Application Layer
                │
                ▼
        [ AIService ] (Orchestrator)
                │
                ▼
      [ LLMProvider ] (Abstract Interface)
        ├── generate_response(request)
        ├── generate_structured_response(request, schema)
        └── health_check()
                │
         ┌──────┴──────┬───────────┐
         ▼             ▼           ▼
   OllamaProvider  (OpenAI)   (Gemini)
         │
    Ollama Daemon (http://localhost:11434)
```

The application layer only interacts with `AIService`. It never communicates directly with HTTP endpoints of Ollama or vendor-specific SDKs.

## 3. Configuration

Configuration is loaded from environment variables (or `.env`) via `backend.config.AISettings`:

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `ollama` | Selected LLM backend provider |
| `LLM_MODEL` | `llama3.2` | Configured model identifier |
| `LLM_BASE_URL` | `http://localhost:11434` | Endpoint URL for the provider |
| `AI_REQUEST_TIMEOUT` | `30.0` | Timeout in seconds for LLM requests |
| `AI_TEMPERATURE` | `0.2` | Generation temperature |
| `AI_MAX_TOKENS` | `1024` | Token generation ceiling |

## 4. How to Add a New LLM Provider

To add another provider (e.g. OpenAI or Gemini):
1. Subclass `LLMProvider` in a new file (e.g., `backend/ai/gemini_provider.py`).
2. Implement the three interface methods:
   - `generate_response(request: AIGenerationRequest) -> AIGenerationResponse`
   - `generate_structured_response(request: AIGenerationRequest, schema: Type[T]) -> T`
   - `health_check() -> AIHealthStatus`
3. Update the factory function `get_ai_service()` in `backend/ai/service.py` to instantiate the new provider when `ai_settings.ai_provider == "gemini"`.
4. No business logic or API routes need to be altered.

## 5. Scope & Responsibilities

### What the AI Service is Responsible For:
- Normalizing prompt generation across LLM backends.
- Enforcing request timeouts and catching connection/transport exceptions.
- Validating structured output against target Pydantic schemas.
- Providing health checks (reachability, model availability).

### What the AI Service is NOT Responsible For:
- Direct database queries or Supabase credential management.
- Task/Reminder business CRUD logic.
- Decision heuristics or risk math (that belongs in the Risk/Decision engines).
- Managing user sessions or auth tokens.
