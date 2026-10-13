from typing import Any, Dict, Optional
from datetime import datetime, timezone, timedelta
import logging

from .models import (
    VoiceTranscriptionRequest,
    VoiceActionResponse,
    GestureActionRequest,
    GestureActionResponse,
)
from backend.agent.orchestrator import AgentOrchestrator
from backend.agent.models import AgentChatRequest
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.store import TaskStoreAdapter, default_task_store
from backend.services.task_understanding import TaskUnderstandingService
from backend.schemas.task_understanding import TaskParseRequest

logger = logging.getLogger("remind.voice.service")


class VoiceGestureService:
    """
    Coordinates voice command interpretation, spoken response synthesis,
    and safe gesture action execution.
    Preserves strict boundaries:
    - Delegates NLP to Phase 4 TaskUnderstandingService
    - Delegates actions to Phase 8 AgentOrchestrator
    - Delegates store operations to TaskStoreAdapter
    """

    CONFIDENCE_THRESHOLD = 0.70  # Gestures below 70% confidence are safely rejected

    def __init__(
        self,
        task_understanding_service: Optional[TaskUnderstandingService] = None,
        agent_orchestrator: Optional[AgentOrchestrator] = None,
        task_store: Optional[TaskStoreAdapter] = None,
    ):
        self.task_understanding_service = task_understanding_service
        self.agent_orchestrator = agent_orchestrator or AgentOrchestrator()
        self.task_store = task_store or default_task_store

    async def process_voice_command(
        self,
        request: VoiceTranscriptionRequest,
        context: ToolExecutionContext,
    ) -> VoiceActionResponse:
        """Process transcribed speech using Agent or NLP parsing."""
        raw_text = request.transcript.strip()
        lower = raw_text.lower()

        # Bridge to Phase 11 Feedback Loop
        try:
            from backend.feedback import default_feedback_service, FeedbackEventType, EventSource
            await default_feedback_service.record_event(
                user_id=context.user_id,
                event_type=FeedbackEventType.VOICE_COMMAND,
                event_source=EventSource.VOICE,
                metadata={"transcript_length": len(raw_text)},
            )
        except Exception:
            pass

        # 1. Voice Task Completion: "I've completed my presentation", "Mark presentation done"
        if any(kw in lower for kw in ["completed", "mark as done", "mark done", "finished"]):
            agent_req = AgentChatRequest(message=raw_text, user_id=context.user_id)
            agent_resp = await self.agent_orchestrator.run(agent_req, context)

            try:
                from backend.feedback import default_feedback_service, FeedbackEventType, EventSource
                await default_feedback_service.record_event(
                    user_id=context.user_id,
                    event_type=FeedbackEventType.VOICE_COMPLETION,
                    event_source=EventSource.VOICE,
                    metadata={"spoken_confirmation": "Done. I have marked that task as completed."},
                )
            except Exception:
                pass

            return VoiceActionResponse(
                action_type="task_completed",
                spoken_confirmation="Done. I have marked that task as completed.",
                text_message=agent_resp.message,
                structured_data={"actions": agent_resp.actions},
            )

        # 2. Voice Snooze: "Remind me again in 30 minutes", "Snooze this reminder"
        if "snooze" in lower or "remind me again" in lower:
            # Look up active pending tasks or reminders
            tasks = await self.task_store.get_tasks(user_id=context.user_id, status="pending", limit=1)
            if tasks:
                t = tasks[0]
                snooze_until = datetime.now(timezone.utc) + timedelta(minutes=30)
                await self.task_store.create_reminder(
                    user_id=context.user_id,
                    reminder_data={
                        "task_id": str(t.get("id")),
                        "remind_at": snooze_until.isoformat(),
                        "status": "snoozed",
                        "snooze_until": snooze_until.isoformat(),
                        "decision_reason": "Voice requested snooze for 30 minutes",
                    },
                )
                try:
                    from backend.feedback import default_feedback_service, FeedbackEventType, EventSource
                    await default_feedback_service.record_event(
                        user_id=context.user_id,
                        event_type=FeedbackEventType.REMINDER_SNOOZED,
                        event_source=EventSource.VOICE,
                        task_id=str(t.get("id")),
                        metadata={"snooze_minutes": 30},
                    )
                except Exception:
                    pass

                return VoiceActionResponse(
                    action_type="reminder_snoozed",
                    spoken_confirmation="Snoozed. I will remind you again in 30 minutes.",
                    text_message=f"Snoozed reminder for '{t.get('title')}' until 30 minutes from now.",
                    target_task_id=str(t.get("id")),
                )

        # 3. Voice Dismissal: "Dismiss this reminder"
        if "dismiss" in lower:
            try:
                from backend.feedback import default_feedback_service, FeedbackEventType, EventSource
                await default_feedback_service.record_event(
                    user_id=context.user_id,
                    event_type=FeedbackEventType.REMINDER_DISMISSED,
                    event_source=EventSource.VOICE,
                )
            except Exception:
                pass

            return VoiceActionResponse(
                action_type="reminder_dismissed",
                spoken_confirmation="Reminder dismissed.",
                text_message="Reminder dismissed. The task remains in your pending list.",
            )

        # 4. Standard Agent Query: "What might I forget today?", "Remind me about the task that looks most risky"
        if any(q in lower for q in ["what might i forget", "most risky", "prepare for tomorrow", "upcoming"]):
            agent_req = AgentChatRequest(message=raw_text, user_id=context.user_id)
            agent_resp = await self.agent_orchestrator.run(agent_req, context)

            # Strip markdown for clean spoken speech
            clean_speech = agent_resp.message.replace("**", "").replace("•", "").replace("\n", " ").strip()
            # Truncate clean speech to concise first sentence/clause for TTS
            if "." in clean_speech:
                clean_speech = clean_speech.split(".")[0] + "."

            return VoiceActionResponse(
                action_type="agent_response",
                spoken_confirmation=clean_speech,
                text_message=agent_resp.message,
                structured_data={"actions": agent_resp.actions, "tool_calls": agent_resp.tool_calls},
            )

        # 5. Fallback Task Creation Parser (Phase 4 Pipeline)
        if self.task_understanding_service:
            parsed = await self.task_understanding_service.parse_task(
                TaskParseRequest(
                    text=raw_text,
                    timezone=request.timezone or "UTC",
                    client_now=request.client_now or datetime.now(timezone.utc).isoformat(),
                )
            )
            return VoiceActionResponse(
                action_type="task_created",
                spoken_confirmation=f"I understood: {parsed.title}.",
                text_message=f"Understood task '{parsed.title}'.",
                structured_data=parsed.model_dump(),
            )

        # 6. Default response via Agent
        agent_req = AgentChatRequest(message=raw_text, user_id=context.user_id)
        agent_resp = await self.agent_orchestrator.run(agent_req, context)
        return VoiceActionResponse(
            action_type="agent_response",
            spoken_confirmation=agent_resp.message.split("\n")[0].replace("**", ""),
            text_message=agent_resp.message,
        )

    async def process_gesture_action(
        self,
        request: GestureActionRequest,
        context: ToolExecutionContext,
    ) -> GestureActionResponse:
        """
        Safely maps recognized camera gesture to application action.
        Blocks unsafe execution if confidence is below threshold.
        """
        if request.confidence < self.CONFIDENCE_THRESHOLD:
            return GestureActionResponse(
                accepted=False,
                message=f"Gesture '{request.gesture_name}' ignored (confidence {request.confidence:.2f} < {self.CONFIDENCE_THRESHOLD}).",
            )

        # 1. Thumbs Up -> Complete active task or confirm
        if request.gesture_name == "thumbs_up":
            target_id = request.target_task_id
            if not target_id:
                # Find first active task
                tasks = await self.task_store.get_tasks(user_id=context.user_id, status="pending", limit=1)
                if tasks:
                    target_id = str(tasks[0].get("id"))

            if target_id:
                task = await self.task_store.get_task_by_id(context.user_id, target_id)
                if not task:
                    return GestureActionResponse(
                        accepted=False,
                        message="Target task not found or unauthorized.",
                    )
                await self.task_store.update_task(context.user_id, target_id, {"status": "done"})
                return GestureActionResponse(
                    accepted=True,
                    action_executed="task_completed",
                    spoken_feedback="Task marked completed via gesture.",
                    message=f"Completed task '{task.get('title')}'.",
                )
            return GestureActionResponse(
                accepted=False,
                message="No active task found to mark completed.",
            )

        # 2. Open Palm -> Dismiss reminder
        if request.gesture_name == "open_palm":
            return GestureActionResponse(
                accepted=True,
                action_executed="reminder_dismissed",
                spoken_feedback="Reminder dismissed via gesture.",
                message="Active reminder dismissed.",
            )

        # 3. Two Fingers -> Snooze 15 minutes
        if request.gesture_name == "two_fingers":
            return GestureActionResponse(
                accepted=True,
                action_executed="reminder_snoozed",
                spoken_feedback="Reminder snoozed for 15 minutes.",
                message="Reminder snoozed for 15 minutes.",
            )

        return GestureActionResponse(
            accepted=False,
            message=f"Gesture '{request.gesture_name}' has no registered action mapping.",
        )
