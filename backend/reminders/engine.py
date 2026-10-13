from datetime import datetime, date, time, timedelta, timezone
from typing import Optional, List, Tuple

from .models import (
    ReminderDecisionInput,
    ReminderDecision,
    UserReminderPreferences,
    ExistingReminderInfo,
)

class ReminderDecisionEngine:
    """
    Deterministic Reminder Decision Engine.
    Determines whether, when, and how ReMind should intervene with a proactive reminder.
    Independent of LLMs and notification senders.
    """

    # Maximum proactive reminders allowed per task to prevent notification fatigue
    MAX_PROACTIVE_REMINDERS_PER_TASK = 2

    # Minimum spacing required between consecutive reminders (2 hours)
    MIN_SPACING_HOURS = 2

    def evaluate_decision(self, input_data: ReminderDecisionInput) -> ReminderDecision:
        now = input_data.current_time or datetime.now(timezone.utc)
        prefs = input_data.preferences or UserReminderPreferences()

        decision_factors: List[str] = []

        # 1. Task Lifecycle State Checks
        task_status = (input_data.status or "pending").lower()
        if task_status in ["done", "completed"]:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=None,
                reason="Task is already marked completed.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=["Task is completed"],
                blocked=True,
                block_reason="Task is already completed.",
            )

        if task_status in ["cancelled", "archived", "deleted", "blocked"]:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=None,
                reason=f"Task is inactive (status: {task_status}).",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=[f"Task is {task_status}"],
                blocked=True,
                block_reason=f"Task is {task_status}.",
            )

        # 2. User Preference Gate
        if not prefs.proactive_reminders_enabled:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=None,
                reason="Proactive reminders are disabled in user preferences.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=["Proactive reminders disabled by user"],
                blocked=True,
                block_reason="Proactive reminders are disabled by the user.",
            )

        # 3. Anti-Spam & Existing Reminders Inspection
        active_reminders = [
            r for r in input_data.existing_reminders
            if r.status in ["scheduled", "snoozed"]
        ]

        # Check for snoozed reminder in effect
        recent_snoozes = [r for r in active_reminders if r.status == "snoozed" and r.snooze_until and r.snooze_until > now]
        if recent_snoozes:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=recent_snoozes[0].snooze_until,
                reason="A reminder for this task is currently snoozed and scheduled to wake automatically.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=["Active snooze period in progress"],
                blocked=True,
                block_reason="Task has an active snoozed reminder.",
            )

        # Check maximum reminder threshold per task
        if len(input_data.existing_reminders) >= self.MAX_PROACTIVE_REMINDERS_PER_TASK:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=None,
                reason="Maximum reminder limit reached for this task to prevent notification fatigue.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=["Anti-spam: maximum reminders limit reached"],
                blocked=True,
                block_reason="Maximum proactive reminder limit reached.",
            )

        # 4. Overdue Task Handling
        is_overdue = input_data.due_at and input_data.due_at < now
        if is_overdue:
            decision_factors.append("Task is past due date")
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=True,
                intervention_level="ESCALATION",
                recommended_time=now + timedelta(minutes=15),
                reason="Task is overdue and requires immediate attention.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=decision_factors,
                delivery_channels=["banner", "desktop"],
            )

        # 5. Risk-Based Decision Rules
        # LOW RISK: Do not proactively interrupt unless manual
        if input_data.risk_level == "LOW" or input_data.risk_score < 30:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=None,
                reason="Forgetfulness risk is low. Proactive intervention is not needed.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=["Risk score is low (< 30)"],
            )

        # 6. Timing Calculation for MEDIUM and HIGH risk tasks
        rec_time, timing_factors = self._calculate_recommended_time(
            due_at=input_data.due_at,
            risk_level=input_data.risk_level,
            risk_score=input_data.risk_score,
            priority=input_data.priority,
            prefs=prefs,
            now=now,
            associated_event_time=input_data.associated_event_time,
            personalized_lead_time_minutes=input_data.personalized_lead_time_minutes,
        )
        decision_factors.extend(timing_factors)

        # Validate that calculated time is in the future
        if not rec_time or rec_time <= now:
            return ReminderDecision(
                task_id=input_data.task_id,
                should_remind=False,
                intervention_level="NONE",
                recommended_time=None,
                reason="No valid future reminder window could be scheduled prior to deadline.",
                risk_level=input_data.risk_level,
                risk_score=input_data.risk_score,
                decision_factors=["Calculated reminder time is in the past or deadline too close"],
                blocked=True,
                block_reason="No future reminder time available.",
            )

        # Check duplicate proximity with existing active reminders (within MIN_SPACING_HOURS)
        for ex in active_reminders:
            delta = abs((ex.remind_at - rec_time).total_seconds()) / 3600.0
            if delta < self.MIN_SPACING_HOURS:
                return ReminderDecision(
                    task_id=input_data.task_id,
                    should_remind=False,
                    intervention_level="NONE",
                    recommended_time=ex.remind_at,
                    reason="An appropriate active reminder is already scheduled near this time window.",
                    risk_level=input_data.risk_level,
                    risk_score=input_data.risk_score,
                    decision_factors=["Existing active reminder covers this window"],
                    blocked=True,
                    block_reason="Duplicate reminder avoidance.",
                )

        # 7. Final Intervention Level
        intervention_level = "PROACTIVE" if input_data.risk_level == "HIGH" else "LOW_NUDGE"
        reason = (
            f"High forgetfulness risk ({input_data.risk_score}/100) and an approaching deadline make a proactive reminder appropriate."
            if input_data.risk_level == "HIGH"
            else f"Elevated risk ({input_data.risk_score}/100) warrants a focused preparation reminder."
        )

        return ReminderDecision(
            task_id=input_data.task_id,
            should_remind=True,
            intervention_level=intervention_level,
            recommended_time=rec_time,
            reason=reason,
            risk_level=input_data.risk_level,
            risk_score=input_data.risk_score,
            decision_factors=decision_factors,
            delivery_channels=prefs.preferred_channels,
        )

    def _calculate_recommended_time(
        self,
        due_at: Optional[datetime],
        risk_level: str,
        risk_score: int,
        priority: str,
        prefs: UserReminderPreferences,
        now: datetime,
        associated_event_time: Optional[datetime] = None,
        personalized_lead_time_minutes: Optional[int] = None,
    ) -> Tuple[Optional[datetime], List[str]]:
        factors = []

        # Effective deadline: if an associated event exists, preparation must happen before it
        effective_deadline = due_at
        if associated_event_time:
            if not effective_deadline or associated_event_time < effective_deadline:
                effective_deadline = associated_event_time
                factors.append("Timeline aligned with associated upcoming calendar event")

        if not effective_deadline:
            # If no due date, schedule for tomorrow morning outside quiet hours
            candidate = (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
            factors.append("No deadline specified; scheduled for default morning focus block")
            return self._adjust_for_quiet_hours(candidate, prefs), factors

        # Deadline proximity lead-time calculation
        time_to_due = (effective_deadline - now).total_seconds() / 3600.0

        if time_to_due <= 1.0:
            # Under 1 hour to deadline: immediate reminder with 10m buffer
            candidate = now + timedelta(minutes=10)
            factors.append("Deadline is imminent (< 1 hour)")
        elif time_to_due <= 4.0:
            # 1 to 4 hours: remind 45 mins before deadline
            candidate = effective_deadline - timedelta(minutes=prefs.buffer_minutes)
            factors.append(f"Critical window: reminder scheduled {prefs.buffer_minutes}m before deadline")
        elif personalized_lead_time_minutes and personalized_lead_time_minutes > 0 and (time_to_due * 60.0) > personalized_lead_time_minutes:
            # Phase 12 Personalized Lead Time Gate: Apply verified behavioral lead time (e.g. 6h instead of 2h)
            custom_delta = timedelta(minutes=personalized_lead_time_minutes)
            candidate = effective_deadline - custom_delta
            if candidate > now:
                hours_str = f"{personalized_lead_time_minutes // 60}h" if personalized_lead_time_minutes % 60 == 0 else f"{personalized_lead_time_minutes}m"
                factors.append(f"Personalized lead time applied ({hours_str} preparation buffer based on demonstrated patterns)")
            else:
                lead_hours = 3.0 if (risk_level == "HIGH" or priority in ["high", "urgent"]) else 2.0
                candidate = effective_deadline - timedelta(hours=lead_hours)
                factors.append(f"Due within 24 hours: lead time set to {int(lead_hours)}h prior to deadline")
        elif time_to_due <= 24.0:
            # Due today/within 24h:
            # If high risk or urgent, remind 3 hours prior; else 2 hours prior
            lead_hours = 3.0 if (risk_level == "HIGH" or priority in ["high", "urgent"]) else 2.0
            candidate = effective_deadline - timedelta(hours=lead_hours)
            factors.append(f"Due within 24 hours: lead time set to {int(lead_hours)}h prior to deadline")
        elif time_to_due <= 48.0:
            # Due tomorrow (e.g. 10 AM tomorrow):
            # Remind the evening before (around 7:30 PM) to allow preparation
            evening_before = (effective_deadline - timedelta(days=1)).replace(hour=19, minute=30, second=0, microsecond=0)
            candidate = evening_before if evening_before > now else effective_deadline - timedelta(hours=3)
            factors.append("Due tomorrow: scheduled for preparation window the evening prior")
        else:
            # Due in several days: remind 24 hours prior to deadline
            candidate = effective_deadline - timedelta(days=1)
            factors.append("Distant deadline: scheduled initial preparation reminder 24h prior")

        # Quiet hours adjustment
        adjusted_time = self._adjust_for_quiet_hours(candidate, prefs, due_at=effective_deadline)
        if adjusted_time != candidate:
            factors.append("Adjusted to avoid user quiet hours")

        return adjusted_time, factors

    def _adjust_for_quiet_hours(
        self,
        candidate_dt: datetime,
        prefs: UserReminderPreferences,
        due_at: Optional[datetime] = None,
    ) -> datetime:
        """Move reminder out of quiet hours window if enabled."""
        if not prefs.quiet_hours_on:
            return candidate_dt

        cand_time = candidate_dt.time()
        start = prefs.quiet_start
        end = prefs.quiet_end

        in_quiet = False
        if start > end:
            # Crosses midnight (e.g. 22:00 to 08:00)
            in_quiet = cand_time >= start or cand_time < end
        else:
            in_quiet = start <= cand_time < end

        if in_quiet:
            new_date = candidate_dt.date()
            if cand_time >= start:
                # Late night, bump to tomorrow morning
                new_date = new_date + timedelta(days=1)
            adjusted_morning = datetime.combine(
                new_date,
                time(end.hour, (end.minute + 15) % 60),
                tzinfo=candidate_dt.tzinfo
            )
            # If the morning adjustment would exceed or equal the due date,
            # schedule before quiet hours begins (e.g. 30 mins before quiet_start)
            if due_at and adjusted_morning >= due_at:
                eve_date = candidate_dt.date()
                if cand_time < end:
                    # Early morning in quiet window; evening was previous day
                    eve_date = eve_date - timedelta(days=1)
                adjusted_evening = datetime.combine(
                    eve_date,
                    start,
                    tzinfo=candidate_dt.tzinfo
                ) - timedelta(minutes=30)
                return adjusted_evening

            return adjusted_morning

        return candidate_dt
