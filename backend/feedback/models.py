from enum import Enum
from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class FeedbackEventType(str, Enum):
    # Task Lifecycle
    TASK_CREATED = "TASK_CREATED"
    TASK_UPDATED = "TASK_UPDATED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_POSTPONED = "TASK_POSTPONED"
    TASK_SNOOZED = "TASK_SNOOZED"
    TASK_CANCELLED = "TASK_CANCELLED"

    # Reminder Lifecycle
    REMINDER_CREATED = "REMINDER_CREATED"
    REMINDER_SCHEDULED = "REMINDER_SCHEDULED"
    REMINDER_TRIGGERED = "REMINDER_TRIGGERED"
    REMINDER_DISMISSED = "REMINDER_DISMISSED"
    REMINDER_SNOOZED = "REMINDER_SNOOZED"
    REMINDER_COMPLETED = "REMINDER_COMPLETED"

    # Notification Lifecycle
    NOTIFICATION_SENT = "NOTIFICATION_SENT"
    NOTIFICATION_DELIVERED = "NOTIFICATION_DELIVERED"
    NOTIFICATION_OPENED = "NOTIFICATION_OPENED"
    NOTIFICATION_DISMISSED = "NOTIFICATION_DISMISSED"
    NOTIFICATION_SNOOZED = "NOTIFICATION_SNOOZED"
    NOTIFICATION_IGNORED = "NOTIFICATION_IGNORED"
    NOTIFICATION_FAILED = "NOTIFICATION_FAILED"

    # Spoken / Voice Interaction
    VOICE_COMMAND = "VOICE_COMMAND"
    VOICE_CONFIRMATION = "VOICE_CONFIRMATION"
    VOICE_COMPLETION = "VOICE_COMPLETION"

    # Agent Orchestration
    AGENT_ACTION = "AGENT_ACTION"
    AGENT_RESPONSE = "AGENT_RESPONSE"

    # Behavioral Relationships (Derived Observations)
    COMPLETED_AFTER_REMINDER = "COMPLETED_AFTER_REMINDER"
    COMPLETED_BEFORE_REMINDER = "COMPLETED_BEFORE_REMINDER"


class EventSource(str, Enum):
    UI = "UI"
    VOICE = "VOICE"
    AGENT = "AGENT"
    SYSTEM = "SYSTEM"
    SCHEDULER = "SCHEDULER"
    NOTIFICATION = "NOTIFICATION"
    API = "API"


class DataSufficiencyLevel(str, Enum):
    NONE = "NONE"
    LIMITED = "LIMITED"
    MODERATE = "MODERATE"
    SUFFICIENT = "SUFFICIENT"


class FeedbackEventRecord(BaseModel):
    id: str
    user_id: str
    task_id: Optional[str] = None
    reminder_id: Optional[str] = None
    notification_id: Optional[str] = None
    event_type: FeedbackEventType
    event_source: EventSource
    timestamp: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CreateFeedbackEventRequest(BaseModel):
    task_id: Optional[str] = None
    reminder_id: Optional[str] = None
    notification_id: Optional[str] = None
    event_type: FeedbackEventType
    event_source: EventSource = EventSource.UI
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TaskTimelineItem(BaseModel):
    event_id: str
    event_type: str
    event_source: str
    timestamp: datetime
    description: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TaskTimelineResponse(BaseModel):
    task_id: str
    total_events: int
    completed_after_reminder: bool = False
    time_from_reminder_to_completion_seconds: Optional[float] = None
    events: List[TaskTimelineItem]


class BehavioralSummaryResponse(BaseModel):
    user_id: str
    total_events: int

    # Task metrics
    tasks_created: int = 0
    tasks_completed: int = 0
    tasks_postponed: int = 0
    tasks_cancelled: int = 0

    # Reminder & Notification metrics
    reminders_scheduled: int = 0
    reminders_delivered: int = 0
    reminders_dismissed: int = 0
    reminders_snoozed: int = 0
    reminders_ignored: int = 0

    # Relationship metrics
    tasks_completed_after_reminder: int = 0

    # Channel metrics
    voice_interactions: int = 0
    agent_interactions: int = 0

    # Data sufficiency assessment
    data_sufficiency: DataSufficiencyLevel = DataSufficiencyLevel.NONE
    sufficiency_explanation: str
    descriptive_insights: List[str] = Field(default_factory=list)
