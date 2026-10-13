import copy
import logging
from typing import Any, Dict, Optional
from datetime import datetime, timezone

from .models import PersonalizationProfile, PersonalizationEvidenceLevel

logger = logging.getLogger("remind.personalization.store")


class PersonalizationStoreAdapter:
    """
    Adapter defining persistence for user behavioral profiles.
    Guarantees user data isolation.
    Supports resetting inferred profiles without deleting raw historical feedback events.
    """

    def __init__(self):
        # { user_id: PersonalizationProfile }
        self._profiles: Dict[str, Dict[str, Any]] = {}

    def _ensure_user(self, user_id: str):
        if user_id not in self._profiles:
            now = datetime.now(timezone.utc)
            self._profiles[user_id] = {
                "user_id": user_id,
                "data_sufficiency": PersonalizationEvidenceLevel.NONE.value,
                "sufficiency_explanation": "No behavioral history yet. Sensible defaults active.",
                "recommended_lead_time_minutes": 120,
                "lead_time_adjustment_reason": None,
                "category_lead_times_minutes": {},
                "preferred_notification_channels": ["banner", "desktop"],
                "preferred_channel_reason": None,
                "completion_after_reminder_rate": None,
                "snooze_rate": None,
                "dismissal_rate": None,
                "category_postponement_rates": {},
                "reminder_fatigue_detected": False,
                "active_personalization_rules": [],
                "human_explanations": ["Sensible system defaults active while gathering baseline evidence."],
                "last_updated": now.isoformat(),
                "created_at": now.isoformat(),
            }

    async def get_profile(self, user_id: str) -> PersonalizationProfile:
        self._ensure_user(user_id)
        raw = copy.deepcopy(self._profiles[user_id])
        return PersonalizationProfile(
            user_id=raw["user_id"],
            data_sufficiency=PersonalizationEvidenceLevel(raw["data_sufficiency"]),
            sufficiency_explanation=raw["sufficiency_explanation"],
            recommended_lead_time_minutes=raw["recommended_lead_time_minutes"],
            lead_time_adjustment_reason=raw.get("lead_time_adjustment_reason"),
            category_lead_times_minutes=raw.get("category_lead_times_minutes", {}),
            preferred_notification_channels=raw.get("preferred_notification_channels", ["banner", "desktop"]),
            preferred_channel_reason=raw.get("preferred_channel_reason"),
            completion_after_reminder_rate=raw.get("completion_after_reminder_rate"),
            snooze_rate=raw.get("snooze_rate"),
            dismissal_rate=raw.get("dismissal_rate"),
            category_postponement_rates=raw.get("category_postponement_rates", {}),
            reminder_fatigue_detected=bool(raw.get("reminder_fatigue_detected", False)),
            active_personalization_rules=raw.get("active_personalization_rules", []),
            human_explanations=raw.get("human_explanations", []),
            last_updated=raw["last_updated"] if isinstance(raw["last_updated"], datetime) else datetime.fromisoformat(str(raw["last_updated"]).replace("Z", "+00:00")),
            created_at=raw["created_at"] if isinstance(raw["created_at"], datetime) else datetime.fromisoformat(str(raw["created_at"]).replace("Z", "+00:00")),
        )

    async def save_profile(self, user_id: str, profile: PersonalizationProfile) -> PersonalizationProfile:
        self._ensure_user(user_id)
        now_str = datetime.now(timezone.utc).isoformat()
        dump = profile.model_dump()
        dump["user_id"] = user_id
        dump["last_updated"] = now_str
        self._profiles[user_id] = copy.deepcopy(dump)
        return profile

    async def reset_profile(self, user_id: str) -> None:
        """Resets inferred profile to baseline defaults without modifying historical events."""
        now = datetime.now(timezone.utc)
        created_val = self._profiles.get(user_id, {}).get("created_at", now.isoformat())
        self._profiles[user_id] = {
            "user_id": user_id,
            "data_sufficiency": PersonalizationEvidenceLevel.NONE.value,
            "sufficiency_explanation": "Profile reset to system defaults by user.",
            "recommended_lead_time_minutes": 120,
            "lead_time_adjustment_reason": None,
            "category_lead_times_minutes": {},
            "preferred_notification_channels": ["banner", "desktop"],
            "preferred_channel_reason": None,
            "completion_after_reminder_rate": None,
            "snooze_rate": None,
            "dismissal_rate": None,
            "category_postponement_rates": {},
            "reminder_fatigue_detected": False,
            "active_personalization_rules": [],
            "human_explanations": ["Personalization profile reset. Learning from future observations."],
            "last_updated": now.isoformat(),
            "created_at": created_val,
        }
        logger.info(f"Personalization profile reset to defaults for user '{user_id}'.")


# Global singleton adapter
default_personalization_store = PersonalizationStoreAdapter()
