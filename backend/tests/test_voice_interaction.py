import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.voice.service import VoiceGestureService
from backend.voice.models import (
    VoiceTranscriptionRequest,
    VoiceActionResponse,
    GestureActionRequest,
    GestureActionResponse,
)
from backend.agent.store import TaskStoreAdapter
from backend.agent.orchestrator import AgentOrchestrator
from backend.agent.tools.base import ToolExecutionContext
from backend.reminders import ReminderDecisionEngine, ReminderDecisionInput

client = TestClient(app)

NOW = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def voice_setup():
    task_store = TaskStoreAdapter()
    user_id = "user_voice_test"

    tasks = [
        {
            "id": "t_pres",
            "user_id": user_id,
            "title": "Prepare Project Presentation",
            "priority": "high",
            "status": "pending",
            "due_at": (NOW + timedelta(hours=24)).isoformat(),
            "is_routine": False,
            "tags": ["laptop", "slides"],
        }
    ]
    task_store.seed_user_data(user_id, tasks=tasks)
    agent_orch = AgentOrchestrator()
    service = VoiceGestureService(
        agent_orchestrator=agent_orch,
        task_store=task_store,
    )
    return service, task_store, user_id


# --- 1. Voice Task Completion Tests ---

def test_voice_task_completion(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    req = VoiceTranscriptionRequest(transcript="I have completed my presentation task")
    resp = run_async(service.process_voice_command(req, ctx))

    assert resp.action_type == "task_completed"
    assert "completed" in resp.spoken_confirmation.lower()

    # Verify task state in store is now done
    task = run_async(task_store.get_task_by_id(user_id, "t_pres"))
    assert task["status"] == "done"


# --- 2. Completed Task Suppresses Future Reminders ---

def test_completed_task_suppresses_reminders(voice_setup):
    _, task_store, user_id = voice_setup
    # Task is completed
    run_async(task_store.update_task(user_id, "t_pres", {"status": "done"}))

    reminder_engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        task_id="t_pres",
        title="Prepare Project Presentation",
        status="done",
        risk_score=80,
        risk_level="HIGH",
    )
    decision = reminder_engine.evaluate_decision(inp)

    assert decision.should_remind is False
    assert decision.blocked is True
    assert "completed" in decision.block_reason.lower()


# --- 3. Voice Snooze Tests ---

def test_voice_snooze_reminder(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    req = VoiceTranscriptionRequest(transcript="Snooze this reminder for 30 minutes")
    resp = run_async(service.process_voice_command(req, ctx))

    assert resp.action_type == "reminder_snoozed"
    assert "30 minutes" in resp.spoken_confirmation

    # Check reminder store for snoozed record
    reminders = run_async(task_store.get_reminders_for_task(user_id, "t_pres"))
    assert len(reminders) >= 1
    assert reminders[0]["status"] == "snoozed"


# --- 4. Voice Dismissal Tests ---

def test_voice_dismiss_reminder(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    req = VoiceTranscriptionRequest(transcript="Dismiss this reminder")
    resp = run_async(service.process_voice_command(req, ctx))

    assert resp.action_type == "reminder_dismissed"
    assert "dismissed" in resp.spoken_confirmation.lower()

    # Verify task status is still pending (dismissal is distinct from completion)
    task = run_async(task_store.get_task_by_id(user_id, "t_pres"))
    assert task["status"] == "pending"


# --- 5. Voice Agent Queries ---

def test_voice_agent_highest_risk_query(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    req = VoiceTranscriptionRequest(transcript="What might I forget today?")
    resp = run_async(service.process_voice_command(req, ctx))

    assert resp.action_type == "agent_response"
    assert "Prepare Project Presentation" in resp.text_message
    assert len(resp.spoken_confirmation) > 0


# --- 6. Gesture Interaction & Safety Tests ---

def test_gesture_thumbs_up_completes_task(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    # Valid thumbs up with high confidence
    req = GestureActionRequest(gesture_name="thumbs_up", confidence=0.92, target_task_id="t_pres")
    resp = run_async(service.process_gesture_action(req, ctx))

    assert resp.accepted is True
    assert resp.action_executed == "task_completed"
    task = run_async(task_store.get_task_by_id(user_id, "t_pres"))
    assert task["status"] == "done"


def test_gesture_low_confidence_rejected(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    # Low confidence gesture (0.45 < 0.70 threshold)
    req = GestureActionRequest(gesture_name="thumbs_up", confidence=0.45, target_task_id="t_pres")
    resp = run_async(service.process_gesture_action(req, ctx))

    assert resp.accepted is False
    assert "ignored" in resp.message.lower()


def test_gesture_open_palm_dismisses(voice_setup):
    service, task_store, user_id = voice_setup
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    req = GestureActionRequest(gesture_name="open_palm", confidence=0.88)
    resp = run_async(service.process_gesture_action(req, ctx))

    assert resp.accepted is True
    assert resp.action_executed == "reminder_dismissed"


# --- 7. Security & User Isolation ---

def test_gesture_unauthorized_cross_user_rejection(voice_setup):
    service, task_store, user_id = voice_setup
    # User B tries to complete User A's task
    ctx_b = ToolExecutionContext(user_id="user_b", data_store=task_store)

    req = GestureActionRequest(gesture_name="thumbs_up", confidence=0.95, target_task_id="t_pres")
    resp = run_async(service.process_gesture_action(req, ctx_b))

    assert resp.accepted is False
    assert "unauthorized" in resp.message.lower() or "not found" in resp.message.lower()


# --- 8. API Endpoints Tests ---

def test_api_voice_command_endpoint():
    res = client.post("/api/voice/command", json={
        "transcript": "What might I forget today?",
    })
    assert res.status_code == 200
    data = res.json()
    assert "action_type" in data
    assert "spoken_confirmation" in data
    assert "text_message" in data


def test_api_gesture_action_endpoint():
    res = client.post("/api/voice/gesture", json={
        "gesture_name": "open_palm",
        "confidence": 0.85,
    })
    assert res.status_code == 200
    data = res.json()
    assert data["accepted"] is True
    assert data["action_executed"] == "reminder_dismissed"
