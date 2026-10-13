from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


class AgentIntent(BaseModel):
    """Structured intent representation classified from user statement."""
    intent_name: Literal[
        "highest_risk_task",
        "upcoming_tasks",
        "prepare_tomorrow",
        "schedule_riskiest_reminder",
        "create_task_reminder",
        "complete_task",
        "postpone_task",
        "check_history",
        "unknown"
    ] = Field(..., description="Recognized user intent")
    entities: Dict[str, Any] = Field(default_factory=dict, description="Extracted parameters (e.g. task_title, hours)")
    requires_action: bool = Field(default=False, description="True if intent requests data mutation")
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class AgentToolExecutionRecord(BaseModel):
    """Record of a single tool call executed during an agent run."""
    tool_name: str
    arguments: Dict[str, Any]
    success: bool
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class AgentChatRequest(BaseModel):
    """API input payload for Agent conversation."""
    message: str = Field(..., description="Natural language prompt or query")
    user_id: Optional[str] = Field(default="demo_user", description="Identity context identifier")
    confirm_action: Optional[bool] = Field(default=None, description="Explicit confirmation flag for mutating actions")


class AgentChatResponse(BaseModel):
    """Structured response payload returned to client."""
    message: str = Field(..., description="Natural language synthesized answer")
    intent: str = Field(..., description="Classified intent name")
    actions: List[Dict[str, Any]] = Field(default_factory=list, description="Any mutations performed")
    tool_calls: List[str] = Field(default_factory=list, description="List of tools invoked")
    execution_trace: List[AgentToolExecutionRecord] = Field(default_factory=list, description="Safe execution steps")
    requires_confirmation: bool = Field(default=False, description="True if an unconfirmed mutating action needs user approval")
    confirmation_prompt: Optional[str] = None
