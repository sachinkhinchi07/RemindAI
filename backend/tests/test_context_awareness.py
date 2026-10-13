import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.context import (
    ContextService,
    NormalizedUserContext,
    ContextualEvent,
    ContextualRoutine,
    MemoryCalendarContextProvider,
    MemoryRoutineContextProvider,
)
from backend.agent.store import TaskStoreAdapter
from backend.risk import ForgetfulnessRiskEngine, TaskRiskInput
from backend.reminders import ReminderDecisionEngine, ReminderDecisionInput
from backend.agent.orchestrator import AgentOrchestrator
from backend.agent.models import AgentChatRequest
from backend.agent.tools.base import ToolExecutionContext

client = TestClient(app)

NOW = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def context_setup():
    task_store = TaskStoreAdapter()
    cal_provider = MemoryCalendarContextProvider()
    routine_provider = MemoryRoutineContextProvider()

    user_id = "user_context_test"

    # Seed task: "Prepare presentation slides"
    tasks = [
        {
            "id": "t_prep",
            "user_id": user_id,
            "title": "Prepare presentation slides",
            "priority": "high",
            "status": "pending",
            "due_at": (NOW + timedelta(hours=24)).isoformat(),  # Tomorrow 10:00 AM
            "is_routine": False,
            "tags": ["laptop", "slides"],
        },
        {
            "id": "t_unrelated",
            "user_id": user_id,
            "title": "Buy groceries",
            "priority": "low",
            "status": "pending",
            "due_at": (NOW + timedelta(days=3)).isoformat(),
            "is_routine": False,
            "tags": [],
        },
    ]
    task_store.seed_user_data(user_id, tasks=tasks)

    # Seed calendar event: "Presentation" tomorrow at 10 AM
    events = [
        ContextualEvent(
            id="ev_pres",
            title="Presentation",
            start_time=NOW + timedelta(hours=24),
            end_time=NOW + timedelta(hours=25),
            location="Room 402",
            source="calendar",
        )
    ]
    cal_provider.seed_events(user_id, events)

    # Seed routine: "Morning College Routine"
    routines = [
        ContextualRoutine(
            id="rt_morning",
            title="Morning College Setup",
            typical_time="08:45",
            preparation_items=["Laptop", "Charger"],
        )
    ]
    routine_provider.seed_routines(user_id, routines)

    svc = ContextService(
        task_store=task_store,
        calendar_provider=cal_provider,
        routine_provider=routine_provider,
    )

    return svc, task_store, cal_provider, routine_provider, user_id


# --- 1. Basic Context & Normalization Tests ---

def test_normalized_context_retrieval(context_setup):
    svc, _, _, _, user_id = context_setup
    ctx = run_async(svc.get_normalized_context(user_id))

    assert ctx.user_id == user_id
    assert ctx.data_quality == "SUFFICIENT"
    assert "tasks" in ctx.data_sources
    assert "calendar" in ctx.data_sources
    assert "routines" in ctx.data_sources
    assert len(ctx.upcoming_events) == 1
    assert ctx.upcoming_events[0].title == "Presentation"
    assert len(ctx.routines) == 1


# --- 2. Relationship Matching Tests ---

def test_deterministic_task_event_relationship(context_setup):
    svc, _, _, _, user_id = context_setup
    ctx = run_async(svc.get_normalized_context(user_id))

    assert len(ctx.relationships) >= 1
    prep_rel = next((r for r in ctx.relationships if r.task_id == "t_prep"), None)
    assert prep_rel is not None
    assert prep_rel.relationship_type == "preparation_for"
    assert prep_rel.event_id == "ev_pres"
    assert prep_rel.confidence == "HIGH"

    # Unrelated task should NOT be related to Presentation
    unrelated_rel = next((r for r in ctx.relationships if r.task_id == "t_unrelated"), None)
    assert unrelated_rel is None


# --- 3. Missing Context & Safe Fallbacks ---

def test_missing_calendar_context():
    task_store = TaskStoreAdapter()
    cal_provider = MemoryCalendarContextProvider()
    user_id = "user_no_calendar"
    cal_provider.set_available(user_id, False)

    task_store.seed_user_data(user_id, tasks=[{"id": "t1", "user_id": user_id, "title": "Independent Task"}])
    svc = ContextService(task_store=task_store, calendar_provider=cal_provider)

    ctx = run_async(svc.get_normalized_context(user_id))
    assert ctx.calendar_connected is False
    assert len(ctx.upcoming_events) == 0
    assert ctx.data_quality == "LIMITED"


# --- 4. Conflict Detection Tests ---

def test_conflict_detection():
    task_store = TaskStoreAdapter()
    cal_provider = MemoryCalendarContextProvider()
    user_id = "user_conflict"

    # Task deadline is 12:00 PM (AFTER event start of 10:00 AM)
    tasks = [
        {
            "id": "t_late_prep",
            "user_id": user_id,
            "title": "Prepare presentation slides",
            "due_at": (NOW + timedelta(hours=26)).isoformat(),  # 12:00 PM
        }
    ]
    task_store.seed_user_data(user_id, tasks=tasks)

    events = [
        ContextualEvent(
            id="ev_early",
            title="Presentation",
            start_time=NOW + timedelta(hours=24),  # 10:00 AM
        )
    ]
    cal_provider.seed_events(user_id, events)

    svc = ContextService(task_store=task_store, calendar_provider=cal_provider)
    ctx = run_async(svc.get_normalized_context(user_id))

    assert len(ctx.conflicts) == 1
    conflict = ctx.conflicts[0]
    assert conflict.conflict_type == "time_mismatch"
    assert conflict.task_id == "t_late_prep"
    assert conflict.event_id == "ev_early"


# --- 5. Risk Engine Context Integration ---

def test_risk_engine_context_boost():
    risk_engine = ForgetfulnessRiskEngine()

    # Standard task without event
    task_without_event = TaskRiskInput(
        title="Prepare presentation slides",
        priority="high",
        due_at=NOW + timedelta(hours=24),
        has_associated_event=False,
        evaluated_at=NOW,
    )
    res1 = risk_engine.calculate_risk(task_without_event)

    # Task WITH imminent event
    task_with_event = TaskRiskInput(
        title="Prepare presentation slides",
        priority="high",
        due_at=NOW + timedelta(hours=24),
        has_associated_event=True,
        event_imminent=True,
        evaluated_at=NOW,
    )
    res2 = risk_engine.calculate_risk(task_with_event)

    assert res2.score > res1.score
    event_factor = next((f for f in res2.factors if f.name == "event_context"), None)
    assert event_factor is not None
    assert event_factor.impact == 10


# --- 6. Reminder Decision Engine Context Integration ---

def test_reminder_engine_context_event_alignment():
    reminder_engine = ReminderDecisionEngine()

    inp = ReminderDecisionInput(
        title="Prepare presentation slides",
        priority="high",
        due_at=None,  # No explicit deadline
        associated_event_time=NOW + timedelta(hours=24),  # Event is in 24 hours
        risk_score=75,
        risk_level="HIGH",
        current_time=NOW,
    )
    res = reminder_engine.evaluate_decision(inp)

    assert res.should_remind is True
    assert res.recommended_time is not None
    # Recommended time must be BEFORE the event
    assert res.recommended_time < inp.associated_event_time
    assert any("calendar event" in f.lower() for f in res.decision_factors)


# --- 7. Agent Context Integration (Demo Scenario) ---

def test_agent_prepare_tomorrow_with_context(context_setup):
    svc, task_store, cal_provider, _, user_id = context_setup
    orchestrator = AgentOrchestrator()

    # Context with attached context_service
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)
    ctx.context_service = svc  # type: ignore

    req = AgentChatRequest(message="What should I prepare for tomorrow?")
    resp = run_async(orchestrator.run(req, ctx))

    assert resp.intent == "prepare_tomorrow"
    assert "Presentation" in resp.message
    assert "Prepare presentation slides" in resp.message
    assert "get_upcoming_events" in resp.tool_calls


# --- 8. Security & User Isolation ---

def test_context_user_isolation(context_setup):
    svc, _, _, _, user_a = context_setup
    user_b = "user_stranger"

    ctx_b = run_async(svc.get_normalized_context(user_b))
    assert ctx_b.user_id == user_b
    assert ctx_b.tasks_count == 0
    assert len(ctx_b.upcoming_events) == 0
    assert len(ctx_b.routines) == 0


# --- 9. API Endpoint Test ---

def test_api_context_upcoming():
    res = client.get("/api/context/upcoming", headers={"x-user-id": "demo_user"})
    assert res.status_code == 200
    data = res.json()
    assert "user_id" in data
    assert "data_quality" in data
    assert "data_sources" in data
    assert "upcoming_events" in data
