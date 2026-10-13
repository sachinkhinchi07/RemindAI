from typing import List, Optional, Literal
from pydantic import BaseModel, Field

class TaskUnderstandingLLMOutput(BaseModel):
    """Raw structured output schema requested from the LLM."""
    title: str = Field(..., description="Concise, clear task title")
    description: Optional[str] = Field(default=None, description="Detailed description or context")
    relative_date_expr: Optional[str] = Field(
        default=None,
        description="Explicit relative date expression, e.g. 'tomorrow', 'tonight', 'next Monday', or explicit date '2026-10-15'",
    )
    time_expr: Optional[str] = Field(
        default=None,
        description="Explicit time stated, e.g. '10:00 AM', '14:30', or 'evening'",
    )
    priority: Literal["low", "medium", "high", "urgent"] = Field(
        default="medium",
        description="Validated priority level",
    )
    category: Optional[str] = Field(default="Work", description="Inferred category or domain")
    related_items: List[str] = Field(
        default_factory=list,
        description="List of physical/digital items explicitly mentioned to bring or prepare",
    )
    recurrence_rule: Optional[str] = Field(
        default=None,
        description="Explicit recurrence rule if mentioned, e.g., 'every Monday', 'daily'",
    )
    ambiguities: List[str] = Field(
        default_factory=list,
        description="Uncertain or missing key attributes that could not be determined",
    )


class TaskParseRequest(BaseModel):
    """User input request to parse natural-language text into a task."""
    text: str = Field(..., min_length=2, description="User natural language task description")
    timezone: Optional[str] = Field(default=None, description="User timezone (e.g. 'Asia/Kolkata', 'UTC')")
    client_now: Optional[str] = Field(default=None, description="Optional ISO timestamp of user local time")


class ParsedTaskResponse(BaseModel):
    """Validated structured response returned to the frontend."""
    title: str
    description: Optional[str] = None
    due_at: Optional[str] = None  # Resolved ISO-8601 timestamp (e.g. 2026-10-13T10:00:00Z)
    due_date_str: Optional[str] = None  # Human-readable date string (e.g. "Tuesday, Oct 13, 2026")
    due_time_str: Optional[str] = None  # Human-readable time string (e.g. "10:00 AM")
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    category: str = "Work"
    related_items: List[str] = []
    recurrence_rule: Optional[str] = None
    recurrence_supported: bool = False  # Schema report: recurring tasks not yet supported in DB
    ambiguities: List[str] = []
    original_text: str
    confidence_score: float = 0.95
