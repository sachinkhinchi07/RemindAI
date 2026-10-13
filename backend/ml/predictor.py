from typing import Optional, List, Any
import os
import joblib
from datetime import datetime, timezone
from backend.config import ai_settings
from backend.risk.models import TaskRiskInput, RiskAssessment, RiskFactor
from backend.risk.engine import ForgetfulnessRiskEngine
from .features import extract_features, feature_names
from .models import TaskRiskFeatureVector

DEFAULT_MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "artifacts", "risk_model_v1.joblib"
)

class MLRiskPredictor:
    """
    ML-augmented Risk Predictor.
    Integrates an interpretable ML model with the deterministic ForgetfulnessRiskEngine.
    Follows strict safety principles:
    - If ml_risk_enabled is False, immediately routes to deterministic engine.
    - If model artifact is not available, fails safely to deterministic engine.
    - If user behavioral history is limited, gracefully blends or falls back to rule heuristics.
    """

    def __init__(
        self,
        rule_engine: Optional[ForgetfulnessRiskEngine] = None,
        model_path: Optional[str] = None,
    ):
        self.rule_engine = rule_engine or ForgetfulnessRiskEngine()
        self.model_path = model_path or DEFAULT_MODEL_PATH
        self._model = None
        self._load_model()

    def _load_model(self) -> None:
        if os.path.exists(self.model_path):
            try:
                self._model = joblib.load(self.model_path)
            except Exception:
                self._model = None
        else:
            self._model = None

    @property
    def is_ml_active(self) -> bool:
        """Indicates if ML scoring is enabled and model artifact is loaded."""
        return bool(ai_settings.ml_risk_enabled and self._model is not None)

    def calculate_risk(
        self,
        task_input: TaskRiskInput,
        profile: Optional[Any] = None,
    ) -> RiskAssessment:
        """
        Calculates risk assessment for a task.
        Safely falls back to deterministic rule engine if ML is unadopted or disabled.
        """
        # Always return 0 risk for completed tasks
        if task_input.status.lower() in ["done", "completed"]:
            return self.rule_engine.calculate_risk(task_input)

        # Baseline rule assessment
        rule_assessment = self.rule_engine.calculate_risk(task_input)

        if not self.is_ml_active:
            # Deterministic baseline preserved
            return rule_assessment

        try:
            # Extract features with strict temporal boundary
            features = extract_features(task_input, profile=profile)
            X = [features.to_list()]

            # Predict probability of forgetfulness
            proba = float(self._model.predict_proba(X)[0][1])
            ml_score = int(round(proba * 100))

            # Calibrated Hybrid Blending based on data sufficiency
            sufficiency = rule_assessment.data_sufficiency
            if sufficiency == "limited":
                # Cold-start safety: 80% rule-based, 20% ML
                final_score = int(round(0.8 * rule_assessment.score + 0.2 * ml_score))
                source = "HYBRID"
            elif sufficiency == "moderate":
                # Moderate data: 40% rule-based, 60% ML
                final_score = int(round(0.4 * rule_assessment.score + 0.6 * ml_score))
                source = "HYBRID"
            else:
                # Sufficient behavioral data: 100% ML
                final_score = ml_score
                source = "ML"

            final_score = max(0, min(100, final_score))

            if final_score <= 35:
                level = "LOW"
            elif final_score <= 70:
                level = "MEDIUM"
            else:
                level = "HIGH"

            # Explainable ML factor attribution
            names = feature_names()
            factors: List[RiskFactor] = []
            if hasattr(self._model, "named_steps") and "classifier" in self._model.named_steps:
                coefs = self._model.named_steps["classifier"].coef_[0]
                feat_vals = features.to_list()
                contributions = []
                for name, coef, val in zip(names, coefs, feat_vals):
                    impact = coef * val
                    if impact > 0.1:
                        contributions.append((name, impact))

                contributions.sort(key=lambda x: x[1], reverse=True)
                for name, imp in contributions[:3]:
                    factors.append(
                        RiskFactor(
                            name=f"ml_{name}",
                            impact=int(min(30, max(5, round(imp * 10)))),
                            description=f"Model identified elevated risk signal from {name.replace('_', ' ')}.",
                        )
                    )

            if not factors:
                factors = rule_assessment.factors

            explanation = (
                f"Assessed via {source} prediction model (v1.0) with risk score {final_score}/100 ({level}). "
                f"Baseline rule score: {rule_assessment.score}."
            )

            return RiskAssessment(
                task_id=task_input.task_id,
                score=final_score,
                level=level,
                factors=factors,
                explanation=explanation,
                confidence=rule_assessment.confidence,
                data_sufficiency=sufficiency,
                prediction_source=source,
                model_version="v1.0",
            )
        except Exception:
            # Absolute fallback guarantee: if any prediction failure occurs, return rule assessment
            return rule_assessment
