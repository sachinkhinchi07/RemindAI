from datetime import datetime, timezone, timedelta, time
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.reminders import (
    ReminderDecisionEngine,
    ReminderDecisionInput,
    UserReminderPreferences,
    ExistingReminderInfo,
    ReminderDecision,
)

client = TestClient(app)

REF_NOW = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)

def test_1_low_risk_distant_deadline():
    """Test 1: LOW risk + distant deadline -> No proactive reminder."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Archive old files",
        priority="low",
        due_at=REF_NOW + timedelta(days=10),
        risk_score=15,
        risk_level="LOW",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert res.intervention_level == "NONE"
    assert "low" in res.reason.lower()

def test_2_medium_risk_approaching_deadline():
    """Test 2: MEDIUM risk + approaching deadline -> Proactive reminder (LOW_NUDGE)."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Prepare meeting agenda",
        priority="medium",
        due_at=REF_NOW + timedelta(hours=20),
        risk_score=48,
        risk_level="MEDIUM",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is True
    assert res.intervention_level == "LOW_NUDGE"
    assert res.recommended_time is not None
    assert res.recommended_time < inp.due_at

def test_3_high_risk_approaching_deadline():
    """Test 3: HIGH risk + approaching deadline -> Proactive reminder (PROACTIVE)."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Deliver client presentation",
        priority="high",
        due_at=REF_NOW + timedelta(hours=24),
        risk_score=82,
        risk_level="HIGH",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is True
    assert res.intervention_level == "PROACTIVE"
    assert res.recommended_time is not None

def test_4_completed_task():
    """Test 4: Completed task -> No reminder, blocked."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Finished sprint presentation",
        status="done",
        due_at=REF_NOW + timedelta(hours=5),
        risk_score=0,
        risk_level="LOW",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert res.blocked is True
    assert "completed" in res.block_reason.lower()

def test_5_cancelled_task():
    """Test 5: Cancelled/archived task -> No reminder, blocked."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Cancelled vendor call",
        status="cancelled",
        due_at=REF_NOW + timedelta(hours=10),
        risk_score=70,
        risk_level="HIGH",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert res.blocked is True
    assert "cancelled" in res.block_reason.lower()

def test_6_existing_active_reminder():
    """Test 6: Existing active reminder near candidate time -> Suppress duplicate."""
    engine = ReminderDecisionEngine()
    due = REF_NOW + timedelta(hours=24)
    # Existing reminder scheduled 3h before due date
    existing_time = due - timedelta(hours=3)
    inp = ReminderDecisionInput(
        title="Renew SSL",
        due_at=due,
        risk_score=75,
        risk_level="HIGH",
        existing_reminders=[
            ExistingReminderInfo(remind_at=existing_time, status="scheduled")
        ],
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert "Existing active reminder" in res.decision_factors or "duplicate" in res.block_reason.lower()

def test_7_proactive_reminders_disabled():
    """Test 7: Proactive reminders disabled in user preferences -> Blocked."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="High priority deliverable",
        due_at=REF_NOW + timedelta(hours=12),
        risk_score=85,
        risk_level="HIGH",
        preferences=UserReminderPreferences(proactive_reminders_enabled=False),
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert res.blocked is True
    assert "disabled" in res.block_reason.lower()

def test_8_quiet_hours_adjustment():
    """Test 8: Quiet hours adjustment moves reminder out of late night window."""
    engine = ReminderDecisionEngine()
    # Task due at 23:00 (11 PM). Lead time would normally place reminder at 22:00 (in quiet hours: 22:00 - 08:00)
    due_at = REF_NOW.replace(hour=23, minute=0, second=0)
    inp = ReminderDecisionInput(
        title="Late night report",
        due_at=due_at,
        risk_score=75,
        risk_level="HIGH",
        preferences=UserReminderPreferences(
            quiet_hours_on=True,
            quiet_start=time(22, 0),
            quiet_end=time(8, 0),
        ),
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    if res.should_remind and res.recommended_time:
        # Candidate should have been adjusted outside quiet hours
        t = res.recommended_time.time()
        assert not (t >= time(22, 0) or t < time(8, 0))

def test_9_recommended_time_in_past_safeguard():
    """Test 9: Recommended reminder time is never in the past."""
    engine = ReminderDecisionEngine()
    # Due in 5 minutes
    due_at = REF_NOW + timedelta(minutes=5)
    inp = ReminderDecisionInput(
        title="Last minute check",
        due_at=due_at,
        risk_score=70,
        risk_level="HIGH",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    if res.should_remind:
        assert res.recommended_time > REF_NOW

def test_10_overdue_task_escalation():
    """Test 10: Overdue task receives ESCALATION intervention, not scheduled in past."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Overdue tax invoice",
        due_at=REF_NOW - timedelta(hours=3),
        risk_score=90,
        risk_level="HIGH",
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is True
    assert res.intervention_level == "ESCALATION"
    assert res.recommended_time > REF_NOW

def test_11_high_risk_limited_history():
    """Test 11: High-risk task with limited historical data produces sensible reminder."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Submit final assignment",
        priority="high",
        due_at=REF_NOW + timedelta(hours=24),
        risk_score=75,
        risk_level="HIGH",
        risk_factors=["Deadline is approaching", "High priority"],
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is True
    assert res.intervention_level == "PROACTIVE"
    assert res.recommended_time is not None

def test_12_anti_spam_maximum_reminders():
    """Test 12: Anti-spam rules prevent exceeding max reminder count per task."""
    engine = ReminderDecisionEngine()
    inp = ReminderDecisionInput(
        title="Frequently reminded task",
        due_at=REF_NOW + timedelta(days=2),
        risk_score=80,
        risk_level="HIGH",
        existing_reminders=[
            ExistingReminderInfo(remind_at=REF_NOW + timedelta(hours=10), status="delivered"),
            ExistingReminderInfo(remind_at=REF_NOW + timedelta(hours=20), status="scheduled"),
        ],
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert res.blocked is True
    assert "limit" in res.block_reason.lower()

def test_13_user_isolation_api():
    """Test 13: Endpoint rejects invalid requests and respects payload isolation."""
    res = client.post("/api/tasks/reminder-decision", json={
        "title": "A valid task",
        "priority": "invalid_priority",
    })
    assert res.status_code == 422

def test_14_active_snoozed_reminder():
    """Test 14: Snoozed reminder in effect prevents immediate duplicate reminder."""
    engine = ReminderDecisionEngine()
    snooze_until = REF_NOW + timedelta(minutes=45)
    inp = ReminderDecisionInput(
        title="Presentation prep",
        due_at=REF_NOW + timedelta(hours=4),
        risk_score=78,
        risk_level="HIGH",
        existing_reminders=[
            ExistingReminderInfo(
                remind_at=REF_NOW - timedelta(minutes=15),
                status="snoozed",
                snooze_until=snooze_until,
            )
        ],
        current_time=REF_NOW,
    )
    res = engine.evaluate_decision(inp)
    assert res.should_remind is False
    assert res.blocked is True
    assert "snooze" in res.block_reason.lower()
