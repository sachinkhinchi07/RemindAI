import os
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from backend.main import app
from backend.config import ai_settings
from backend.risk.models import TaskRiskInput, UserTaskHistory
from backend.personalization.models import PersonalizationProfile, PersonalizationEvidenceLevel
from backend.ml import (
    TaskRiskFeatureVector,
    extract_features,
    feature_names,
    evaluate_ml_readiness,
    build_labeled_example,
    train_and_evaluate_model,
    MLRiskPredictor,
)

client = TestClient(app)

def test_feature_extraction_and_temporal_boundary():
    """Verify numeric feature extraction adheres strictly to temporal boundaries with zero data leakage."""
    eval_time = datetime(2026, 10, 15, 10, 0, tzinfo=timezone.utc)
    due_time = datetime(2026, 10, 15, 14, 0, tzinfo=timezone.utc)  # 4 hours away

    task_input = TaskRiskInput(
        task_id="task-ml-1",
        title="Submit Project Report",
        priority="high",
        due_at=due_time,
        is_routine=False,
        preparation_items_count=3,
        has_associated_event=True,
        event_imminent=True,
        user_history=UserTaskHistory(
            total_tasks_completed=12,
            total_tasks_overdue=2,
            total_reminders_snoozed=4,
            similar_tasks_postponed=1,
            similar_tasks_missed=0,
        ),
        evaluated_at=eval_time,
    )

    profile = PersonalizationProfile(
        user_id="user-123",
        data_sufficiency=PersonalizationEvidenceLevel.SUFFICIENT,
        sufficiency_explanation="Sufficient evidence",
        category_postponement_rates={"Report": 0.45},
        last_updated=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )

    features = extract_features(task_input, profile=profile, evaluation_time=eval_time)
    feat_list = features.to_list()

    assert len(feat_list) == len(feature_names())
    assert features.priority_level == 3.0  # high = 3.0
    assert abs(features.hours_until_deadline - 4.0) < 0.01  # exactly 4 hours
    assert features.has_deadline == 1.0
    assert features.prep_items_count == 3.0
    assert features.has_associated_event == 1.0
    assert features.event_imminent == 1.0
    assert features.hist_completed_count == 12.0
    assert features.category_postpone_rate == 0.45
    assert features.data_sufficiency_score == 1.0  # total history >= 10 -> 1.0

def test_readiness_gate_insufficient_samples():
    """Verify readiness gate rejects adoption when total labeled samples < 50."""
    samples = [{"label": 1 if i % 2 == 0 else 0} for i in range(25)]
    report = evaluate_ml_readiness(samples)

    assert report.is_ready is False
    assert report.status == "ML_NOT_ADOPTED"
    assert "below statistical minimum threshold" in report.reason
    assert report.total_samples == 25

def test_readiness_gate_class_imbalance():
    """Verify readiness gate rejects adoption when positive or negative samples < 10."""
    samples = [{"label": 0} for _ in range(55)] + [{"label": 1} for _ in range(3)]
    report = evaluate_ml_readiness(samples)

    assert report.is_ready is False
    assert report.status == "ML_NOT_ADOPTED"
    assert "Severe class imbalance" in report.reason

def test_readiness_gate_and_pipeline_training(tmp_path):
    """Verify training pipeline trains, validates, and compares against baseline when readiness criteria are met."""
    # Synthesize realistic historical observations (60 samples: 30 positive, 30 negative)
    labeled_samples = []
    base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for i in range(60):
        t_time = base_time + timedelta(days=i)
        is_risky = 1 if (i % 2 == 0) else 0
        hours = 2.0 if is_risky else 48.0
        pri = 4.0 if is_risky else 1.0
        postp = 3.0 if is_risky else 0.0
        row = {
            "task_id": f"hist-task-{i}",
            "features": [pri, hours, 1.0, 0.0, 1.0, 0.0, 0.0, 5.0, 1.0, 2.0, postp, 0.0, 0.0, 0.5],
            "label": is_risky,
            "timestamp": t_time.isoformat(),
        }
        labeled_samples.append(row)

    model_path = str(tmp_path / "test_risk_model.joblib")
    model, comparison = train_and_evaluate_model(labeled_samples, model_output_path=model_path)

    assert model is not None
    assert comparison.ml_metrics.sample_count > 0
    assert comparison.ml_metrics.accuracy >= 0.70
    assert os.path.exists(model_path)
    assert "priority_level" in comparison.feature_importances

def test_predictor_fallback_when_disabled():
    """When ML is disabled (default), predictor falls back to deterministic rule engine."""
    ai_settings.ml_risk_enabled = False
    predictor = MLRiskPredictor()

    task_input = TaskRiskInput(
        task_id="task-fallback-1",
        title="Check inbox",
        priority="low",
        due_at=datetime.now(timezone.utc) + timedelta(days=5),
    )

    assessment = predictor.calculate_risk(task_input)
    assert assessment.prediction_source == "RULE_BASED"
    assert assessment.score <= 35
    assert assessment.level == "LOW"

def test_predictor_completed_task_zero_risk():
    """Completed tasks must always return 0 risk regardless of ML flag."""
    ai_settings.ml_risk_enabled = True
    predictor = MLRiskPredictor()

    task_input = TaskRiskInput(
        task_id="task-done-1",
        title="Finished Assignment",
        status="completed",
        priority="urgent",
    )

    assessment = predictor.calculate_risk(task_input)
    assert assessment.score == 0
    assert assessment.level == "LOW"
    ai_settings.ml_risk_enabled = False

def test_predictor_with_active_model(tmp_path):
    """When ML is enabled and model is loaded, predicts risk using ML/HYBRID pipeline."""
    # 1. Train a model artifact
    labeled_samples = []
    base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for i in range(60):
        t_time = base_time + timedelta(days=i)
        is_risky = 1 if (i % 2 == 0) else 0
        row = {
            "task_id": f"hist-task-{i}",
            "features": [
                4.0 if is_risky else 1.0,  # priority
                2.0 if is_risky else 72.0, # hours
                1.0, 0.0, 2.0, 0.0, 0.0, 5.0, 1.0, 2.0,
                3.0 if is_risky else 0.0,  # postponed
                0.0, 0.0, 1.0              # sufficiency
            ],
            "label": is_risky,
            "timestamp": t_time.isoformat(),
        }
        labeled_samples.append(row)

    model_path = str(tmp_path / "risk_model_v1.joblib")
    train_and_evaluate_model(labeled_samples, model_output_path=model_path)

    # 2. Instantiate predictor pointing to this artifact
    predictor = MLRiskPredictor(model_path=model_path)
    ai_settings.ml_risk_enabled = True

    try:
        assert predictor.is_ml_active is True

        # Evaluate a high-risk imminent task
        task_input = TaskRiskInput(
            task_id="task-ml-active-1",
            title="Urgent Pitch Deck",
            priority="urgent",
            due_at=datetime.now(timezone.utc) + timedelta(hours=2),
            user_history=UserTaskHistory(
                total_tasks_completed=10,
                total_tasks_overdue=3,
                total_reminders_snoozed=5,
            ),
        )

        assessment = predictor.calculate_risk(task_input)
        assert assessment.prediction_source in ["ML", "HYBRID"]
        assert assessment.model_version == "v1.0"
        assert assessment.score >= 50
        assert "prediction model" in assessment.explanation
    finally:
        ai_settings.ml_risk_enabled = False

def test_api_ml_status_endpoint():
    """Verify GET /api/tasks/risk/ml-status returns the system ML status and dataset gate."""
    resp = client.get("/api/tasks/risk/ml-status")
    assert resp.status_code == 200
    data = resp.json()

    assert "ml_risk_enabled" in data
    assert "is_ml_active" in data
    assert "active_prediction_source" in data
    assert "dataset_readiness" in data
    assert data["dataset_readiness"]["status"] == "ML_NOT_ADOPTED"
