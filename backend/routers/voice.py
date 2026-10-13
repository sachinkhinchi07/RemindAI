from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional
import logging

from backend.voice.models import (
    VoiceTranscriptionRequest,
    VoiceActionResponse,
    GestureActionRequest,
    GestureActionResponse,
)
from backend.voice.service import VoiceGestureService
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.store import default_task_store
from backend.agent.orchestrator import AgentOrchestrator
from backend.services.task_understanding import TaskUnderstandingService
from backend.ai import AIService, get_ai_service

logger = logging.getLogger("remind.voice.router")

router = APIRouter(prefix="/api/voice", tags=["Voice & Multimodal"])


def get_voice_service(ai_service: AIService = Depends(get_ai_service)) -> VoiceGestureService:
    task_understanding = TaskUnderstandingService(ai_service=ai_service)
    agent_orch = AgentOrchestrator(ai_service=ai_service)
    return VoiceGestureService(
        task_understanding_service=task_understanding,
        agent_orchestrator=agent_orch,
        task_store=default_task_store,
    )


@router.post("/command", response_model=VoiceActionResponse)
async def process_voice_command_endpoint(
    request: VoiceTranscriptionRequest,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    service: VoiceGestureService = Depends(get_voice_service),
):
    """
    Pre-Phase 10 Voice Interaction Endpoint:
    Receives transcribed voice speech, determines action (create task, complete task, snooze,
    agent query), and returns verified data with a spoken response string for Text-to-Speech.
    """
    effective_user_id = x_user_id or "demo_user"
    context = ToolExecutionContext(
        user_id=effective_user_id,
        auth_token=authorization,
        data_store=default_task_store,
    )

    try:
        response = await service.process_voice_command(request, context)
        return response
    except Exception as exc:
        logger.exception("Error processing voice command")
        raise HTTPException(
            status_code=500,
            detail=f"Voice processing failed: {str(exc)}",
        )


@router.post("/gesture", response_model=GestureActionResponse)
async def process_gesture_action_endpoint(
    request: GestureActionRequest,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    service: VoiceGestureService = Depends(get_voice_service),
):
    """
    Pre-Phase 10 Gesture Interaction Endpoint:
    Safely executes normalized camera/vision gestures with confidence filtering.
    """
    effective_user_id = x_user_id or "demo_user"
    context = ToolExecutionContext(
        user_id=effective_user_id,
        auth_token=authorization,
        data_store=default_task_store,
    )

    try:
        response = await service.process_gesture_action(request, context)
        return response
    except Exception as exc:
        logger.exception("Error processing gesture action")
        raise HTTPException(
            status_code=500,
            detail=f"Gesture action failed: {str(exc)}",
        )
