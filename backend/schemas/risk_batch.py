from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

from backend.risk.models import TaskRiskInput, RiskAssessment, UserTaskHistory

class BatchRiskAssessRequest(BaseModel):
    """Batch assessment request for multiple user tasks."""
    tasks: List[TaskRiskInput] = Field(..., description="List of tasks to evaluate")
    user_history: Optional[UserTaskHistory] = Field(default=None, description="Shared user behavioral history")

class BatchRiskAssessResponse(BaseModel):
    """Response containing individual task assessments."""
    assessments: List[RiskAssessment]
    total_evaluated: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
