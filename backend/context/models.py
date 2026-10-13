from typing import Any, Dict, List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field


class ContextConflict(BaseModel):
    """Explicitly describes a discrepancy detected between context sources."""
    conflict_type: Literal["time_mismatch", "status_mismatch", "missing_dependency"] = "time_mismatch"
    description: str
    task_id: Optional[str] = None
    event_id: Optional[str] = None
    task_time: Optional[datetime] = None
    event_time: Optional[datetime] = None


class ContextualEvent(BaseModel):
    """Normalized external or internal calendar event."""
    id: str
    title: str
    start_time: datetime
    end_time: Optional[datetime] = None
    location: Optional[str] = None
    source: Literal["calendar", "mock_calendar", "external_sync", "manual"] = "mock_calendar"
    related_task_ids: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ContextualRoutine(BaseModel):
    """Normalized recurring routine or habit."""
    id: str
    title: str
    category: str = "daily"
    typical_time: str = "09:00"
    days_of_week: List[str] = Field(default_factory=lambda: ["Mon", "Tue", "Wed", "Thu", "Fri"])
    preparation_items: List[str] = Field(default_factory=list)
    is_active: bool = True


class ContextRelationship(BaseModel):
    """Deterministic relationship between a task and an event or routine."""
    relationship_type: Literal["preparation_for", "scheduled_at", "routine_habit", "dependency_of"] = "preparation_for"
    task_id: str
    event_id: Optional[str] = None
    routine_id: Optional[str] = None
    confidence: Literal["LOW", "MODERATE", "HIGH"] = "HIGH"
    source: Literal["explicit_link", "deterministic_match", "inferred"] = "deterministic_match"
    explanation: str


class NormalizedUserContext(BaseModel):
    """Normalized, unified snapshot of user context across all providers."""
    user_id: str
    retrieved_at: datetime
    timezone_name: str = "UTC"
    data_quality: Literal["NONE", "LIMITED", "MODERATE", "SUFFICIENT"] = "LIMITED"
    data_sources: List[str] = Field(default_factory=list)
    tasks_count: int = 0
    upcoming_events: List[ContextualEvent] = Field(default_factory=list)
    routines: List[ContextualRoutine] = Field(default_factory=list)
    relationships: List[ContextRelationship] = Field(default_factory=list)
    conflicts: List[ContextConflict] = Field(default_factory=list)
    calendar_connected: bool = False
