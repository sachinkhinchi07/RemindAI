import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone

from .models import (
    FeedbackEventType,
    EventSource,
    FeedbackEventRecord,
    TaskTimelineItem,
    TaskTimelineResponse,
    BehavioralSummaryResponse,
    DataSufficiencyLevel,
)
from .store import FeedbackStoreAdapter, default_feedback_store

logger = logging.getLogger("remind.feedback.service")


class FeedbackService:
    """
    Core Behavioral Feedback Service.
    Responsible for recording observed interactions, constructing task timelines,
    and generating descriptive summaries with data sufficiency assessments.
    Strictly distinguishes OBSERVED facts from INFERRED conclusions.
    No machine learning or arbitrary personalization is performed.
    """

    def __init__(self, store: Optional[FeedbackStoreAdapter] = None):
        self.store = store or default_feedback_store

    async def record_event(
        self,
        user_id: str,
        event_type: FeedbackEventType,
        event_source: EventSource,
        task_id: Optional[str] = None,
        reminder_id: Optional[str] = None,
        notification_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ) -> FeedbackEventRecord:
        """Records an immutable observed event with validated user isolation."""
        logger.info(
            f"Recording feedback event: user={user_id}, type={event_type.value}, source={event_source.value}, task={task_id}"
        )
        return await self.store.record_event(
            user_id=user_id,
            event_type=event_type,
            event_source=event_source,
            task_id=task_id,
            reminder_id=reminder_id,
            notification_id=notification_id,
            metadata=metadata,
            timestamp=timestamp,
        )

    async def get_task_timeline(self, user_id: str, task_id: str) -> TaskTimelineResponse:
        """
        Builds a deterministic, chronological timeline of all observed actions on a task.
        Detects whether task was completed after an active reminder without claiming causality.
        """
        events = await self.store.get_events(user_id=user_id, task_id=task_id, limit=200)

        timeline_items: List[TaskTimelineItem] = []
        last_reminder_time: Optional[datetime] = None
        completion_time: Optional[datetime] = None

        for e in events:
            # Track reminder occurrences
            if e.event_type in [
                FeedbackEventType.REMINDER_TRIGGERED,
                FeedbackEventType.NOTIFICATION_DELIVERED,
                FeedbackEventType.NOTIFICATION_SENT,
            ]:
                last_reminder_time = e.timestamp

            # Track completion
            if e.event_type in [
                FeedbackEventType.TASK_COMPLETED,
                FeedbackEventType.VOICE_COMPLETION,
                FeedbackEventType.COMPLETED_AFTER_REMINDER,
            ]:
                completion_time = e.timestamp

            desc = self._format_event_description(e)
            timeline_items.append(
                TaskTimelineItem(
                    event_id=e.id,
                    event_type=e.event_type.value,
                    event_source=e.event_source.value,
                    timestamp=e.timestamp,
                    description=desc,
                    metadata=e.metadata,
                )
            )

        completed_after_reminder = False
        delta_seconds: Optional[float] = None

        if last_reminder_time and completion_time and completion_time >= last_reminder_time:
            completed_after_reminder = True
            delta_seconds = (completion_time - last_reminder_time).total_seconds()

        return TaskTimelineResponse(
            task_id=task_id,
            total_events=len(timeline_items),
            completed_after_reminder=completed_after_reminder,
            time_from_reminder_to_completion_seconds=delta_seconds,
            events=timeline_items,
        )

    async def get_user_summary(self, user_id: str) -> BehavioralSummaryResponse:
        """
        Computes descriptive statistics over observed actions for the user.
        Determines data sufficiency level without fabricating patterns.
        """
        events = await self.store.get_events(user_id=user_id, limit=500)

        tasks_created = 0
        tasks_completed = 0
        tasks_postponed = 0
        tasks_cancelled = 0

        reminders_scheduled = 0
        reminders_delivered = 0
        reminders_dismissed = 0
        reminders_snoozed = 0
        reminders_ignored = 0

        tasks_completed_after_reminder = 0
        voice_interactions = 0
        agent_interactions = 0

        # Set of task IDs that had reminder deliveries
        task_reminders: Dict[str, datetime] = {}
        task_completions: Dict[str, datetime] = {}

        for e in events:
            # Task counts
            if e.event_type == FeedbackEventType.TASK_CREATED:
                tasks_created += 1
            elif e.event_type == FeedbackEventType.TASK_COMPLETED:
                tasks_completed += 1
                if e.task_id:
                    task_completions[e.task_id] = e.timestamp
            elif e.event_type == FeedbackEventType.TASK_POSTPONED:
                tasks_postponed += 1
            elif e.event_type == FeedbackEventType.TASK_CANCELLED:
                tasks_cancelled += 1

            # Reminder counts
            elif e.event_type in [FeedbackEventType.REMINDER_SCHEDULED, FeedbackEventType.NOTIFICATION_SENT]:
                reminders_scheduled += 1
            elif e.event_type in [FeedbackEventType.REMINDER_TRIGGERED, FeedbackEventType.NOTIFICATION_DELIVERED]:
                reminders_delivered += 1
                if e.task_id:
                    task_reminders[e.task_id] = e.timestamp
            elif e.event_type in [FeedbackEventType.REMINDER_DISMISSED, FeedbackEventType.NOTIFICATION_DISMISSED]:
                reminders_dismissed += 1
            elif e.event_type in [FeedbackEventType.REMINDER_SNOOZED, FeedbackEventType.NOTIFICATION_SNOOZED]:
                reminders_snoozed += 1
            elif e.event_type == FeedbackEventType.NOTIFICATION_IGNORED:
                reminders_ignored += 1

            elif e.event_type == FeedbackEventType.COMPLETED_AFTER_REMINDER:
                tasks_completed_after_reminder += 1

            # Channel counts
            if e.event_source == EventSource.VOICE or e.event_type in [
                FeedbackEventType.VOICE_COMMAND,
                FeedbackEventType.VOICE_COMPLETION,
            ]:
                voice_interactions += 1
            elif e.event_source == EventSource.AGENT or e.event_type in [
                FeedbackEventType.AGENT_ACTION,
                FeedbackEventType.AGENT_RESPONSE,
            ]:
                agent_interactions += 1

        # Check any unflagged completions that occurred after reminders
        for t_id, comp_t in task_completions.items():
            if t_id in task_reminders and comp_t >= task_reminders[t_id]:
                if tasks_completed_after_reminder == 0:
                    tasks_completed_after_reminder += 1

        # Evaluate Data Sufficiency
        total_actions = len(events)
        if total_actions < 3:
            sufficiency = DataSufficiencyLevel.NONE
            explanation = "Not enough behavioral history yet. Gathering initial baseline interactions."
        elif total_actions < 10:
            sufficiency = DataSufficiencyLevel.LIMITED
            explanation = f"Limited behavioral history ({total_actions} observed events). Patterns are emerging but preliminary."
        elif total_actions < 20:
            sufficiency = DataSufficiencyLevel.MODERATE
            explanation = f"Moderate behavioral history ({total_actions} events). Sufficient for descriptive operational guidance."
        else:
            sufficiency = DataSufficiencyLevel.SUFFICIENT
            explanation = f"Sufficient behavioral history ({total_actions} events). Comprehensive operational baseline established."

        # Descriptive Insights (Descriptive ONLY, strictly non-speculative)
        insights: List[str] = []
        if sufficiency == DataSufficiencyLevel.NONE:
            insights.append("Baseline interactions are currently being recorded.")
        else:
            if tasks_created > 0:
                insights.append(
                    f"You have completed {tasks_completed} of {tasks_created} registered tasks."
                )
            if tasks_postponed > 0:
                insights.append(f"{tasks_postponed} tasks had deadlines postponed.")
            if tasks_completed_after_reminder > 0:
                insights.append(
                    f"{tasks_completed_after_reminder} tasks were completed after receiving reminders."
                )
            if reminders_snoozed > 0:
                insights.append(f"Reminders were snoozed {reminders_snoozed} times.")
            if voice_interactions > 0:
                insights.append(f"{voice_interactions} voice interactions were observed.")

        return BehavioralSummaryResponse(
            user_id=user_id,
            total_events=total_actions,
            tasks_created=tasks_created,
            tasks_completed=tasks_completed,
            tasks_postponed=tasks_postponed,
            tasks_cancelled=tasks_cancelled,
            reminders_scheduled=reminders_scheduled,
            reminders_delivered=reminders_delivered,
            reminders_dismissed=reminders_dismissed,
            reminders_snoozed=reminders_snoozed,
            reminders_ignored=reminders_ignored,
            tasks_completed_after_reminder=tasks_completed_after_reminder,
            voice_interactions=voice_interactions,
            agent_interactions=agent_interactions,
            data_sufficiency=sufficiency,
            sufficiency_explanation=explanation,
            descriptive_insights=insights,
        )

    def _format_event_description(self, event: FeedbackEventRecord) -> str:
        t = event.event_type
        if t == FeedbackEventType.TASK_CREATED:
            return "Task created"
        elif t == FeedbackEventType.TASK_COMPLETED:
            return "Task marked completed"
        elif t == FeedbackEventType.TASK_POSTPONED:
            hours = event.metadata.get("postpone_hours", "")
            return f"Task deadline postponed ({hours}h)" if hours else "Task deadline postponed"
        elif t == FeedbackEventType.TASK_CANCELLED:
            return "Task cancelled"
        elif t == FeedbackEventType.REMINDER_SCHEDULED:
            return "Proactive reminder scheduled"
        elif t == FeedbackEventType.NOTIFICATION_DELIVERED:
            return f"Notification delivered ({event.metadata.get('channel', 'IN_APP')})"
        elif t == FeedbackEventType.NOTIFICATION_SNOOZED or t == FeedbackEventType.REMINDER_SNOOZED:
            mins = event.metadata.get("snooze_minutes", 30)
            return f"Reminder snoozed for {mins} minutes"
        elif t == FeedbackEventType.NOTIFICATION_DISMISSED or t == FeedbackEventType.REMINDER_DISMISSED:
            return "Reminder dismissed"
        elif t == FeedbackEventType.COMPLETED_AFTER_REMINDER:
            return "Task completed after reminder intervention"
        elif t == FeedbackEventType.VOICE_COMMAND:
            return "Voice command processed"
        elif t == FeedbackEventType.AGENT_ACTION:
            action = event.metadata.get("action", "executed")
            return f"AI Agent executed tool: {action}"
        return f"Event recorded: {t.value}"


# Global singleton service
default_feedback_service = FeedbackService()
