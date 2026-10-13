from fastapi import APIRouter, Depends, Header, HTTPException, Query
from typing import Optional, List
import logging

from backend.notifications.models import (
    NotificationRecord,
    ScheduleNotificationRequest,
    NotificationActionRequest,
    NotificationActionResponse,
)
from backend.notifications.service import NotificationService
from backend.notifications.store import default_notification_store
from backend.agent.store import default_task_store

logger = logging.getLogger("remind.notifications.router")

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

_shared_service = NotificationService(
    notif_store=default_notification_store,
    task_store=default_task_store,
)


def get_notification_service() -> NotificationService:
    return _shared_service


@router.get("", response_model=List[NotificationRecord])
async def list_notifications(
    status: Optional[str] = Query(None, description="Optional status filter"),
    limit: int = Query(50, ge=1, le=100),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    service: NotificationService = Depends(get_notification_service),
):
    """Fetch notifications for the authenticated user."""
    effective_user_id = x_user_id or "demo_user"
    # Also trigger due deliveries
    await service.deliver_due_notifications(effective_user_id)
    raw_list = await service.notif_store.get_notifications(effective_user_id, status=status, limit=limit)
    return [NotificationRecord(**n) for n in raw_list]


@router.post("/schedule", response_model=NotificationRecord)
async def schedule_notification_endpoint(
    request: ScheduleNotificationRequest,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    service: NotificationService = Depends(get_notification_service),
):
    """Schedule a notification for an approved reminder decision."""
    effective_user_id = x_user_id or "demo_user"
    try:
        return await service.schedule_notification(effective_user_id, request)
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.exception("Error scheduling notification")
        raise HTTPException(status_code=500, detail=f"Scheduling error: {str(exc)}")


@router.post("/{notification_id}/action", response_model=NotificationActionResponse)
async def handle_notification_action_endpoint(
    notification_id: str,
    action_req: NotificationActionRequest,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    service: NotificationService = Depends(get_notification_service),
):
    """Process user interaction (COMPLETE, SNOOZE, DISMISS, READ)."""
    effective_user_id = x_user_id or "demo_user"
    try:
        return await service.handle_user_action(effective_user_id, notification_id, action_req)
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as exc:
        logger.exception("Error executing notification action")
        raise HTTPException(status_code=500, detail=f"Action error: {str(exc)}")
