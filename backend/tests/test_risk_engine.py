from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.risk import (
    ForgetfulnessRiskEngine,
    TaskRiskInput,
    UserTaskHistory,
    RiskAssessment,
)

client = TestClient(app)

REF_NOW = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)

def test_1_low_risk_task():
    """Test 1: Far deadline, low priority, no negative history -> LOW risk score."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Review annual documentation archive",
        priority="low",
        due_at=REF_NOW + timedelta(days=14),
        status="pending",
        user_history=UserTaskHistory(total_tasks_completed=10),
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert res.level == "LOW"
    assert res.score <= 29

def test_2_approaching_deadline():
    """Test 2: Task due soon (within 24h) receives higher score than far task."""
    engine = ForgetfulnessRiskEngine()
    task_far = TaskRiskInput(
        title="Check status",
        priority="medium",
        due_at=REF_NOW + timedelta(days=10),
        evaluated_at=REF_NOW,
    )
    task_soon = TaskRiskInput(
        title="Check status",
        priority="medium",
        due_at=REF_NOW + timedelta(hours=3),
        evaluated_at=REF_NOW,
    )
    res_far = engine.calculate_risk(task_far)
    res_soon = engine.calculate_risk(task_soon)
    assert res_soon.score > res_far.score
    assert any(f.name == "deadline_proximity" for f in res_soon.factors)

def test_3_high_priority():
    """Test 3: Same deadline but higher priority increases risk score."""
    engine = ForgetfulnessRiskEngine()
    task_med = TaskRiskInput(
        title="Submit report",
        priority="medium",
        due_at=REF_NOW + timedelta(days=1),
        evaluated_at=REF_NOW,
    )
    task_high = TaskRiskInput(
        title="Submit report",
        priority="high",
        due_at=REF_NOW + timedelta(days=1),
        evaluated_at=REF_NOW,
    )
    res_med = engine.calculate_risk(task_med)
    res_high = engine.calculate_risk(task_high)
    assert res_high.score > res_med.score

def test_4_previous_postponements():
    """Test 4: Task with multiple historical postponements increases risk."""
    engine = ForgetfulnessRiskEngine()
    task_clean = TaskRiskInput(
        title="Review specs",
        priority="medium",
        due_at=REF_NOW + timedelta(days=1),
        user_history=UserTaskHistory(similar_tasks_postponed=0),
        evaluated_at=REF_NOW,
    )
    task_postponed = TaskRiskInput(
        title="Review specs",
        priority="medium",
        due_at=REF_NOW + timedelta(days=1),
        user_history=UserTaskHistory(similar_tasks_postponed=3),
        evaluated_at=REF_NOW,
    )
    res_clean = engine.calculate_risk(task_clean)
    res_postponed = engine.calculate_risk(task_postponed)
    assert res_postponed.score > res_clean.score
    assert any(f.name == "previous_postponements" for f in res_postponed.factors)

def test_5_previous_misses():
    """Test 5: Similar tasks repeatedly missed increases risk."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Sprint retro deck",
        priority="medium",
        due_at=REF_NOW + timedelta(days=2),
        user_history=UserTaskHistory(similar_tasks_missed=2),
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert any(f.name == "previous_misses" for f in res.factors)

def test_6_new_user_data_sufficiency():
    """Test 6: New user with no history receives data_sufficiency='limited' and clear note."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Onboarding task",
        priority="medium",
        due_at=REF_NOW + timedelta(days=1),
        user_history=UserTaskHistory(total_tasks_completed=0, total_tasks_overdue=0),
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert res.data_sufficiency == "limited"
    assert "limited historical behavior" in res.explanation

def test_7_completed_task():
    """Test 7: Completed task does not receive high risk (score = 0)."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Finished sprint presentation",
        priority="urgent",
        due_at=REF_NOW - timedelta(days=1),
        status="done",
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert res.score == 0
    assert res.level == "LOW"

def test_8_overdue_task():
    """Test 8: Overdue uncompleted task receives elevated high risk."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Overdue invoice submission",
        priority="high",
        due_at=REF_NOW - timedelta(hours=5),
        status="pending",
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert res.level == "HIGH"
    assert any(f.name == "deadline_proximity" and "overdue" in f.description.lower() for f in res.factors)

def test_9_duplicate_signals_avoidance():
    """Test 9: Verify deadline signals are bounded to one cohesive factor, preventing double counting."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Assignment due in 2 hours",
        priority="medium",
        due_at=REF_NOW + timedelta(hours=2),
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    deadline_factors = [f for f in res.factors if f.name == "deadline_proximity"]
    assert len(deadline_factors) == 1

def test_10_score_boundaries():
    """Test 10: Verify score is clamped strictly between 0 and 100."""
    engine = ForgetfulnessRiskEngine()
    extreme_task = TaskRiskInput(
        title="Extreme crunch task",
        priority="urgent",
        due_at=REF_NOW - timedelta(days=10),
        preparation_items_count=10,
        user_history=UserTaskHistory(
            total_tasks_overdue=10,
            similar_tasks_missed=10,
            similar_tasks_postponed=10,
            total_reminders_snoozed=10,
        ),
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(extreme_task)
    assert res.score <= 100
    assert res.score >= 0
    assert res.level == "HIGH"

def test_11_explanation_fidelity():
    """Test 11: Every contributing factor has human-readable descriptions reflected in explanation."""
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Quarterly Review",
        priority="high",
        due_at=REF_NOW + timedelta(hours=20),
        preparation_items_count=2,
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert len(res.factors) > 0
    for f in res.factors:
        assert f.impact > 0
        assert f.description != ""
    assert res.level in res.explanation

def test_12_realistic_scenario_assessment():
    """
    Test 12: Realistic ReMind scenario
    - Presentation tomorrow at 10 AM
    - High priority
    - 2 preparation items (laptop, presentation file)
    - History: postponed 2x, missed 1x
    Expected: HIGH risk score with multiple transparent factors.
    """
    engine = ForgetfulnessRiskEngine()
    task = TaskRiskInput(
        title="Deliver Presentation",
        priority="high",
        due_at=REF_NOW + timedelta(hours=24),
        preparation_items_count=2,
        user_history=UserTaskHistory(
            total_tasks_completed=8,
            similar_tasks_postponed=2,
            similar_tasks_missed=1,
        ),
        evaluated_at=REF_NOW,
    )
    res = engine.calculate_risk(task)
    assert res.level == "HIGH"
    factor_names = [f.name for f in res.factors]
    assert "deadline_proximity" in factor_names
    assert "priority" in factor_names
    assert "preparation_complexity" in factor_names
    assert "previous_postponements" in factor_names
    assert "previous_misses" in factor_names

def test_13_priority_safety_floor():
    """Test 13: High and Urgent priority tasks are guaranteed HIGH tier, even with far deadlines."""
    engine = ForgetfulnessRiskEngine()

    # Task due 3 weeks away with high priority
    task_high = TaskRiskInput(
        title="Vital Board Strategy",
        priority="high",
        due_at=REF_NOW + timedelta(days=21),
        evaluated_at=REF_NOW,
    )
    res_high = engine.calculate_risk(task_high)
    assert res_high.level == "HIGH"
    assert res_high.score >= 60
    assert any(f.name == "priority_safety_floor" for f in res_high.factors)

    # Task due 3 weeks away with urgent priority
    task_urgent = TaskRiskInput(
        title="Critical Security Audit",
        priority="urgent",
        due_at=REF_NOW + timedelta(days=21),
        evaluated_at=REF_NOW,
    )
    res_urgent = engine.calculate_risk(task_urgent)
    assert res_urgent.level == "HIGH"
    assert res_urgent.score >= 75
    assert any(f.name == "priority_safety_floor" for f in res_urgent.factors)

