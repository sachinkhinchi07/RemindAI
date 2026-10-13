from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional
from datetime import datetime, timezone

from backend.risk import (
    ForgetfulnessRiskEngine,
    TaskRiskInput,
    RiskAssessment,
    UserTaskHistory,
)
from backend.schemas.task_understanding import (
    TaskParseRequest,
    ParsedTaskResponse,
)
from backend.services.task_understanding import TaskUnderstandingService
from backend.ai import (
    AIService,
    get_ai_service,
    ProviderUnavailableError,
    ModelUnavailableError,
    AIRequestTimeoutError,
    InvalidResponseError,
    MalformedStructuredOutputError,
    AIServiceError,
)
from backend.ml import MLRiskPredictor, evaluate_ml_readiness, DatasetReadinessReport
from backend.config import ai_settings

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])

_ml_predictor = MLRiskPredictor()

def get_risk_engine() -> MLRiskPredictor:
    return _ml_predictor

def get_task_understanding_service(
    ai_service: AIService = Depends(get_ai_service),
) -> TaskUnderstandingService:
    return TaskUnderstandingService(ai_service=ai_service)



@router.post("/parse", response_model=ParsedTaskResponse)
async def parse_natural_language_task(
    request: TaskParseRequest,
    authorization: Optional[str] = Header(None),
    service: TaskUnderstandingService = Depends(get_task_understanding_service),
):
    """Parse a user's natural language task statement into structured, validated attributes."""
    try:
        parsed = await service.parse_task(request)
        return parsed
    except ProviderUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"ReMind AI Engine is temporarily offline: {exc}",
        )
    except ModelUnavailableError as exc:
        raise HTTPException(
            status_code=404,
            detail="The configured AI extraction model is unavailable.",
        )
    except AIRequestTimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="AI task parsing timed out.",
        )
    except (MalformedStructuredOutputError, InvalidResponseError) as exc:
        raise HTTPException(
            status_code=422,
            detail="ReMind couldn't understand that task description clearly.",
        )
    except AIServiceError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"AI Service processing error: {exc}",
        )


@router.post("/risk/assess", response_model=RiskAssessment)
async def assess_task_risk(
    task_input: TaskRiskInput,
    authorization: Optional[str] = Header(None),
    engine: ForgetfulnessRiskEngine = Depends(get_risk_engine),
):
    """
    Phase 5 Risk Assessment API:
    Calculates deterministic forgetfulness risk score, level, contributing factors, and explanation.
    """
    return engine.calculate_risk(task_input)
    
@router.get("/risk/ml-status")
async def get_ml_risk_status(
    authorization: Optional[str] = Header(None),
    predictor: MLRiskPredictor = Depends(get_risk_engine),
):
    """
    Phase 13 ML Status & Readiness API:
    Reports whether ML risk estimation is active, current feature flag, and dataset readiness gate.
    """
    readiness = evaluate_ml_readiness([])  # Evaluates current in-memory behavioral readiness
    return {
        "ml_risk_enabled": ai_settings.ml_risk_enabled,
        "is_ml_active": predictor.is_ml_active,
        "active_prediction_source": "ML" if predictor.is_ml_active else "RULE_BASED",
        "dataset_readiness": readiness.model_dump(),
    }



from backend.schemas.risk_batch import BatchRiskAssessRequest, BatchRiskAssessResponse

@router.post("/risk/batch-assess", response_model=BatchRiskAssessResponse)
async def batch_assess_tasks_risk(
    batch_req: BatchRiskAssessRequest,
    authorization: Optional[str] = Header(None),
    engine: ForgetfulnessRiskEngine = Depends(get_risk_engine),
):
    """
    Phase 6 Batch Risk Assessment API:
    Evaluates multiple tasks in one call for high-performance Predictions & Dashboard views.
    Sorts assessments in descending order of risk score (HIGH -> MEDIUM -> LOW).
    """
    assessments = []
    high_count = 0
    med_count = 0
    low_count = 0

    for t in batch_req.tasks:
        if batch_req.user_history and not t.user_history:
            t.user_history = batch_req.user_history
        result = engine.calculate_risk(t)
        assessments.append(result)
        if result.level == "HIGH":
            high_count += 1
        elif result.level == "MEDIUM":
            med_count += 1
        else:
            low_count += 1

    # Order assessments by score descending
    assessments.sort(key=lambda x: x.score, reverse=True)

    return BatchRiskAssessResponse(
        assessments=assessments,
        total_evaluated=len(assessments),
        high_risk_count=high_count,
        medium_risk_count=med_count,
        low_risk_count=low_count,
    )


from backend.reminders import ReminderDecisionEngine, ReminderDecisionInput, ReminderDecision

def get_reminder_decision_engine() -> ReminderDecisionEngine:
    return ReminderDecisionEngine()

@router.post("/reminder-decision", response_model=ReminderDecision)
async def evaluate_task_reminder_decision(
    decision_input: ReminderDecisionInput,
    authorization: Optional[str] = Header(None),
    engine: ReminderDecisionEngine = Depends(get_reminder_decision_engine),
):
    """
    Phase 7 Reminder Decision API:
    Determines whether, when, and how a proactive reminder should be scheduled.
    Enforces quiet hours, anti-spam thresholds, and duplicate reminder suppression.
    """
    return engine.evaluate_decision(decision_input)


