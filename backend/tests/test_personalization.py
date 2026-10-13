import asyncio
from datetime import datetime, timezone, timedelta, time
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.personalization import (
    PersonalizationService,
    PersonalizationStoreAdapter,
    PersonalizationEvidenceLevel,
)
from backend.feedback import (
    FeedbackService,
    FeedbackStoreAdapter,
    FeedbackEventType,
    EventSource,
)
from backend.reminders import (
    ReminderDecisionEngine,
    ReminderDecisionInput,
    UserReminderPreferences,
)
from backend.agent.store import TaskStoreAdapter
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.tools.registry import execute_get_personalization_profile, execute_create_reminder
from backend.agent.tools.schemas import GetPersonalizationProfileInput, CreateReminderInput


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def personalization_setup():
    task_store = TaskStoreAdapter()
    fb_store = FeedbackStoreAdapter()
    fb_service = FeedbackService(store=fb_store)
    p_store = PersonalizationStoreAdapter()
    p_service = PersonalizationService(
        store=p_store,
        feedback_service=fb_service,
        task_store=task_store,
    )
    return {
        "task_store": task_store,
        "fb_store": fb_store,
        "fb_service": fb_service,
        "p_store": p_store,
        "p_service": p_service,
    }


def test_new_user_sensible_defaults(personalization_setup):
    p_service = personalization_setup["p_service"]
    user_id = "user_newbie"

    profile = run_async(p_service.get_or_build_profile(user_id))
    assert profile.data_sufficiency == PersonalizationEvidenceLevel.NONE
    assert profile.recommended_lead_time_minutes == 120
    assert len(profile.active_personalization_rules) == 0
    assert "Sensible system defaults" in profile.human_explanations[0]


def test_category_postponement_increases_lead_time(personalization_setup):
    p_service = personalization_setup["p_service"]
    fb_service = personalization_setup["fb_service"]
    task_store = personalization_setup["task_store"]
    user_id = "user_academic_study"

    # Seed 10 academic tasks
    tasks = [
        {"id": f"t_acad_{i}", "title": f"Paper review {i}", "tags": ["academic"]}
        for i in range(10)
    ]
    task_store.seed_user_data(user_id=user_id, tasks=tasks)

    # Record 10 task created events + 6 postponements for academic category
    for i in range(10):
        run_async(fb_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.TASK_CREATED,
            event_source=EventSource.UI,
            task_id=f"t_acad_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(minutes=i),
        ))
    for i in range(6):
        run_async(fb_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.TASK_POSTPONED,
            event_source=EventSource.UI,
            task_id=f"t_acad_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(minutes=15 + i),
        ))

    profile = run_async(p_service.get_or_build_profile(user_id))
    assert profile.data_sufficiency in [PersonalizationEvidenceLevel.MODERATE, PersonalizationEvidenceLevel.SUFFICIENT]
    assert "academic" in profile.category_lead_times_minutes
    # Increased to 360m (6 hours)
    assert profile.category_lead_times_minutes["academic"] == 360
    assert any("CATEGORY_POSTPONEMENT_BUFFER_ACADEMIC" in r for r in profile.active_personalization_rules)


def test_channel_preference_and_user_preference_override(personalization_setup):
    p_service = personalization_setup["p_service"]
    fb_service = personalization_setup["fb_service"]
    task_store = personalization_setup["task_store"]
    user_id = "user_voice_fan"

    # 12 events to reach moderate sufficiency
    for i in range(12):
        run_async(fb_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.VOICE_COMMAND,
            event_source=EventSource.VOICE,
            timestamp=datetime.now(timezone.utc) + timedelta(minutes=i),
        ))

    profile = run_async(p_service.get_or_build_profile(user_id))
    assert "voice" in profile.preferred_notification_channels
    assert any("PREFER_VOICE_RESPONSIVENESS" in r for r in profile.active_personalization_rules)


def test_reminder_fatigue_detection(personalization_setup):
    p_service = personalization_setup["p_service"]
    fb_service = personalization_setup["fb_service"]
    user_id = "user_fatigue_test"

    # Seed 6 notifications delivered, 5 snoozed/dismissed, 0 completed
    for i in range(6):
        run_async(fb_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.NOTIFICATION_DELIVERED,
            event_source=EventSource.SYSTEM,
            task_id=f"t_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(minutes=i * 5),
        ))
        run_async(fb_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.NOTIFICATION_DISMISSED if i % 2 == 0 else FeedbackEventType.NOTIFICATION_SNOOZED,
            event_source=EventSource.UI,
            task_id=f"t_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(minutes=i * 5 + 1),
        ))

    profile = run_async(p_service.get_or_build_profile(user_id))
    assert profile.reminder_fatigue_detected is True
    assert any("REMINDER_FATIGUE_THROTTLE" in r for r in profile.active_personalization_rules)


def test_reminder_decision_engine_with_personalized_lead_time():
    engine = ReminderDecisionEngine()
    now = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)
    due = now + timedelta(hours=10)  # Due in 10 hours

    # 1. Without personalization: default lead time is 3 hours (since high risk)
    input_standard = ReminderDecisionInput(
        task_id="t_std",
        title="Standard Task",
        due_at=due,
        risk_level="HIGH",
        risk_score=75,
        priority="high",
        current_time=now,
    )
    decision_std = engine.evaluate_decision(input_standard)
    assert decision_std.should_remind is True
    # 10 - 3 = 7h from now (17:00)
    assert decision_std.recommended_time == due - timedelta(hours=3)

    # 2. With personalization: category academic has 6h lead time (360m)
    input_pers = ReminderDecisionInput(
        task_id="t_pers",
        title="Academic Task",
        due_at=due,
        risk_level="HIGH",
        risk_score=75,
        priority="high",
        personalized_lead_time_minutes=360,
        current_time=now,
    )
    decision_pers = engine.evaluate_decision(input_pers)
    assert decision_pers.should_remind is True
    # 10 - 6 = 4h from now (14:00)
    assert decision_pers.recommended_time == due - timedelta(hours=6)
    assert any("Personalized lead time applied (6h" in f for f in decision_pers.decision_factors)


def test_agent_get_personalization_profile_tool(personalization_setup):
    task_store = personalization_setup["task_store"]
    user_id = "user_agent_pers"
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    output = run_async(execute_get_personalization_profile(GetPersonalizationProfileInput(), ctx))
    assert output.user_id == user_id
    assert output.recommended_lead_time_minutes == 120
    assert len(output.human_explanations) > 0


def test_reset_personalization_clears_inferred_profile(personalization_setup):
    p_service = personalization_setup["p_service"]
    fb_service = personalization_setup["fb_service"]
    user_id = "user_reset_test"

    # Add events to generate rules
    for i in range(12):
        run_async(fb_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.VOICE_COMMAND,
            event_source=EventSource.VOICE,
            timestamp=datetime.now(timezone.utc) + timedelta(minutes=i),
        ))

    profile_before = run_async(p_service.get_or_build_profile(user_id))
    assert len(profile_before.active_personalization_rules) > 0

    # Reset profile
    res = run_async(p_service.reset_profile(user_id))
    assert res.success is True

    # Profile store is reset to baseline
    profile_after = run_async(p_service.store.get_profile(user_id))
    assert len(profile_after.active_personalization_rules) == 0
    assert profile_after.data_sufficiency == PersonalizationEvidenceLevel.NONE


def test_api_personalization_endpoints():
    client = TestClient(app)
    user_id = "user_api_pers"

    # 1. GET /api/personalization
    res = client.get("/api/personalization", headers={"x-user-id": user_id})
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == user_id
    assert data["recommended_lead_time_minutes"] == 120

    # 2. POST /api/personalization/reset
    res_reset = client.post("/api/personalization/reset", headers={"x-user-id": user_id})
    assert res_reset.status_code == 200
    reset_data = res_reset.json()
    assert reset_data["success"] is True
    assert reset_data["user_id"] == user_id


def test_api_personalization_user_isolation():
    client = TestClient(app)
    user_1 = "user_pers_isolated_1"
    user_2 = "user_pers_isolated_2"

    res1 = client.get("/api/personalization", headers={"x-user-id": user_1})
    res2 = client.get("/api/personalization", headers={"x-user-id": user_2})

    assert res1.json()["user_id"] == user_1
    assert res2.json()["user_id"] == user_2
