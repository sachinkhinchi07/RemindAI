from fastapi import APIRouter, Depends, Header, HTTPException, Query
from typing import Optional
from datetime import datetime, timezone
import logging

from backend.context import ContextService, NormalizedUserContext
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.store import default_task_store

logger = logging.getLogger("remind.context.router")

router = APIRouter(prefix="/api/context", tags=["Context Awareness"])

_context_service = ContextService()


def get_context_service() -> ContextService:
    return _context_service


@router.get("/upcoming", response_model=NormalizedUserContext)
async def get_upcoming_context(
    start: Optional[datetime] = Query(None, description="Start timestamp filter (ISO 8601)"),
    end: Optional[datetime] = Query(None, description="End timestamp filter (ISO 8601)"),
    include_tasks: bool = Query(True),
    include_events: bool = Query(True),
    include_routines: bool = Query(True),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    service: ContextService = Depends(get_context_service),
):
    """
    Phase 9 Context Awareness API:
    Retrieves normalized user context including tasks, calendar events, routines,
    deterministic relationships, time conflicts, and data quality metrics.
    """
    effective_user_id = x_user_id or "demo_user"

    try:
        context_data = await service.get_normalized_context(
            user_id=effective_user_id,
            start_time=start,
            end_time=end,
            include_tasks=include_tasks,
            include_events=include_events,
            include_routines=include_routines,
        )
        return context_data
    except Exception as exc:
        logger.exception("Error retrieving upcoming normalized context")
        raise HTTPException(
            status_code=500,
            detail=f"Context retrieval failed: {str(exc)}",
        )
