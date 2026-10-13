# ReMind AI: Phase 13 Machine Learning Risk Prediction Upgrade

## Executive Summary

- **Adoption Decision**: `ML NOT ADOPTED` (Production baseline remains deterministic `ForgetfulnessRiskEngine`)
- **Reason**: The system is operating in a clean / zero-history environment where real labeled user behavioral task outcomes are below the statistical minimum threshold ($N < 50$, with at least 10 in each class).
- **Core Principle Maintained**: *"ML must earn its place."* We do not fabricate synthetic behavioral data or present unverified models as real user intelligence.
- **Pipeline Status**: Complete, fully tested, reproducible ML pipeline and fallback infrastructure deployed in `backend/ml/`.

---

## Architecture Overview

```
                      +-----------------------------+
                      |   Task / Context / Profile   |
                      +--------------+--------------+
                                     |
                                     v
                      +-----------------------------+
                      | Temporal Feature Extractor  |
                      |   (Zero Data Leakage)       |
                      +--------------+--------------+
                                     |
                                     v
                       [ ML Feature Flag Active? ]
                               /           \
                           No /             \ Yes
                             /               \
                            v                 v
           +--------------------+     +---------------------+
           | Deterministic Risk |     | Interpretable       |
           | Engine (Baseline)  |     | Logistic Regression |
           +---------+----------+     +----------+----------+
                     |                           |
                     |      [ Sufficiency Gate ] |
                     |      (Limited / Moderate) |
                     \                           /
                      \                         /
                       v                       v
                      +-------------------------+
                      |     Hybrid Predictor    |
                      |  (Safe Fallback Wrapper)|
                      +------------+------------+
                                   |
                                   v
                      +-------------------------+
                      |     RiskAssessment      |
                      | (Score, Factors, Tier)  |
                      +-------------------------+
```

---

## Key Modules

1. **`backend/ml/models.py`**:
   - `TaskRiskFeatureVector`: 14 strictly temporal numerical features.
   - `DatasetReadinessReport`: Statistical readiness evaluation contract.
   - `ModelMetrics` & `ModelEvaluationComparison`: Cross-validated performance and comparison against rule-based heuristic.

2. **`backend/ml/features.py`**:
   - Extracts features strictly as of `evaluated_at` (before resolution):
     - `priority_level` (1.0 to 4.0)
     - `hours_until_deadline` (signed, bounded)
     - `has_deadline`, `is_routine`, `prep_items_count`
     - `has_associated_event`, `event_imminent`
     - Historical counters (`completed`, `overdue`, `snoozed`, `postponed`, `missed`)
     - Personalized `category_postpone_rate`
     - `data_sufficiency_score`

3. **`backend/ml/dataset.py`**:
   - `evaluate_ml_readiness`: Enforces minimum $50$ labeled samples and at least $10$ per class.

4. **`backend/ml/pipeline.py`**:
   - Scaled `LogisticRegression` pipeline using `StandardScaler` and balanced class weighting.
   - Evaluates on temporal hold-out split against rule baseline.
   - Computes interpretable feature importances.

5. **`backend/ml/predictor.py`**:
   - `MLRiskPredictor`: Seamless fallback wrapper.
   - Returns deterministic results when `ml_risk_enabled=False` or model is unavailable.
   - Blends predictions via cold-start safety gating (`HYBRID`).

---

## Verification & Status

- **Full Test Suite**: 118/118 passing tests (`pytest backend/tests/`).
- **Frontend Build**: Zero errors (`npm run build`).
- **System Readiness**: **READY FOR PHASE 14**.
