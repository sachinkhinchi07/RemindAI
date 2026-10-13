from typing import List, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field

class RiskFactor(BaseModel):
    """Specific measurable factor that contributed to the risk score."""
    name: str = Field(..., description="Stable identifier (e.g. deadline_proximity, priority)")
    impact: int = Field(..., description="Score points contributed (positive impact)")
    description: str = Field(..., description="Human-readable explanation of why this factor contributed")

class RiskAssessment(BaseModel):
    """Deterministic output of the Forgetfulness Risk Engine."""
    task_id: Optional[str] = None
    score: int = Field(..., ge=0, le=100, description="Normalized risk score from 0 to 100")
    level: Literal["LOW", "MEDIUM", "HIGH"] = Field(..., description="Categorical risk tier")
    factors: List[RiskFactor] = Field(default_factory=list, description="All contributing risk signals")
    explanation: str = Field(..., description="Deterministic synthesized rationale")
    confidence: Literal["low", "medium", "high"] = Field(..., description="Confidence in assessment based on history")
    data_sufficiency: Literal["limited", "moderate", "sufficient"] = Field(
        ..., description="Assessment of available historical records for the user"
    )
    prediction_source: Literal["RULE_BASED", "ML", "HYBRID"] = Field(
        default="RULE_BASED", description="Origin of the risk assessment"
    )
    model_version: Optional[str] = Field(
        default=None, description="Identifier of the ML model version if ML/HYBRID was used"
    )


class UserTaskHistory(BaseModel):
    """Input snapshot of user's past task and reminder behavior."""
    total_tasks_completed: int = 0
    total_tasks_overdue: int = 0
    total_reminders_snoozed: int = 0
    similar_tasks_postponed: int = 0
    similar_tasks_missed: int = 0

class TaskRiskInput(BaseModel):
    """Input data contract for assessing a task's forgetfulness risk."""
    task_id: Optional[str] = None
    title: str
    status: str = "pending"
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    due_at: Optional[datetime] = None
    is_routine: bool = False
    preparation_items_count: int = 0
    has_associated_event: bool = False
    event_imminent: bool = False
    user_history: Optional[UserTaskHistory] = None
    evaluated_at: Optional[datetime] = None
