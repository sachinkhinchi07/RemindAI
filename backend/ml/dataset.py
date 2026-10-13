from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
from .models import DatasetReadinessReport, TaskRiskFeatureVector
from .features import extract_features
from backend.risk.models import TaskRiskInput, UserTaskHistory

MIN_SAMPLES_REQUIRED = 50
MIN_POSITIVE_SAMPLES = 10
MIN_NEGATIVE_SAMPLES = 10

def evaluate_ml_readiness(
    labeled_samples: List[Dict[str, Any]],
) -> DatasetReadinessReport:
    """
    Evaluates whether real behavioral data is statistically sufficient to train and deploy an ML model.
    Enforces the 'ML must earn its place' criterion.
    """
    total = len(labeled_samples)
    if total == 0:
        return DatasetReadinessReport(
            is_ready=False,
            status="ML_NOT_ADOPTED",
            total_samples=0,
            positive_samples=0,
            negative_samples=0,
            positive_ratio=0.0,
            reason="Zero historical labeled tasks found in behavioral dataset. Rule-based baseline preserved.",
        )

    positives = sum(1 for s in labeled_samples if s.get("label") == 1)
    negatives = sum(1 for s in labeled_samples if s.get("label") == 0)
    pos_ratio = positives / total if total > 0 else 0.0

    if total < MIN_SAMPLES_REQUIRED:
        reason = (
            f"Sample size ({total}) is below statistical minimum threshold of {MIN_SAMPLES_REQUIRED}. "
            "Insufficient real behavioral evidence to support machine learning without risk of overfitting."
        )
        return DatasetReadinessReport(
            is_ready=False,
            status="ML_NOT_ADOPTED",
            total_samples=total,
            positive_samples=positives,
            negative_samples=negatives,
            positive_ratio=pos_ratio,
            reason=reason,
        )

    if positives < MIN_POSITIVE_SAMPLES or negatives < MIN_NEGATIVE_SAMPLES:
        reason = (
            f"Severe class imbalance: {positives} positive (at-risk/missed) and {negatives} negative (on-time) samples. "
            f"Requires at least {MIN_POSITIVE_SAMPLES} samples in each class."
        )
        return DatasetReadinessReport(
            is_ready=False,
            status="ML_NOT_ADOPTED",
            total_samples=total,
            positive_samples=positives,
            negative_samples=negatives,
            positive_ratio=pos_ratio,
            reason=reason,
        )

    return DatasetReadinessReport(
        is_ready=True,
        status="ML_ADOPTED",
        total_samples=total,
        positive_samples=positives,
        negative_samples=negatives,
        positive_ratio=pos_ratio,
        reason="Dataset meets all statistical rigor thresholds. Sufficient behavioral observations for ML evaluation.",
    )

def build_labeled_example(
    task: Dict[str, Any],
    label: int,
    evaluated_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Constructs a labeled training row from task metadata and outcome.
    Ensures that features are extracted strictly as of evaluated_at (before resolution).
    """
    due = task.get("due_at")
    if isinstance(due, str):
        due = datetime.fromisoformat(due.replace("Z", "+00:00"))

    eval_time = evaluated_at or task.get("created_at")
    if isinstance(eval_time, str):
        eval_time = datetime.fromisoformat(eval_time.replace("Z", "+00:00"))

    risk_input = TaskRiskInput(
        task_id=str(task.get("id")),
        title=task.get("title", "Untitled"),
        status="pending",  # Status at prediction time was pending
        priority=task.get("priority", "medium").lower(),
        due_at=due,
        is_routine=bool(task.get("is_routine", False)),
        preparation_items_count=len(task.get("tags") or []),
        evaluated_at=eval_time,
    )

    feature_vec = extract_features(risk_input, evaluation_time=eval_time)
    return {
        "task_id": task.get("id"),
        "features": feature_vec.to_list(),
        "label": label,
        "timestamp": eval_time.isoformat() if eval_time else datetime.utcnow().isoformat(),
    }
