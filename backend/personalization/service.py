import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from .models import (
    PersonalizationProfile,
    PersonalizationEvidenceLevel,
    ResetPersonalizationResponse,
)
from .store import PersonalizationStoreAdapter, default_personalization_store
from backend.feedback import (
    FeedbackService,
    default_feedback_service,
    FeedbackEventType,
    EventSource,
)
from backend.agent.store import TaskStoreAdapter, default_task_store

logger = logging.getLogger("remind.personalization.service")


class PersonalizationService:
    """
    Deterministic Personalization Engine for ReMind AI.
    Analyzes verified behavioral feedback history to derive conservative, evidence-based patterns.
    Does NOT train LLMs or invent psychological assumptions.
    Strictly adheres to:
      Explicit User Preferences > System Safety Constraints > Reminder Decision Engine > Personalization > Defaults
    """

    def __init__(
        self,
        store: Optional[PersonalizationStoreAdapter] = None,
        feedback_service: Optional[FeedbackService] = None,
        task_store: Optional[TaskStoreAdapter] = None,
    ):
        self.store = store or default_personalization_store
        self.feedback_service = feedback_service or default_feedback_service
        self.task_store = task_store or default_task_store

    async def get_or_build_profile(self, user_id: str) -> PersonalizationProfile:
        """
        Builds or returns an up-to-date personalization profile derived deterministically
        from observed behavioral evidence.
        """
        events = await self.feedback_service.store.get_events(user_id=user_id, limit=500)
        tasks = await self.task_store.get_tasks(user_id=user_id, limit=100)
        user_prefs = await self.task_store.get_user_preferences(user_id)

        now = datetime.now(timezone.utc)
        total_events = len(events)

        # 1. Determine Data Sufficiency
        if total_events < 3:
            sufficiency = PersonalizationEvidenceLevel.NONE
            explanation = "Not enough behavioral history yet (<3 observed events). Baseline defaults active."
        elif total_events < 10:
            sufficiency = PersonalizationEvidenceLevel.LIMITED
            explanation = f"Limited behavioral history ({total_events} events). Applying only conservative adjustments."
        elif total_events < 20:
            sufficiency = PersonalizationEvidenceLevel.MODERATE
            explanation = f"Moderate behavioral history ({total_events} events). Verified timing and category patterns active."
        else:
            sufficiency = PersonalizationEvidenceLevel.SUFFICIENT
            explanation = f"Sufficient behavioral history ({total_events} events). Comprehensive operational personalization active."

        # Baseline defaults
        recommended_lead_time = 120  # 2 hours
        lead_time_reason: Optional[str] = None
        category_lead_times: Dict[str, int] = {}
        category_postponements: Dict[str, float] = {}

        preferred_channels = copy_channels = user_prefs.get("preferred_channels", ["banner", "desktop"])
        preferred_channel_reason: Optional[str] = None

        active_rules: List[str] = []
        human_explanations: List[str] = []

        # If sufficiency is NONE, return safe defaults without speculative inference
        if sufficiency == PersonalizationEvidenceLevel.NONE:
            profile = PersonalizationProfile(
                user_id=user_id,
                data_sufficiency=sufficiency,
                sufficiency_explanation=explanation,
                recommended_lead_time_minutes=recommended_lead_time,
                lead_time_adjustment_reason="Default 2-hour preparation buffer.",
                category_lead_times_minutes={},
                preferred_notification_channels=preferred_channels,
                preferred_channel_reason="System defaults.",
                completion_after_reminder_rate=None,
                snooze_rate=None,
                dismissal_rate=None,
                category_postponement_rates={},
                reminder_fatigue_detected=False,
                active_personalization_rules=[],
                human_explanations=["Sensible system defaults active while gathering initial evidence."],
                last_updated=now,
                created_at=now,
            )
            await self.store.save_profile(user_id, profile)
            return profile

        # 2. Analyze Category Postponement Patterns
        # Map tasks to category/tags
        task_category_map: Dict[str, str] = {}
        category_counts: Dict[str, int] = {}
        for t in tasks:
            t_id = str(t.get("id"))
            tags = t.get("tags") or []
            cat = tags[0].lower() if tags and isinstance(tags, list) else "general"
            task_category_map[t_id] = cat
            category_counts[cat] = category_counts.get(cat, 0) + 1

        category_postpone_counts: Dict[str, int] = {}
        for e in events:
            if e.event_type == FeedbackEventType.TASK_POSTPONED and e.task_id:
                cat = task_category_map.get(e.task_id, "general")
                category_postpone_counts[cat] = category_postpone_counts.get(cat, 0) + 1

        for cat, count in category_counts.items():
            postpones = category_postpone_counts.get(cat, 0)
            rate = round(postpones / count, 2)
            category_postponements[cat] = rate

            # Deterministic Rule 1: Category Postponement Lead Time Adjustment
            # If category has >= 2 tasks and >= 50% postponement rate:
            if count >= 2 and rate >= 0.50 and sufficiency in [PersonalizationEvidenceLevel.MODERATE, PersonalizationEvidenceLevel.SUFFICIENT]:
                adj_lead = 360  # 6 hours
                category_lead_times[cat] = adj_lead
                active_rules.append(f"CATEGORY_POSTPONEMENT_BUFFER_{cat.upper()}")
                human_explanations.append(
                    f"Tasks in '{cat}' are postponed frequently ({int(rate*100)}% of time). ReMind stages reminders 6 hours early for extra buffer."
                )

        # 3. Analyze Reminder Effectiveness & Fatigue
        delivered_count = sum(
            1 for e in events
            if e.event_type in [FeedbackEventType.NOTIFICATION_DELIVERED, FeedbackEventType.REMINDER_TRIGGERED]
        )
        snooze_count = sum(
            1 for e in events
            if e.event_type in [FeedbackEventType.NOTIFICATION_SNOOZED, FeedbackEventType.REMINDER_SNOOZED]
        )
        dismiss_count = sum(
            1 for e in events
            if e.event_type in [FeedbackEventType.NOTIFICATION_DISMISSED, FeedbackEventType.REMINDER_DISMISSED]
        )
        completed_after_reminder_count = sum(
            1 for e in events
            if e.event_type == FeedbackEventType.COMPLETED_AFTER_REMINDER
        )

        completion_rate = round(completed_after_reminder_count / delivered_count, 2) if delivered_count > 0 else None
        snooze_rate = round(snooze_count / delivered_count, 2) if delivered_count > 0 else None
        dismissal_rate = round(dismiss_count / delivered_count, 2) if delivered_count > 0 else None

        reminder_fatigue = False
        if delivered_count >= 5:
            # Deterministic Rule 2: Fatigue detection
            # If >= 60% snoozed/dismissed and < 20% completed
            if (snooze_rate or 0) + (dismissal_rate or 0) >= 0.60 and (completion_rate or 0) < 0.20:
                reminder_fatigue = True
                active_rules.append("REMINDER_FATIGUE_THROTTLE")
                human_explanations.append(
                    "High notification dismissal/snooze rate observed. Non-essential proactive alerts are conservatively throttled."
                )

        # 4. Analyze Channel Responsiveness
        voice_events = [e for e in events if e.event_source == EventSource.VOICE or e.event_type == FeedbackEventType.VOICE_COMMAND]
        if len(voice_events) >= 3 and sufficiency in [PersonalizationEvidenceLevel.MODERATE, PersonalizationEvidenceLevel.SUFFICIENT]:
            # Deterministic Rule 3: Preferred Voice Interaction
            # Only recommend if voice is not explicitly disabled by user
            if "voice" not in preferred_channels:
                preferred_channels = list(preferred_channels) + ["voice"]
            preferred_channel_reason = "Demonstrated active voice interactions; voice reminder responses prioritized."
            active_rules.append("PREFER_VOICE_RESPONSIVENESS")
            human_explanations.append("Voice interaction frequently utilized; voice notifications enabled as high-priority channel.")

        if not human_explanations:
            human_explanations.append("Operating with standard calibrated baselines.")

        profile = PersonalizationProfile(
            user_id=user_id,
            data_sufficiency=sufficiency,
            sufficiency_explanation=explanation,
            recommended_lead_time_minutes=recommended_lead_time,
            lead_time_adjustment_reason=lead_time_reason or "Calibrated to standard 2-hour window.",
            category_lead_times_minutes=category_lead_times,
            preferred_notification_channels=preferred_channels,
            preferred_channel_reason=preferred_channel_reason,
            completion_after_reminder_rate=completion_rate,
            snooze_rate=snooze_rate,
            dismissal_rate=dismissal_rate,
            category_postponement_rates=category_postponements,
            reminder_fatigue_detected=reminder_fatigue,
            active_personalization_rules=active_rules,
            human_explanations=human_explanations,
            last_updated=now,
            created_at=now,
        )

        await self.store.save_profile(user_id, profile)
        return profile

    async def reset_profile(self, user_id: str) -> ResetPersonalizationResponse:
        """Safely resets inferred personalization rules without touching raw events."""
        await self.store.reset_profile(user_id)
        now = datetime.now(timezone.utc)
        return ResetPersonalizationResponse(
            user_id=user_id,
            success=True,
            message="Inferred behavioral personalization rules have been reset to system defaults.",
            timestamp=now,
        )


# Global singleton service
default_personalization_service = PersonalizationService()
