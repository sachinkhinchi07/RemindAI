from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class TaskRiskFeatureVector(BaseModel):
    """
    Interpretable numeric feature representation for a task at prediction time.
    Strictly contains ONLY features observable prior to the prediction point (zero future leakage).
    """
    priority_level: float = Field(..., description="Numeric priority: low=1, medium=2, high=3, urgent=4")
    hours_until_deadline: float = Field(..., description="Signed hours until due date (negative if overdue)")
    has_deadline: float = Field(..., description="Binary indicator: 1.0 if deadline is set, else 0.0")
    is_routine: float = Field(..., description="Binary indicator: 1.0 if marked routine")
    prep_items_count: float = Field(..., description="Count of required preparation items or tags")
    has_associated_event: float = Field(..., description="Binary indicator: 1.0 if linked to a calendar event")
    event_imminent: float = Field(..., description="Binary indicator: 1.0 if event is within 4 hours")
    hist_completed_count: float = Field(..., description="User past completed tasks count")
    hist_overdue_count: float = Field(..., description="User past overdue tasks count")
    hist_snoozed_count: float = Field(..., description="User past snoozed reminders count")
    hist_postponed_count: float = Field(..., description="User past similar postponed tasks count")
    hist_missed_count: float = Field(..., description="User past similar missed tasks count")
    category_postpone_rate: float = Field(default=0.0, description="Personalized category postponement rate [0.0, 1.0]")
    data_sufficiency_score: float = Field(default=0.0, description="0.0 (limited), 0.5 (moderate), 1.0 (sufficient)")

    def to_list(self) -> List[float]:
        return [
            self.priority_level,
            self.hours_until_deadline,
            self.has_deadline,
            self.is_routine,
            self.prep_items_count,
            self.has_associated_event,
            self.event_imminent,
            self.hist_completed_count,
            self.hist_overdue_count,
            self.hist_snoozed_count,
            self.hist_postponed_count,
            self.hist_missed_count,
            self.category_postpone_rate,
            self.data_sufficiency_score,
        ]

FEATURE_NAMES = [
    "priority_level",
    "hours_until_deadline",
    "has_deadline",
    "is_routine",
    "prep_items_count",
    "has_associated_event",
    "event_imminent",
    "hist_completed_count",
    "hist_overdue_count",
    "hist_snoozed_count",
    "hist_postponed_count",
    "hist_missed_count",
    "category_postpone_rate",
    "data_sufficiency_score",
]

class DatasetReadinessReport(BaseModel):
    """Assessment of whether historical data satisfies statistical criteria for ML adoption."""
    is_ready: bool
    status: Literal["ML_ADOPTED", "ML_NOT_ADOPTED"]
    total_samples: int
    positive_samples: int
    negative_samples: int
    positive_ratio: float
    reason: str
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)

class ModelMetrics(BaseModel):
    """Performance metrics on a reserved temporal test partition."""
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: Optional[float] = None
    sample_count: int

class ModelEvaluationComparison(BaseModel):
    """Side-by-side comparison between candidate ML model and Rule-Based baseline."""
    ml_metrics: ModelMetrics
    rule_based_metrics: ModelMetrics
    adoption_recommended: bool
    summary: str
    feature_importances: Dict[str, float] = Field(default_factory=dict)
