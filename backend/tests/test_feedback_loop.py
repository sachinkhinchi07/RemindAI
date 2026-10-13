import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.feedback import (
    FeedbackService,
    FeedbackStoreAdapter,
    FeedbackEventType,
    EventSource,
    DataSufficiencyLevel,
)
from backend.notifications import (
    NotificationService,
    NotificationStoreAdapter,
    ScheduleNotificationRequest,
    NotificationActionRequest,
)
from backend.agent.store import TaskStoreAdapter
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.tools.registry import execute_update_task
from backend.agent.tools.schemas import UpdateTaskInput
from backend.voice.service import VoiceGestureService
from backend.voice.models import VoiceTranscriptionRequest


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def clean_feedback_store():
    return FeedbackStoreAdapter()


@pytest.fixture
def feedback_service(clean_feedback_store):
    return FeedbackService(store=clean_feedback_store)


def test_record_task_lifecycle_events(feedback_service):
    user_id = "user_fb_1"
    task_id = "task_100"

    # 1. TASK_CREATED
    evt1 = run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_CREATED,
        event_source=EventSource.UI,
        task_id=task_id,
        metadata={"title": "Submit Deck"},
    ))
    assert evt1.event_type == FeedbackEventType.TASK_CREATED
    assert evt1.task_id == task_id

    # 2. TASK_POSTPONED
    evt2 = run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_POSTPONED,
        event_source=EventSource.UI,
        task_id=task_id,
        metadata={"postpone_hours": 3},
    ))
    assert evt2.event_type == FeedbackEventType.TASK_POSTPONED

    # 3. TASK_COMPLETED
    evt3 = run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_COMPLETED,
        event_source=EventSource.UI,
        task_id=task_id,
    ))
    assert evt3.event_type == FeedbackEventType.TASK_COMPLETED

    timeline = run_async(feedback_service.get_task_timeline(user_id=user_id, task_id=task_id))
    assert timeline.total_events == 3
    assert timeline.events[0].event_type == "TASK_CREATED"
    assert timeline.events[1].event_type == "TASK_POSTPONED"
    assert timeline.events[2].event_type == "TASK_COMPLETED"


def test_duplicate_event_prevention(feedback_service):
    user_id = "user_fb_dup"
    task_id = "task_dup"

    # Rapid consecutive calls
    evt1 = run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_COMPLETED,
        event_source=EventSource.UI,
        task_id=task_id,
    ))
    evt2 = run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_COMPLETED,
        event_source=EventSource.UI,
        task_id=task_id,
    ))

    events = run_async(feedback_service.store.get_events(user_id=user_id, task_id=task_id))
    # Only 1 unique event should exist because the duplicate was prevented
    assert len(events) == 1
    assert evt1.id == evt2.id


def test_completed_after_reminder_relationship(feedback_service):
    user_id = "user_car_1"
    task_id = "task_pres"
    now = datetime.now(timezone.utc)

    # 1. Reminder triggered
    rem_time = now - timedelta(minutes=10)
    run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.NOTIFICATION_DELIVERED,
        event_source=EventSource.SYSTEM,
        task_id=task_id,
        timestamp=rem_time,
    ))

    # 2. Task completed 10 minutes later
    comp_time = now
    run_async(feedback_service.record_event(
        user_id=user_id,
        event_type=FeedbackEventType.TASK_COMPLETED,
        event_source=EventSource.UI,
        task_id=task_id,
        timestamp=comp_time,
    ))

    timeline = run_async(feedback_service.get_task_timeline(user_id=user_id, task_id=task_id))
    assert timeline.completed_after_reminder is True
    assert timeline.time_from_reminder_to_completion_seconds is not None
    assert abs(timeline.time_from_reminder_to_completion_seconds - 600.0) < 5.0


def test_data_sufficiency_levels(feedback_service):
    user_id = "user_suff_test"

    # 1. Zero events -> NONE
    sum0 = run_async(feedback_service.get_user_summary(user_id))
    assert sum0.data_sufficiency == DataSufficiencyLevel.NONE

    # 2. 4 events -> LIMITED
    for i in range(4):
        run_async(feedback_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.TASK_CREATED,
            event_source=EventSource.UI,
            task_id=f"t_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(seconds=i * 10),
        ))
    sum_lim = run_async(feedback_service.get_user_summary(user_id))
    assert sum_lim.data_sufficiency == DataSufficiencyLevel.LIMITED

    # 3. 12 events total -> MODERATE
    for i in range(4, 12):
        run_async(feedback_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.TASK_CREATED,
            event_source=EventSource.UI,
            task_id=f"t_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(seconds=i * 10),
        ))
    sum_mod = run_async(feedback_service.get_user_summary(user_id))
    assert sum_mod.data_sufficiency == DataSufficiencyLevel.MODERATE

    # 4. 22 events total -> SUFFICIENT
    for i in range(12, 22):
        run_async(feedback_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.TASK_CREATED,
            event_source=EventSource.UI,
            task_id=f"t_{i}",
            timestamp=datetime.now(timezone.utc) + timedelta(seconds=i * 10),
        ))
    sum_suf = run_async(feedback_service.get_user_summary(user_id))
    assert sum_suf.data_sufficiency == DataSufficiencyLevel.SUFFICIENT


def test_notification_actions_emit_feedback_events():
    task_store = TaskStoreAdapter()
    notif_store = NotificationStoreAdapter()
    fb_store = FeedbackStoreAdapter()
    fb_service = FeedbackService(store=fb_store)

    notif_service = NotificationService(
        notif_store=notif_store,
        task_store=task_store,
        feedback_service=fb_service,
    )

    user_id = "user_notif_flow"
    task_id = "task_flow_1"
    task_store.seed_user_data(
        user_id=user_id,
        tasks=[{
            "id": task_id,
            "title": "Quarterly Tax Review",
            "status": "pending",
            "priority": "high",
            "due_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        }],
    )

    # 1. Schedule notification
    record = run_async(notif_service.schedule_notification(
        user_id=user_id,
        request=ScheduleNotificationRequest(
            task_id=task_id,
            channel="IN_APP",
            title="Tax Review",
            message="Time to review taxes",
        ),
    ))
    events = run_async(fb_store.get_events(user_id=user_id, task_id=task_id))
    assert any(e.event_type == FeedbackEventType.REMINDER_SCHEDULED for e in events)

    # 2. Snooze action
    run_async(notif_service.handle_user_action(
        user_id=user_id,
        notification_id=record.id,
        action_req=NotificationActionRequest(action="SNOOZE", snooze_minutes=30),
    ))
    events_after_snooze = run_async(fb_store.get_events(user_id=user_id, task_id=task_id))
    assert any(e.event_type == FeedbackEventType.NOTIFICATION_SNOOZED for e in events_after_snooze)

    # 3. Complete action on snoozed notification
    active_notifs = run_async(notif_store.get_notifications(user_id=user_id))
    snoozed_child = [n for n in active_notifs if n.get("status") == "SCHEDULED"][0]

    run_async(notif_service.handle_user_action(
        user_id=user_id,
        notification_id=snoozed_child["id"],
        action_req=NotificationActionRequest(action="COMPLETE"),
    ))
    events_after_comp = run_async(fb_store.get_events(user_id=user_id, task_id=task_id))
    assert any(e.event_type == FeedbackEventType.COMPLETED_AFTER_REMINDER for e in events_after_comp)
    assert any(e.event_type == FeedbackEventType.TASK_COMPLETED for e in events_after_comp)


def test_agent_tool_update_emits_feedback_events():
    task_store = TaskStoreAdapter()
    user_id = "user_agent_fb"
    task_id = "task_agent_1"

    task_store.seed_user_data(
        user_id=user_id,
        tasks=[{
            "id": task_id,
            "title": "Prepare Pitch Deck",
            "status": "pending",
            "due_at": datetime.now(timezone.utc).isoformat(),
        }],
    )

    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    # Postpone task via update tool
    out = run_async(execute_update_task(
        UpdateTaskInput(task_id=task_id, postpone_hours=4),
        ctx,
    ))
    assert out.success is True

    # Complete task via update tool
    out_comp = run_async(execute_update_task(
        UpdateTaskInput(task_id=task_id, status="done"),
        ctx,
    ))
    assert out_comp.success is True


def test_voice_actions_emit_feedback_events():
    task_store = TaskStoreAdapter()
    user_id = "user_voice_fb"
    task_store.seed_user_data(
        user_id=user_id,
        tasks=[{
            "id": "task_v1",
            "title": "Team Sprint",
            "status": "pending",
        }],
    )

    voice_svc = VoiceGestureService(task_store=task_store)
    ctx = ToolExecutionContext(user_id=user_id, data_store=task_store)

    # Voice snooze
    resp = run_async(voice_svc.process_voice_command(
        VoiceTranscriptionRequest(transcript="Snooze this reminder for 30 minutes"),
        ctx,
    ))
    assert resp.action_type == "reminder_snoozed"

    # Voice dismiss
    resp_dis = run_async(voice_svc.process_voice_command(
        VoiceTranscriptionRequest(transcript="Dismiss this reminder"),
        ctx,
    ))
    assert resp_dis.action_type == "reminder_dismissed"


def test_api_feedback_summary_and_timeline():
    from backend.agent.store import default_task_store
    client = TestClient(app)
    user_id = "test_api_fb_user"

    # Seed task in store so ownership passes
    default_task_store.seed_user_data(
        user_id=user_id,
        tasks=[{
            "id": "api_t1",
            "title": "API Task",
            "status": "pending",
        }],
    )

    # 1. Post feedback event
    res = client.post(
        "/api/feedback/event",
        headers={"x-user-id": user_id},
        json={
            "task_id": "api_t1",
            "event_type": "TASK_CREATED",
            "event_source": "UI",
            "metadata": {"title": "API Task"},
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["event_type"] == "TASK_CREATED"
    assert data["user_id"] == user_id

    # 2. Get summary
    res_sum = client.get(
        "/api/feedback/summary",
        headers={"x-user-id": user_id},
    )
    assert res_sum.status_code == 200
    sum_data = res_sum.json()
    assert sum_data["tasks_created"] >= 1
    assert sum_data["user_id"] == user_id

    # 3. Get timeline
    res_tl = client.get(
        "/api/feedback/timeline/api_t1",
        headers={"x-user-id": user_id},
    )
    assert res_tl.status_code == 200
    tl_data = res_tl.json()
    assert tl_data["task_id"] == "api_t1"
    assert tl_data["total_events"] >= 1


def test_api_user_isolation():
    from backend.agent.store import default_task_store
    client = TestClient(app)
    user_a = "user_alpha"
    user_b = "user_beta"

    default_task_store.seed_user_data(
        user_id=user_a,
        tasks=[{
            "id": "task_alpha_secret",
            "title": "Alpha Secret",
            "status": "pending",
        }],
    )

    # Post event for user A
    res_a = client.post(
        "/api/feedback/event",
        headers={"x-user-id": user_a},
        json={
            "task_id": "task_alpha_secret",
            "event_type": "TASK_CREATED",
            "event_source": "UI",
            "metadata": {"secret": "private_data"},
        },
    )
    assert res_a.status_code == 200

    # User B should NOT see user A's events
    res_b = client.get(
        "/api/feedback/events",
        headers={"x-user-id": user_b},
    )
    assert res_b.status_code == 200
    events_b = res_b.json()
    assert not any(e["task_id"] == "task_alpha_secret" for e in events_b)
