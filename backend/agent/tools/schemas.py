from typing import Any, Dict, List, Optional, Literal
from datetime import datetime, timezone
from pydantic import BaseModel, Field

# Input / Output schemas for agent tools

class GetUserTasksInput(BaseModel):
    status: Optional[str] = Field(default=None, description="Optional task status filter (e.g. pending, done)")
    priority: Optional[str] = Field(default=None, description="Optional priority filter (low, medium, high, urgent)")
    limit: int = Field(default=20, ge=1, le=100)

class TaskItemSummary(BaseModel):
    id: str
    title: str
    status: str
    priority: str
    due_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    is_routine: bool = False
    tags: List[str] = Field(default_factory=list)

class GetUserTasksOutput(BaseModel):
    tasks: List[TaskItemSummary]
    total_count: int


class GetUpcomingTasksInput(BaseModel):
    timeframe_hours: int = Field(default=48, ge=1, le=168, description="Lookahead window in hours (default 48h)")
    limit: int = Field(default=10, ge=1, le=50)

class GetUpcomingTasksOutput(BaseModel):
    upcoming_tasks: List[TaskItemSummary]
    count: int


class GetUserPreferencesInput(BaseModel):
    pass

class GetUserPreferencesOutput(BaseModel):
    proactive_reminders_enabled: bool = True
    quiet_hours_on: bool = True
    quiet_start: str = "22:00"
    quiet_end: str = "08:00"
    buffer_minutes: int = 45
    preferred_channels: List[str] = Field(default_factory=lambda: ["banner", "desktop"])


class GetTaskHistoryInput(BaseModel):
    category: Optional[str] = Field(default=None, description="Optional filter")

class GetTaskHistoryOutput(BaseModel):
    total_tasks_completed: int = 0
    total_tasks_overdue: int = 0
    total_reminders_snoozed: int = 0
    similar_tasks_postponed: int = 0
    similar_tasks_missed: int = 0
    data_sufficiency: Literal["limited", "moderate", "sufficient"] = "limited"


class CalculateRiskInput(BaseModel):
    task_id: str = Field(..., description="Task ID to calculate forgetfulness risk for")

class CalculateRiskOutput(BaseModel):
    task_id: str
    title: str
    score: int
    level: Literal["LOW", "MEDIUM", "HIGH"]
    factors: List[str]
    explanation: str
    confidence: str
    data_sufficiency: str


class GetUpcomingEventsInput(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)

class GetUpcomingEventsOutput(BaseModel):
    available: bool = False
    events: List[Dict[str, Any]] = Field(default_factory=list)
    message: str = "Calendar and external context integration is not connected."


class CreateReminderInput(BaseModel):
    task_id: str = Field(..., description="ID of the task to evaluate and create a reminder for")
    override_reason: Optional[str] = None

class CreateReminderOutput(BaseModel):
    task_id: str
    reminder_created: bool
    reminder_id: Optional[str] = None
    remind_at: Optional[datetime] = None
    intervention_level: str
    decision_reason: str
    blocked: bool = False
    block_reason: Optional[str] = None


class UpdateTaskInput(BaseModel):
    task_id: str = Field(..., description="Task ID to update")
    status: Optional[Literal["pending", "in_progress", "done", "cancelled"]] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    postpone_hours: Optional[int] = Field(default=None, ge=1, le=168, description="Hours to postpone due date")
    new_due_at: Optional[datetime] = None

class UpdateTaskOutput(BaseModel):
    task_id: str
    success: bool
    updated_fields: Dict[str, Any]
    message: str


class GetPersonalizationProfileInput(BaseModel):
    pass


class GetPersonalizationProfileOutput(BaseModel):
    user_id: str
    data_sufficiency: str
    sufficiency_explanation: str
    recommended_lead_time_minutes: int
    preferred_notification_channels: List[str]
    category_postponement_rates: Dict[str, float]
    active_personalization_rules: List[str]
    human_explanations: List[str]
