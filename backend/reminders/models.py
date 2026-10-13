from typing import List, Optional, Literal
from datetime import datetime, time
from pydantic import BaseModel, Field

class UserReminderPreferences(BaseModel):
    """User notification and quiet hour preferences."""
    proactive_reminders_enabled: bool = True
    quiet_hours_on: bool = True
    quiet_start: time = time(22, 0)  # 10:00 PM
    quiet_end: time = time(8, 0)     # 08:00 AM
    smart_throttle: bool = True
    buffer_minutes: int = 45
    preferred_channels: List[str] = Field(default_factory=lambda: ["banner", "desktop"])

class ExistingReminderInfo(BaseModel):
    """Snapshot of an active or recent reminder associated with the task."""
    reminder_id: Optional[str] = None
    remind_at: datetime
    status: Literal["scheduled", "snoozed", "delivered", "missed", "dismissed"] = "scheduled"
    snooze_until: Optional[datetime] = None

class ReminderDecisionInput(BaseModel):
    """Structured input contract for Reminder Decision Engine."""
    task_id: Optional[str] = None
    title: str
    status: str = "pending"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    due_at: Optional[datetime] = None
    risk_score: int = Field(default=0, ge=0, le=100)
    risk_level: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    risk_factors: List[str] = Field(default_factory=list)
    existing_reminders: List[ExistingReminderInfo] = Field(default_factory=list)
    preferences: Optional[UserReminderPreferences] = None
    associated_event_time: Optional[datetime] = None
    personalized_lead_time_minutes: Optional[int] = None
    current_time: Optional[datetime] = None

class ReminderDecision(BaseModel):
    """Deterministic output of the Reminder Decision Engine."""
    task_id: Optional[str] = None
    should_remind: bool
    intervention_level: Literal["NONE", "LOW_NUDGE", "PROACTIVE", "ESCALATION"]
    recommended_time: Optional[datetime] = None
    reason: str
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    risk_score: int
    decision_factors: List[str] = Field(default_factory=list)
    blocked: bool = False
    block_reason: Optional[str] = None
    delivery_channels: List[str] = Field(default_factory=lambda: ["banner"])
