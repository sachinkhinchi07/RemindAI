from typing import List, Dict, Any, Tuple, Optional
import os
import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

from .models import ModelMetrics, ModelEvaluationComparison, FEATURE_NAMES
from .dataset import evaluate_ml_readiness

def train_and_evaluate_model(
    labeled_samples: List[Dict[str, Any]],
    model_output_path: Optional[str] = None,
) -> Tuple[Optional[Pipeline], ModelEvaluationComparison]:
    """
    Trains an interpretable, calibrated Logistic Regression model on historical task features.
    Evaluates on a temporal test partition and compares against the deterministic Rule-Based baseline.
    """
    readiness = evaluate_ml_readiness(labeled_samples)
    if not readiness.is_ready:
        empty_metrics = ModelMetrics(
            accuracy=0.0, precision=0.0, recall=0.0, f1_score=0.0, roc_auc=0.0, sample_count=0
        )
        return None, ModelEvaluationComparison(
            ml_metrics=empty_metrics,
            rule_based_metrics=empty_metrics,
            adoption_recommended=False,
            summary=f"Readiness Gate Rejected: {readiness.reason}",
            feature_importances={},
        )

    # Sort temporally by timestamp to prevent temporal data leakage across train/test splits
    sorted_samples = sorted(labeled_samples, key=lambda s: s.get("timestamp", ""))
    X = np.array([s["features"] for s in sorted_samples])
    y = np.array([s["label"] for s in sorted_samples])

    split_idx = int(len(X) * 0.7)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Pipeline: StandardScaler + LogisticRegression (interpretable linear model)
    model = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(max_iter=1000, random_state=42, class_weight="balanced")),
    ])
    model.fit(X_train, y_train)

    # ML Predictions on temporal test set
    y_pred_ml = model.predict(X_test)
    y_proba_ml = model.predict_proba(X_test)[:, 1] if len(model.classes_) > 1 else y_pred_ml.astype(float)

    ml_metrics = ModelMetrics(
        accuracy=float(accuracy_score(y_test, y_pred_ml)),
        precision=float(precision_score(y_test, y_pred_ml, zero_division=0)),
        recall=float(recall_score(y_test, y_pred_ml, zero_division=0)),
        f1_score=float(f1_score(y_test, y_pred_ml, zero_division=0)),
        roc_auc=float(roc_auc_score(y_test, y_proba_ml)) if len(np.unique(y_test)) > 1 else None,
        sample_count=len(y_test),
    )

    # Rule-based baseline heuristic on same test features
    # (Priority level * 15 + (hours <= 24) * 25 + hist_postponed * 10) > 40 threshold
    rule_preds = []
    for row in X_test:
        pri = row[0]  # priority_level (1-4)
        hrs = row[1]  # hours_until_deadline
        postp = row[10] # hist_postponed_count
        score = (pri * 12.0) + (35.0 if hrs <= 24.0 else 10.0) + (postp * 15.0)
        rule_preds.append(1 if score >= 45.0 else 0)

    rule_metrics = ModelMetrics(
        accuracy=float(accuracy_score(y_test, rule_preds)),
        precision=float(precision_score(y_test, rule_preds, zero_division=0)),
        recall=float(recall_score(y_test, rule_preds, zero_division=0)),
        f1_score=float(f1_score(y_test, rule_preds, zero_division=0)),
        roc_auc=None,
        sample_count=len(y_test),
    )

    # Feature weights (coefficients) for transparency
    classifier: LogisticRegression = model.named_steps["classifier"]
    coefs = classifier.coef_[0]
    feature_importances = {name: float(round(w, 4)) for name, w in zip(FEATURE_NAMES, coefs)}

    # Adoption criterion: F1 score must improve or match baseline without severe recall regression
    adoption_recommended = (ml_metrics.f1_score >= rule_metrics.f1_score) and (ml_metrics.recall >= 0.60)
    summary = (
        f"ML F1: {ml_metrics.f1_score:.2f} vs Rule-based F1: {rule_metrics.f1_score:.2f}. "
        f"{'ML qualifies for adoption.' if adoption_recommended else 'Rule-based engine retains higher reliability.'}"
    )

    if model_output_path:
        os.makedirs(os.path.dirname(os.path.abspath(model_output_path)), exist_ok=True)
        joblib.dump(model, model_output_path)

    return model, ModelEvaluationComparison(
        ml_metrics=ml_metrics,
        rule_based_metrics=rule_metrics,
        adoption_recommended=adoption_recommended,
        summary=summary,
        feature_importances=feature_importances,
    )
