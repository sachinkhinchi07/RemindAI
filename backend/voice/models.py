from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


class VoiceTranscriptionRequest(BaseModel):
    """Fallback text wrapper or transcript payload from client STT."""
    transcript: str = Field(..., description="Transcribed voice text")
    client_now: Optional[str] = None
    timezone: Optional[str] = None


class VoiceActionResponse(BaseModel):
    """Result of processing a voice utterance through ReMind NLP / Agent."""
    action_type: Literal[
        "task_created",
        "task_completed",
        "task_postponed",
        "reminder_snoozed",
        "reminder_dismissed",
        "agent_response",
        "clarification_needed"
    ]
    spoken_confirmation: str = Field(..., description="Verified concise message to speak back via TTS")
    text_message: str
    target_task_id: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None


class GestureActionRequest(BaseModel):
    """Normalized gesture action captured by frontend camera/event recognizer."""
    gesture_name: Literal["thumbs_up", "open_palm", "two_fingers", "swipe_right", "swipe_left"]
    confidence: float = Field(..., ge=0.0, le=1.0)
    target_task_id: Optional[str] = None
    target_reminder_id: Optional[str] = None


class GestureActionResponse(BaseModel):
    """Response executing gesture-triggered action with safety guard."""
    accepted: bool
    action_executed: Optional[str] = None
    spoken_feedback: Optional[str] = None
    message: str
