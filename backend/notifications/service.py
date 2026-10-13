import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta

from .models import (
    NotificationRecord,
    ScheduleNotificationRequest,
    NotificationActionRequest,
    NotificationActionResponse,
)
from .providers import (
    NotificationProvider,
    InAppNotificationProvider,
    BrowserNotificationProvider,
    VoiceNotificationProvider,
)
from .store import NotificationStoreAdapter, default_notification_store
from backend.agent.store import TaskStoreAdapter, default_task_store
from backend.feedback import (
    default_feedback_service,
    FeedbackService,
    FeedbackEventType,
    EventSource,
)

logger = logging.getLogger("remind.notifications.service")


class NotificationService:
    """
    Core Notification Delivery & Lifecycle Orchestrator.
    Responsible for delivery, duplicate prevention, task state verification,
    and feedback logging. Does NOT decide reminder necessity or risk.
    """

    def __init__(
        self,
        notif_store: Optional[NotificationStoreAdapter] = None,
        task_store: Optional[TaskStoreAdapter] = None,
        feedback_service: Optional[FeedbackService] = None,
    ):
        self.notif_store = notif_store or default_notification_store
        self.task_store = task_store or default_task_store
        self.feedback_service = feedback_service or default_feedback_service
        self.providers: Dict[str, NotificationProvider] = {
            "IN_APP": InAppNotificationProvider(),
            "BROWSER": BrowserNotificationProvider(),
            "VOICE": VoiceNotificationProvider(),
        }

    async def schedule_notification(
        self,
        user_id: str,
        request: ScheduleNotificationRequest,
    ) -> NotificationRecord:
        """
        Schedules a notification for an approved reminder decision.
        Enforces duplicate prevention and task existence validation.
        """
        # 1. Verify task belongs to user
        task = await self.task_store.get_task_by_id(user_id, request.task_id)
        if not task:
            raise ValueError(f"Task '{request.task_id}' not found for authenticated user.")

        # 2. Check task state: completed or cancelled tasks cannot be scheduled
        task_status = task.get("status", "pending").lower()
        if task_status in ["done", "completed", "cancelled"]:
            raise ValueError(f"Cannot schedule notification for task with status '{task_status}'.")

        # 3. Duplicate Prevention: check if active notification already exists for this task & channel
        existing = await self.notif_store.find_active_notification_for_task(
            user_id=user_id, task_id=request.task_id, channel=request.channel
        )
        if existing:
            logger.info(f"Notification already scheduled for task '{request.task_id}' on channel '{request.channel}'.")
            return NotificationRecord(**existing)

        # 4. Message formatting (deterministic from verified data)
        msg = request.message
        if not msg:
            due_str = f" due at {task.get('due_at')}" if task.get("due_at") else ""
            msg = f"Reminder for '{task.get('title')}'{due_str}."

        now = datetime.now(timezone.utc)
        sched_time = request.scheduled_at or now

        # 5. Persist notification record
        record_dict = {
            "id": None,
            "user_id": user_id,
            "task_id": request.task_id,
            "reminder_id": request.reminder_id,
            "channel": request.channel,
            "title": request.title,
            "message": msg,
            "scheduled_at": sched_time.isoformat(),
            "status": "SCHEDULED",
            "intervention_level": request.intervention_level,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        saved = await self.notif_store.save_notification(user_id, record_dict)
        await self.notif_store.record_feedback(
            user_id=user_id,
            event_type="SCHEDULED",
            metadata={"notification_id": saved["id"], "task_id": request.task_id, "channel": request.channel},
        )
        await self.feedback_service.record_event(
            user_id=user_id,
            event_type=FeedbackEventType.REMINDER_SCHEDULED,
            event_source=EventSource.SYSTEM,
            task_id=request.task_id,
            reminder_id=request.reminder_id,
            notification_id=saved["id"],
            metadata={"channel": request.channel, "intervention_level": request.intervention_level},
        )

        return NotificationRecord(**saved)

    async def deliver_due_notifications(self, user_id: str) -> List[NotificationRecord]:
        """
        Processes and delivers all notifications that have reached their scheduled time.
        Validates task state before delivering to skip completed tasks.
        """
        all_notifs = await self.notif_store.get_notifications(user_id, status="SCHEDULED")
        now = datetime.now(timezone.utc)
        delivered_list = []

        for n_dict in all_notifs:
            notif = NotificationRecord(**n_dict)
            if notif.scheduled_at > now:
                continue

            # Task State Check: if task became completed/cancelled in the interim, cancel notification
            if notif.task_id:
                task = await self.task_store.get_task_by_id(user_id, notif.task_id)
                if not task or task.get("status") in ["done", "completed", "cancelled"]:
                    notif.status = "CANCELLED"
                    notif.failure_reason = "Task was completed or cancelled before notification time."
                    await self.notif_store.save_notification(user_id, notif.model_dump())
                    await self.notif_store.record_feedback(
                        user_id=user_id,
                        event_type="CANCELLED_TASK_COMPLETED",
                        metadata={"notification_id": notif.id, "task_id": notif.task_id},
                    )
                    continue

            # Deliver through provider
            provider = self.providers.get(notif.channel, self.providers["IN_APP"])
            try:
                notif.status = "SENDING"
                success = await provider.deliver(notif)
                if success:
                    notif.status = "DELIVERED"
                    notif.delivered_at = now
                    notif.sent_at = now
                    await self.notif_store.record_feedback(
                        user_id=user_id,
                        event_type="DELIVERED",
                        metadata={"notification_id": notif.id, "channel": notif.channel},
                    )
                    await self.feedback_service.record_event(
                        user_id=user_id,
                        event_type=FeedbackEventType.NOTIFICATION_DELIVERED,
                        event_source=EventSource.SYSTEM,
                        task_id=notif.task_id,
                        reminder_id=notif.reminder_id,
                        notification_id=notif.id,
                        metadata={"channel": notif.channel},
                    )
                else:
                    raise RuntimeError("Delivery returned False")
            except Exception as exc:
                notif.retry_count += 1
                if notif.retry_count >= notif.max_retries:
                    notif.status = "FAILED"
                    notif.failure_reason = f"Delivery failed after {notif.max_retries} attempts: {str(exc)}"
                    await self.feedback_service.record_event(
                        user_id=user_id,
                        event_type=FeedbackEventType.NOTIFICATION_FAILED,
                        event_source=EventSource.SYSTEM,
                        task_id=notif.task_id,
                        reminder_id=notif.reminder_id,
                        notification_id=notif.id,
                        metadata={"error": str(exc), "retry_count": notif.retry_count},
                    )
                else:
                    notif.status = "SCHEDULED"  # retry on next run
                    notif.failure_reason = str(exc)

            saved = await self.notif_store.save_notification(user_id, notif.model_dump())
            delivered_list.append(NotificationRecord(**saved))

        return delivered_list

    async def handle_user_action(
        self,
        user_id: str,
        notification_id: str,
        action_req: NotificationActionRequest,
    ) -> NotificationActionResponse:
        """Processes user responses (COMPLETE, SNOOZE, DISMISS, READ)."""
        raw = await self.notif_store.get_notification_by_id(user_id, notification_id)
        if not raw:
            raise ValueError(f"Notification '{notification_id}' not found for authenticated user.")

        notif = NotificationRecord(**raw)
        now = datetime.now(timezone.utc)

        # 1. COMPLETE
        if action_req.action == "COMPLETE":
            notif.status = "DISMISSED"
            notif.dismissed_at = now
            if notif.task_id:
                await self.task_store.update_task(user_id, notif.task_id, {"status": "done"})

            await self.notif_store.save_notification(user_id, notif.model_dump())
            await self.notif_store.record_feedback(
                user_id=user_id,
                event_type="COMPLETED_AFTER_REMINDER",
                metadata={"notification_id": notif.id, "task_id": notif.task_id},
            )
            await self.feedback_service.record_event(
                user_id=user_id,
                event_type=FeedbackEventType.COMPLETED_AFTER_REMINDER,
                event_source=EventSource.UI,
                task_id=notif.task_id,
                reminder_id=notif.reminder_id,
                notification_id=notif.id,
                metadata={"action": "COMPLETE"},
            )
            await self.feedback_service.record_event(
                user_id=user_id,
                event_type=FeedbackEventType.TASK_COMPLETED,
                event_source=EventSource.UI,
                task_id=notif.task_id,
                reminder_id=notif.reminder_id,
                notification_id=notif.id,
                metadata={"completed_via": "notification_action"},
            )
            return NotificationActionResponse(
                notification_id=notif.id,
                status="DISMISSED",
                action_performed="COMPLETE",
                spoken_feedback="Done. I have marked that task as completed.",
                message="Task completed and notification cleared.",
            )

        # 2. SNOOZE
        elif action_req.action == "SNOOZE":
            mins = action_req.snooze_minutes or 30
            notif.status = "SNOOZED"
            await self.notif_store.save_notification(user_id, notif.model_dump())

            # Schedule new notification after snooze period
            new_time = now + timedelta(minutes=mins)
            new_notif = await self.schedule_notification(
                user_id=user_id,
                request=ScheduleNotificationRequest(
                    task_id=notif.task_id,
                    reminder_id=notif.reminder_id,
                    channel=notif.channel,
                    title=notif.title,
                    message=notif.message,
                    scheduled_at=new_time,
                    intervention_level=notif.intervention_level,
                ),
            )
            await self.notif_store.record_feedback(
                user_id=user_id,
                event_type="SNOOZED",
                metadata={"original_id": notif.id, "new_id": new_notif.id, "snooze_minutes": mins},
            )
            await self.feedback_service.record_event(
                user_id=user_id,
                event_type=FeedbackEventType.NOTIFICATION_SNOOZED,
                event_source=EventSource.UI,
                task_id=notif.task_id,
                reminder_id=notif.reminder_id,
                notification_id=notif.id,
                metadata={"snooze_minutes": mins, "new_notification_id": new_notif.id},
            )
            return NotificationActionResponse(
                notification_id=notif.id,
                status="SNOOZED",
                action_performed="SNOOZE",
                spoken_feedback=f"Snoozed. I will remind you again in {mins} minutes.",
                message=f"Reminder snoozed for {mins} minutes.",
            )

        # 3. DISMISS
        elif action_req.action == "DISMISS":
            notif.status = "DISMISSED"
            notif.dismissed_at = now
            await self.notif_store.save_notification(user_id, notif.model_dump())
            await self.notif_store.record_feedback(
                user_id=user_id,
                event_type="DISMISSED",
                metadata={"notification_id": notif.id},
            )
            await self.feedback_service.record_event(
                user_id=user_id,
                event_type=FeedbackEventType.NOTIFICATION_DISMISSED,
                event_source=EventSource.UI,
                task_id=notif.task_id,
                reminder_id=notif.reminder_id,
                notification_id=notif.id,
            )
            return NotificationActionResponse(
                notification_id=notif.id,
                status="DISMISSED",
                action_performed="DISMISS",
                spoken_feedback="Reminder dismissed.",
                message="Notification dismissed.",
            )

        # 4. READ
        else:
            await self.notif_store.record_feedback(
                user_id=user_id,
                event_type="READ",
                metadata={"notification_id": notif.id},
            )
            await self.feedback_service.record_event(
                user_id=user_id,
                event_type=FeedbackEventType.NOTIFICATION_OPENED,
                event_source=EventSource.UI,
                task_id=notif.task_id,
                reminder_id=notif.reminder_id,
                notification_id=notif.id,
            )
            return NotificationActionResponse(
                notification_id=notif.id,
                status=notif.status,
                action_performed="READ",
                spoken_feedback=None,
                message="Notification marked as read.",
            )
