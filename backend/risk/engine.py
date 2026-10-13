from datetime import datetime, timezone
from typing import List, Tuple
from .models import TaskRiskInput, RiskAssessment, RiskFactor, UserTaskHistory
from .constants import (
    BASE_SCORE,
    DEADLINE_WEIGHT_OVERDUE,
    DEADLINE_WEIGHT_CRITICAL_HOURS,
    DEADLINE_WEIGHT_TODAY,
    DEADLINE_WEIGHT_TOMORROW,
    DEADLINE_WEIGHT_THIS_WEEK,
    DEADLINE_WEIGHT_FAR,
    PRIORITY_WEIGHT_URGENT,
    PRIORITY_WEIGHT_HIGH,
    PRIORITY_WEIGHT_MEDIUM,
    PRIORITY_WEIGHT_LOW,
    PRIORITY_FLOOR_URGENT,
    PRIORITY_FLOOR_HIGH,
    POSTPONE_WEIGHT_PER_INCIDENT,
    POSTPONE_MAX_CONTRIBUTION,
    MISS_WEIGHT_PER_INCIDENT,
    MISS_MAX_CONTRIBUTION,
    PREP_ITEM_WEIGHT,
    PREP_MAX_CONTRIBUTION,
    THRESHOLD_LOW_MAX,
    THRESHOLD_MEDIUM_MAX,
    SUFFICIENCY_MIN_RECORDS_MODERATE,
    SUFFICIENCY_MIN_RECORDS_SUFFICIENT,
)

class ForgetfulnessRiskEngine:
    """
    Deterministic Cognitive Defense Engine.
    Evaluates forgetfulness risk scores (0-100) using transparent, rule-based heuristics.
    Does NOT invoke LLMs to invent numbers.
    """

    def calculate_risk(self, task_input: TaskRiskInput) -> RiskAssessment:
        # 1. Check if task is already completed
        if task_input.status.lower() in ["done", "completed"]:
            return RiskAssessment(
                task_id=task_input.task_id,
                score=0,
                level="LOW",
                factors=[],
                explanation="Task is already marked completed. Active forgetfulness risk is zero.",
                confidence="high",
                data_sufficiency="sufficient",
            )

        now = task_input.evaluated_at or datetime.now(timezone.utc)
        if task_input.due_at and task_input.due_at.tzinfo is None:
            now = now.replace(tzinfo=None)

        factors: List[RiskFactor] = []
        raw_score = BASE_SCORE

        # 2. Deadline Proximity Signal
        deadline_impact, deadline_desc = self._evaluate_deadline(task_input.due_at, now)
        if deadline_impact > 0:
            factors.append(
                RiskFactor(name="deadline_proximity", impact=deadline_impact, description=deadline_desc)
            )
            raw_score += deadline_impact

        # 3. Priority Signal
        priority_impact, priority_desc = self._evaluate_priority(task_input.priority)
        if priority_impact > 0:
            factors.append(
                RiskFactor(name="priority", impact=priority_impact, description=priority_desc)
            )
            raw_score += priority_impact

        # 4. Preparation Complexity Signal
        prep_impact, prep_desc = self._evaluate_preparation(task_input.preparation_items_count)
        if prep_impact > 0:
            factors.append(
                RiskFactor(name="preparation_complexity", impact=prep_impact, description=prep_desc)
            )
            raw_score += prep_impact

        # 5. User Behavioral History Signals
        history = task_input.user_history or UserTaskHistory()
        sufficiency, confidence = self._evaluate_data_sufficiency(history)

        postpone_impact, postpone_desc = self._evaluate_postponements(history)
        if postpone_impact > 0:
            factors.append(
                RiskFactor(name="previous_postponements", impact=postpone_impact, description=postpone_desc)
            )
            raw_score += postpone_impact

        miss_impact, miss_desc = self._evaluate_misses(history)
        if miss_impact > 0:
            factors.append(
                RiskFactor(name="previous_misses", impact=miss_impact, description=miss_desc)
            )
            raw_score += miss_impact

        # 5b. Event Proximity Signal (from Context Awareness Layer)
        if task_input.has_associated_event:
            # If an associated event is pending and task is preparation, boost attention without double-counting deadline
            event_impact = 10 if task_input.event_imminent else 5
            event_desc = (
                "Task is associated with an imminent upcoming calendar event"
                if task_input.event_imminent
                else "Task is associated with a scheduled calendar event"
            )
            factors.append(
                RiskFactor(name="event_context", impact=event_impact, description=event_desc)
            )
            raw_score += event_impact

        # 6. Normalize score
        clamped_score = max(0, min(100, raw_score))

        # 6b. Apply Priority Safety Floor (Guaranteed Attention for High & Urgent tasks)
        pri_lower = task_input.priority.lower()
        if pri_lower == "urgent" and clamped_score < PRIORITY_FLOOR_URGENT:
            floor_gap = PRIORITY_FLOOR_URGENT - clamped_score
            factors.append(
                RiskFactor(
                    name="priority_safety_floor",
                    impact=floor_gap,
                    description="Guaranteed attention safety floor applied: Urgent commitments cannot fall below High/Critical tier."
                )
            )
            clamped_score = PRIORITY_FLOOR_URGENT
        elif pri_lower == "high" and clamped_score < PRIORITY_FLOOR_HIGH:
            floor_gap = PRIORITY_FLOOR_HIGH - clamped_score
            factors.append(
                RiskFactor(
                    name="priority_safety_floor",
                    impact=floor_gap,
                    description="Guaranteed attention safety floor applied: High-priority commitments cannot fall below High tier."
                )
            )
            clamped_score = PRIORITY_FLOOR_HIGH

        # 7. Categorical Risk Tier
        if clamped_score <= THRESHOLD_LOW_MAX:
            level = "LOW"
        elif clamped_score <= THRESHOLD_MEDIUM_MAX:
            level = "MEDIUM"
        else:
            level = "HIGH"

        # 8. Deterministic Explanation Synthesis
        explanation = self._synthesize_explanation(level, factors, sufficiency)

        return RiskAssessment(
            task_id=task_input.task_id,
            score=clamped_score,
            level=level,
            factors=factors,
            explanation=explanation,
            confidence=confidence,
            data_sufficiency=sufficiency,
        )

    def _evaluate_deadline(self, due_at: datetime, now: datetime) -> Tuple[int, str]:
        if not due_at:
            return 0, "No deadline was set for this task."

        delta_seconds = (due_at - now).total_seconds()
        delta_hours = delta_seconds / 3600.0

        if delta_seconds < 0:
            hours_overdue = abs(int(delta_hours))
            return (
                DEADLINE_WEIGHT_OVERDUE,
                f"Task is overdue by approximately {hours_overdue} hours.",
            )
        elif delta_hours <= 4.0:
            return (
                DEADLINE_WEIGHT_CRITICAL_HOURS,
                "Deadline is approaching within a critical 4-hour window.",
            )
        elif delta_hours <= 24.0:
            return (
                DEADLINE_WEIGHT_TODAY,
                "Task is due within the next 24 hours.",
            )
        elif delta_hours <= 48.0:
            return (
                DEADLINE_WEIGHT_TOMORROW,
                "Task is due tomorrow (within 48 hours).",
            )
        elif delta_hours <= 168.0:
            return (
                DEADLINE_WEIGHT_THIS_WEEK,
                "Task is due within the next 7 days.",
            )
        else:
            return (
                DEADLINE_WEIGHT_FAR,
                "Deadline is more than a week away.",
            )

    def _evaluate_priority(self, priority: str) -> Tuple[int, str]:
        p = priority.lower()
        if p == "urgent":
            return PRIORITY_WEIGHT_URGENT, "Marked as urgent priority requiring immediate cognitive focus."
        elif p == "high":
            return PRIORITY_WEIGHT_HIGH, "Marked as high priority, elevating importance."
        elif p == "medium":
            return PRIORITY_WEIGHT_MEDIUM, "Standard medium priority task."
        return PRIORITY_WEIGHT_LOW, "Low priority task."

    def _evaluate_preparation(self, item_count: int) -> Tuple[int, str]:
        if item_count <= 0:
            return 0, ""
        impact = min(PREP_MAX_CONTRIBUTION, item_count * PREP_ITEM_WEIGHT)
        return (
            impact,
            f"Requires {item_count} physical or digital preparation items before execution.",
        )

    def _evaluate_postponements(self, history: UserTaskHistory) -> Tuple[int, str]:
        total_postpones = history.similar_tasks_postponed + (history.total_reminders_snoozed // 2)
        if total_postpones <= 0:
            return 0, ""
        impact = min(POSTPONE_MAX_CONTRIBUTION, total_postpones * POSTPONE_WEIGHT_PER_INCIDENT)
        return (
            impact,
            f"User has previously postponed or snoozed similar commitments {total_postpones} time(s).",
        )

    def _evaluate_misses(self, history: UserTaskHistory) -> Tuple[int, str]:
        total_misses = history.similar_tasks_missed + history.total_tasks_overdue
        if total_misses <= 0:
            return 0, ""
        impact = min(MISS_MAX_CONTRIBUTION, total_misses * MISS_WEIGHT_PER_INCIDENT)
        return (
            impact,
            f"Historical record indicates {total_misses} similar missed or delayed task completion(s).",
        )

    def _evaluate_data_sufficiency(self, history: UserTaskHistory) -> Tuple[str, str]:
        total_records = (
            history.total_tasks_completed
            + history.total_tasks_overdue
            + history.total_reminders_snoozed
        )
        if total_records < SUFFICIENCY_MIN_RECORDS_MODERATE:
            return "limited", "low"
        elif total_records < SUFFICIENCY_MIN_RECORDS_SUFFICIENT:
            return "moderate", "medium"
        return "sufficient", "high"

    def _synthesize_explanation(
        self, level: str, factors: List[RiskFactor], sufficiency: str
    ) -> str:
        reasons = [f.description for f in factors if f.impact > 0]

        if not reasons:
            lead = f"This task has a {level.lower()} forgetfulness risk."
        else:
            lead = f"This task has a {level} forgetfulness risk due to {len(reasons)} contributing factor(s): " + "; ".join(reasons)

        if sufficiency == "limited":
            lead += " Note: ReMind has limited historical behavior for your profile; this assessment is based primarily on deadline and priority parameters."
        return lead
