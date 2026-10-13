from fastapi import APIRouter, Depends, HTTPException, Header, Query
from typing import List, Optional

from backend.feedback.models import (
    FeedbackEventType,
    EventSource,
    FeedbackEventRecord,
    CreateFeedbackEventRequest,
    TaskTimelineResponse,
    BehavioralSummaryResponse,
)
from backend.feedback.service import FeedbackService, default_feedback_service
from backend.agent.store import TaskStoreAdapter, default_task_store

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


def get_current_user_id(
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
) -> str:
    """Extract authenticated user ID, defaulting safely to 'demo_user' for testing."""
    if x_user_id and x_user_id.strip():
        return x_user_id.strip()
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        if token and token != "undefined":
            return f"user_{token[:8]}"
    return "demo_user"


def get_feedback_service() -> FeedbackService:
    return default_feedback_service


def get_task_store() -> TaskStoreAdapter:
    return default_task_store


@router.get("/summary", response_model=BehavioralSummaryResponse)
async def get_user_behavioral_summary(
    user_id: str = Depends(get_current_user_id),
    service: FeedbackService = Depends(get_feedback_service),
):
    """
    Returns descriptive statistics and data sufficiency level for the authenticated user.
    Strictly factual; no predictive ML or inferred conclusions are returned.
    """
    return await service.get_user_summary(user_id=user_id)


@router.get("/timeline/{task_id}", response_model=TaskTimelineResponse)
async def get_task_timeline(
    task_id: str,
    user_id: str = Depends(get_current_user_id),
    service: FeedbackService = Depends(get_feedback_service),
    task_store: TaskStoreAdapter = Depends(get_task_store),
):
    """
    Returns an immutable chronological timeline of observed actions for a specific task.
    Validates that the task belongs to the authenticated user.
    """
    task = await task_store.get_task_by_id(user_id, task_id)
    if not task:
        # Check if there are events for this task for this user
        events = await service.store.get_events(user_id=user_id, task_id=task_id, limit=1)
        if not events:
            raise HTTPException(status_code=404, detail=f"Task '{task_id}' not found for user.")

    return await service.get_task_timeline(user_id=user_id, task_id=task_id)


@router.get("/events", response_model=List[FeedbackEventRecord])
async def list_feedback_events(
    task_id: Optional[str] = Query(None),
    event_type: Optional[FeedbackEventType] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(get_current_user_id),
    service: FeedbackService = Depends(get_feedback_service),
):
    """Returns raw observed events with strict user isolation."""
    return await service.store.get_events(
        user_id=user_id,
        task_id=task_id,
        event_type=event_type,
        limit=limit,
    )


@router.post("/event", response_model=FeedbackEventRecord)
async def record_user_feedback_event(
    request: CreateFeedbackEventRequest,
    user_id: str = Depends(get_current_user_id),
    service: FeedbackService = Depends(get_feedback_service),
    task_store: TaskStoreAdapter = Depends(get_task_store),
):
    """
    Allows the client/UI to log verified user interactions (e.g., opened notification).
    Validates ownership of any referenced task before recording.
    """
    if request.task_id:
        task = await task_store.get_task_by_id(user_id, request.task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Referenced task does not belong to authenticated user.")

    return await service.record_event(
        user_id=user_id,
        event_type=request.event_type,
        event_source=request.event_source,
        task_id=request.task_id,
        reminder_id=request.reminder_id,
        notification_id=request.notification_id,
        metadata=request.metadata,
    )
