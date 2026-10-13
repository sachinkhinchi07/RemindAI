from typing import Any, Dict, List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field


class NotificationRecord(BaseModel):
    """Normalized notification data contract."""
    id: str
    user_id: str
    task_id: Optional[str] = None
    reminder_id: Optional[str] = None
    channel: Literal["IN_APP", "BROWSER", "VOICE"] = "IN_APP"
    title: str
    message: str
    scheduled_at: datetime
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None
    status: Literal[
        "SCHEDULED",
        "SENDING",
        "SENT",
        "DELIVERED",
        "DISMISSED",
        "SNOOZED",
        "FAILED",
        "CANCELLED"
    ] = "SCHEDULED"
    failure_reason: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    intervention_level: Literal["NONE", "LOW_NUDGE", "PROACTIVE", "ESCALATION"] = "PROACTIVE"
    created_at: datetime
    updated_at: datetime


class ScheduleNotificationRequest(BaseModel):
    """Input payload to schedule delivery of an approved reminder decision."""
    task_id: str
    reminder_id: Optional[str] = None
    channel: Literal["IN_APP", "BROWSER", "VOICE"] = "IN_APP"
    title: str
    message: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    intervention_level: Literal["NONE", "LOW_NUDGE", "PROACTIVE", "ESCALATION"] = "PROACTIVE"


class NotificationActionRequest(BaseModel):
    """User response interaction on a notification."""
    action: Literal["DISMISS", "SNOOZE", "COMPLETE", "READ"]
    snooze_minutes: Optional[int] = Field(default=30, ge=5, le=1440)


class NotificationActionResponse(BaseModel):
    """Outcome of user interaction."""
    notification_id: str
    status: str
    action_performed: str
    spoken_feedback: Optional[str] = None
    message: str
