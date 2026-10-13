from typing import Optional, List, TYPE_CHECKING, Any
from datetime import datetime, timezone
from backend.risk.models import TaskRiskInput, UserTaskHistory
from .models import TaskRiskFeatureVector, FEATURE_NAMES

if TYPE_CHECKING:
    from backend.personalization.models import PersonalizationProfile

def extract_features(
    task_input: TaskRiskInput,
    profile: Optional[Any] = None,
    evaluation_time: Optional[datetime] = None,
) -> TaskRiskFeatureVector:
    """
    Extracts an interpretable numerical feature vector for a task.
    Enforces a strict temporal boundary: ONLY features available at or before evaluation_time are extracted.
    Zero future information (e.g. completion timestamp, future feedback) is accessed.
    """
    eval_time = evaluation_time or task_input.evaluated_at or datetime.now(timezone.utc)
    if eval_time.tzinfo is not None and task_input.due_at and task_input.due_at.tzinfo is None:
        eval_time = eval_time.replace(tzinfo=None)
    elif eval_time.tzinfo is None and task_input.due_at and task_input.due_at.tzinfo is not None:
        eval_time = eval_time.replace(tzinfo=timezone.utc)

    # 1. Priority numeric mapping
    priority_map = {
        "low": 1.0,
        "medium": 2.0,
        "high": 3.0,
        "urgent": 4.0,
    }
    priority_level = priority_map.get(task_input.priority.lower(), 2.0)

    # 2. Deadline proximity (hours)
    if task_input.due_at is not None:
        has_deadline = 1.0
        delta_seconds = (task_input.due_at - eval_time).total_seconds()
        hours_until_deadline = delta_seconds / 3600.0
        # Bound extreme values between -168 (1 week overdue) and 720 (30 days in future)
        hours_until_deadline = max(-168.0, min(720.0, hours_until_deadline))
    else:
        has_deadline = 0.0
        # If no deadline, assign a neutral default (e.g., 72 hours)
        hours_until_deadline = 72.0

    # 3. Routine and preparation signals
    is_routine = 1.0 if task_input.is_routine else 0.0
    prep_items_count = float(max(0, task_input.preparation_items_count))

    # 4. Contextual event association
    has_associated_event = 1.0 if task_input.has_associated_event else 0.0
    event_imminent = 1.0 if task_input.event_imminent else 0.0

    # 5. User Behavioral History signals
    hist: UserTaskHistory = task_input.user_history or UserTaskHistory()
    hist_completed_count = float(hist.total_tasks_completed)
    hist_overdue_count = float(hist.total_tasks_overdue)
    hist_snoozed_count = float(hist.total_reminders_snoozed)
    hist_postponed_count = float(hist.similar_tasks_postponed)
    hist_missed_count = float(hist.similar_tasks_missed)

    # 6. Personalization profile signals
    category_postpone_rate = 0.0
    if profile:
        rates = getattr(profile, "category_postponement_rates", None)
        if isinstance(rates, dict):
            title_lower = task_input.title.lower()
            for cat, rate in rates.items():
                if cat.lower() in title_lower:
                    category_postpone_rate = float(rate)
                    break

    # 7. Data sufficiency score
    total_records = hist_completed_count + hist_overdue_count + hist_snoozed_count
    if total_records >= 10:
        sufficiency_score = 1.0  # sufficient
    elif total_records >= 3:
        sufficiency_score = 0.5  # moderate
    else:
        sufficiency_score = 0.0  # limited

    return TaskRiskFeatureVector(
        priority_level=priority_level,
        hours_until_deadline=hours_until_deadline,
        has_deadline=has_deadline,
        is_routine=is_routine,
        prep_items_count=prep_items_count,
        has_associated_event=has_associated_event,
        event_imminent=event_imminent,
        hist_completed_count=hist_completed_count,
        hist_overdue_count=hist_overdue_count,
        hist_snoozed_count=hist_snoozed_count,
        hist_postponed_count=hist_postponed_count,
        hist_missed_count=hist_missed_count,
        category_postpone_rate=category_postpone_rate,
        data_sufficiency_score=sufficiency_score,
    )

def feature_names() -> List[str]:
    return list(FEATURE_NAMES)
