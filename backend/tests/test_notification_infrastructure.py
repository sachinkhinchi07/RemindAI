import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.notifications import (
    NotificationService,
    NotificationStoreAdapter,
    NotificationRecord,
    ScheduleNotificationRequest,
    NotificationActionRequest,
)
from backend.agent.store import TaskStoreAdapter
from backend.reminders import ReminderDecisionEngine, ReminderDecisionInput

client = TestClient(app)

NOW = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def notif_setup():
    task_store = TaskStoreAdapter()
    notif_store = NotificationStoreAdapter()
    user_id = "user_notif_test"

    tasks = [
        {
            "id": "t_audit",
            "user_id": user_id,
            "title": "Submit Security Audit Report",
            "priority": "high",
            "status": "pending",
            "due_at": (NOW + timedelta(hours=8)).isoformat(),
        },
        {
            "id": "t_done",
            "user_id": user_id,
            "title": "Completed Filing Task",
            "priority": "low",
            "status": "done",
            "due_at": (NOW + timedelta(hours=2)).isoformat(),
        },
    ]
    task_store.seed_user_data(user_id, tasks=tasks)
    service = NotificationService(notif_store=notif_store, task_store=task_store)
    return service, notif_store, task_store, user_id


# --- 1. Scheduling & Duplicate Prevention ---

def test_schedule_notification_success(notif_setup):
    service, notif_store, _, user_id = notif_setup

    req = ScheduleNotificationRequest(
        task_id="t_audit",
        channel="IN_APP",
        title="Security Audit Reminder",
        message="Please submit audit report before deadline.",
        scheduled_at=NOW + timedelta(hours=1),
        intervention_level="PROACTIVE",
    )
    res = run_async(service.schedule_notification(user_id, req))

    assert res.id is not None
    assert res.status == "SCHEDULED"
    assert res.user_id == user_id


def test_prevent_duplicate_notification_scheduling(notif_setup):
    service, notif_store, _, user_id = notif_setup

    req = ScheduleNotificationRequest(
        task_id="t_audit",
        channel="IN_APP",
        title="Security Audit Reminder",
        scheduled_at=NOW + timedelta(hours=1),
    )
    res1 = run_async(service.schedule_notification(user_id, req))
    res2 = run_async(service.schedule_notification(user_id, req))

    # Duplicate scheduling returns existing record without creating a second
    assert res1.id == res2.id
    all_notifs = run_async(notif_store.get_notifications(user_id))
    assert len(all_notifs) == 1


# --- 2. Completed Task Handling ---

def test_cannot_schedule_for_completed_task(notif_setup):
    service, _, _, user_id = notif_setup

    req = ScheduleNotificationRequest(
        task_id="t_done",  # status is done
        channel="IN_APP",
        title="Completed Task Reminder",
    )
    with pytest.raises(ValueError, match="Cannot schedule notification for task with status 'done'"):
        run_async(service.schedule_notification(user_id, req))


def test_interim_completed_task_cancelled_on_delivery(notif_setup):
    service, notif_store, task_store, user_id = notif_setup

    # Schedule for pending task in past so it is immediately due
    req = ScheduleNotificationRequest(
        task_id="t_audit",
        channel="IN_APP",
        title="Imminent Audit Reminder",
        scheduled_at=NOW - timedelta(minutes=5),
    )
    res = run_async(service.schedule_notification(user_id, req))

    # Task is completed before delivery run
    run_async(task_store.update_task(user_id, "t_audit", {"status": "done"}))

    # Trigger delivery
    delivered = run_async(service.deliver_due_notifications(user_id))

    # Notification must be marked CANCELLED
    updated = run_async(notif_store.get_notification_by_id(user_id, res.id))
    assert updated["status"] == "CANCELLED"
    assert "completed or cancelled" in updated["failure_reason"]


# --- 3. Delivery Execution ---

def test_deliver_due_notifications(notif_setup):
    service, notif_store, _, user_id = notif_setup

    req = ScheduleNotificationRequest(
        task_id="t_audit",
        channel="IN_APP",
        title="Ready to Deliver",
        scheduled_at=NOW - timedelta(minutes=10),  # due now
    )
    res = run_async(service.schedule_notification(user_id, req))

    delivered = run_async(service.deliver_due_notifications(user_id))
    assert len(delivered) >= 1
    assert delivered[0].status == "DELIVERED"
    assert delivered[0].delivered_at is not None


# --- 4. User Interaction Actions (Complete, Snooze, Dismiss) ---

def test_user_action_complete(notif_setup):
    service, notif_store, task_store, user_id = notif_setup

    req = ScheduleNotificationRequest(task_id="t_audit", channel="IN_APP", title="Audit")
    n = run_async(service.schedule_notification(user_id, req))

    action_res = run_async(service.handle_user_action(user_id, n.id, NotificationActionRequest(action="COMPLETE")))
    assert action_res.action_performed == "COMPLETE"
    assert action_res.status == "DISMISSED"

    # Task status must be updated to done
    task = run_async(task_store.get_task_by_id(user_id, "t_audit"))
    assert task["status"] == "done"

    # Feedback logged
    logs = run_async(notif_store.get_feedback_logs(user_id))
    assert any(log["event_type"] == "COMPLETED_AFTER_REMINDER" for log in logs)


def test_user_action_snooze(notif_setup):
    service, notif_store, _, user_id = notif_setup

    req = ScheduleNotificationRequest(task_id="t_audit", channel="IN_APP", title="Audit")
    n = run_async(service.schedule_notification(user_id, req))

    action_res = run_async(
        service.handle_user_action(user_id, n.id, NotificationActionRequest(action="SNOOZE", snooze_minutes=45))
    )
    assert action_res.status == "SNOOZED"
    assert "45 minutes" in action_res.spoken_feedback

    # Original notification status is SNOOZED
    orig = run_async(notif_store.get_notification_by_id(user_id, n.id))
    assert orig["status"] == "SNOOZED"


def test_user_action_dismiss(notif_setup):
    service, notif_store, task_store, user_id = notif_setup

    req = ScheduleNotificationRequest(task_id="t_audit", channel="IN_APP", title="Audit")
    n = run_async(service.schedule_notification(user_id, req))

    action_res = run_async(service.handle_user_action(user_id, n.id, NotificationActionRequest(action="DISMISS")))
    assert action_res.status == "DISMISSED"

    # Task status remains pending
    task = run_async(task_store.get_task_by_id(user_id, "t_audit"))
    assert task["status"] == "pending"


# --- 5. Security & User Isolation ---

def test_notification_user_isolation(notif_setup):
    service, _, _, user_id = notif_setup
    other_user = "user_attacker"

    req = ScheduleNotificationRequest(task_id="t_audit", channel="IN_APP", title="Audit")
    n = run_async(service.schedule_notification(user_id, req))

    # Other user cannot act on user_id's notification
    with pytest.raises(ValueError, match="not found for authenticated user"):
        run_async(service.handle_user_action(other_user, n.id, NotificationActionRequest(action="DISMISS")))


# --- 6. API Endpoints Tests ---

def test_api_list_notifications_endpoint():
    res = client.get("/api/notifications", headers={"x-user-id": "api_test_user"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_api_schedule_notification_endpoint():
    res = client.post(
        "/api/notifications/schedule",
        headers={"x-user-id": "demo_user"},
        json={
            "task_id": "nonexistent_task_id",
            "channel": "IN_APP",
            "title": "Test Title",
        },
    )
    # Rejects nonexistent task
    assert res.status_code == 400
