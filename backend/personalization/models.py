from enum import Enum
from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class PersonalizationEvidenceLevel(str, Enum):
    NONE = "NONE"
    LIMITED = "LIMITED"
    MODERATE = "MODERATE"
    SUFFICIENT = "SUFFICIENT"


class PersonalizationProfile(BaseModel):
    user_id: str
    data_sufficiency: PersonalizationEvidenceLevel = PersonalizationEvidenceLevel.NONE
    sufficiency_explanation: str

    # Timing Personalization
    recommended_lead_time_minutes: int = 120  # Default 2 hours
    lead_time_adjustment_reason: Optional[str] = None
    category_lead_times_minutes: Dict[str, int] = Field(default_factory=dict)

    # Channel Personalization
    preferred_notification_channels: List[str] = Field(default_factory=lambda: ["banner", "desktop"])
    preferred_channel_reason: Optional[str] = None

    # Observed Behavioral Metrics
    completion_after_reminder_rate: Optional[float] = None
    snooze_rate: Optional[float] = None
    dismissal_rate: Optional[float] = None
    category_postponement_rates: Dict[str, float] = Field(default_factory=dict)
    reminder_fatigue_detected: bool = False

    # Active Rules & Explanations
    active_personalization_rules: List[str] = Field(default_factory=list)
    human_explanations: List[str] = Field(default_factory=list)

    last_updated: datetime
    created_at: datetime


class ResetPersonalizationResponse(BaseModel):
    user_id: str
    success: bool
    message: str
    timestamp: datetime
