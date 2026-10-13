from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.ai import (
    AIService,
    get_ai_service,
    AIHealthStatus,
    AIGenerationRequest,
    AIServiceError,
    ProviderUnavailableError,
    ModelUnavailableError,
    AIRequestTimeoutError,
    InvalidResponseError,
)
from backend.routers.tasks import router as tasks_router
from backend.routers.agent import router as agent_router
from backend.routers.context import router as context_router
from backend.routers.voice import router as voice_router
from backend.routers.notifications import router as notifications_router
from backend.routers.feedback import router as feedback_router
from backend.routers.personalization import router as personalization_router

app = FastAPI(
    title="ReMind AI Backend Service",
    description="Cognitive Defense & Proactive Reminder Engine API",
    version="0.1.0",
)

# CORS configuration for local React Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(tasks_router)
app.include_router(agent_router)
app.include_router(context_router)
app.include_router(voice_router)
app.include_router(notifications_router)
app.include_router(feedback_router)
app.include_router(personalization_router)

class TestPromptRequest(BaseModel):
    prompt: str = Field(
        default="Hello, introduce yourself as ReMind AI.",
        description="Prompt to send to Ollama",
    )

class TestPromptResponse(BaseModel):
    prompt: str
    response: str
    model: str
    provider: str

@app.get("/")
async def root():
    return {
        "service": "ReMind AI Backend",
        "status": "online",
        "version": "0.1.0",
    }

@app.get("/api/health")
async def health_check(ai_service: AIService = Depends(get_ai_service)):
    """Extended system health endpoint including AI provider status."""
    ai_status = await ai_service.health_check()
    return {
        "status": "ok",
        "ai": ai_status.model_dump(),
    }

@app.get("/api/ai/health", response_model=AIHealthStatus)
async def ai_health(ai_service: AIService = Depends(get_ai_service)):
    """Dedicated AI provider health check endpoint."""
    return await ai_service.health_check()

@app.post("/api/ai/test-generate", response_model=TestPromptResponse)
async def test_ai_connectivity(
    request: TestPromptRequest,
    ai_service: AIService = Depends(get_ai_service),
):
    """
    Phase 3 Test Endpoint:
    Allows verification of live/configured Ollama connectivity with an introductory prompt.
    """
    req = AIGenerationRequest(prompt=request.prompt)
    try:
        result = await ai_service.generate_response(req)
        return TestPromptResponse(
            prompt=request.prompt,
            response=result.content,
            model=result.model,
            provider=result.provider,
        )
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"AI Provider Unavailable: {exc}",
        )
    except ModelUnavailableError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"Configured Model Unavailable: {exc}",
        )
    except AIRequestTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"AI Generation Timed Out: {exc}",
        )
    except InvalidResponseError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid Response from Provider: {exc}",
        )
    except AIServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI Service Failure: {exc}",
        )


class DemoSeedRequest(BaseModel):
    user_id: str = Field(default="demo_user", description="Target user ID to populate with demo data")

@app.post("/api/demo/seed")
async def seed_demo_environment(request: DemoSeedRequest = DemoSeedRequest()):
    """
    Phase 15 Demo Readiness Endpoint:
    Populates realistic tasks and behavioral history for demo purposes.
    """
    from datetime import datetime, timezone, timedelta
    from backend.agent.store import default_task_store
    from backend.feedback import default_feedback_service, FeedbackEventType, EventSource
    
    now = datetime.now(timezone.utc)
    user_id = request.user_id
    
    demo_tasks = [
        {
            "id": "demo_pres_1",
            "user_id": user_id,
            "title": "Client Presentation at 10 AM",
            "priority": "high",
            "status": "pending",
            "due_at": (now + timedelta(hours=14)).isoformat(),
            "is_routine": False,
            "tags": ["laptop", "presentation file"],
        },
        {
            "id": "demo_assign_2",
            "user_id": user_id,
            "title": "Machine Learning Assignment",
            "priority": "medium",
            "status": "pending",
            "due_at": (now + timedelta(days=2)).isoformat(),
            "is_routine": False,
            "tags": ["report", "notebook"],
        },
        {
            "id": "demo_expense_3",
            "user_id": user_id,
            "title": "Submit Monthly Expense Report",
            "priority": "low",
            "status": "pending",
            "due_at": (now + timedelta(days=4)).isoformat(),
            "is_routine": True,
            "tags": ["receipts"],
        },
    ]
    
    demo_history = {
        "total_tasks_completed": 12,
        "total_tasks_overdue": 3,
        "similar_tasks_postponed": 2,
        "similar_tasks_missed": 1,
        "total_reminders_snoozed": 4,
    }
    
    default_task_store.seed_user_data(user_id, tasks=demo_tasks, history=demo_history)
    
    await default_feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_POSTPONED,
        event_source=EventSource.UI,
        task_id="demo_assign_2",
        metadata={"category": "report"},
    )
    
    return {
        "status": "success",
        "user_id": user_id,
        "tasks_seeded": len(demo_tasks),
        "history": demo_history,
        "message": "Demo environment successfully prepared for presentation.",
    }

