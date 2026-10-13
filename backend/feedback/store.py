import copy
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

from .models import FeedbackEventRecord, FeedbackEventType, EventSource

logger = logging.getLogger("remind.feedback.store")


class FeedbackStoreAdapter:
    """
    Adapter defining immutable append-only storage for feedback events.
    Guarantees strict user data isolation.
    Provides idempotency protection against duplicate event recordings.
    """

    def __init__(self):
        # { user_id: [ FeedbackEventRecord, ... ] }
        self._user_events: Dict[str, List[Dict[str, Any]]] = {}

    def _ensure_user(self, user_id: str):
        if user_id not in self._user_events:
            self._user_events[user_id] = []

    async def record_event(
        self,
        user_id: str,
        event_type: FeedbackEventType,
        event_source: EventSource,
        task_id: Optional[str] = None,
        reminder_id: Optional[str] = None,
        notification_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        timestamp: Optional[datetime] = None,
    ) -> FeedbackEventRecord:
        """
        Appends an immutable event to the user's behavioral history.
        Enforces duplicate event protection for idempotent actions.
        """
        self._ensure_user(user_id)
        now = timestamp or datetime.now(timezone.utc)
        meta = metadata or {}

        # Duplicate protection:
        # If recording TASK_COMPLETED, TASK_CANCELLED, or identical action for the same task/notification
        # within 5 seconds, prevent duplicate event spam
        recent_events = self._user_events[user_id]
        if recent_events:
            last = recent_events[-1]
            if (
                last.get("event_type") == event_type.value
                and str(last.get("task_id")) == str(task_id)
                and str(last.get("notification_id")) == str(notification_id)
            ):
                last_time = datetime.fromisoformat(last["timestamp"].replace("Z", "+00:00"))
                delta_sec = abs((now - last_time).total_seconds())
                if delta_sec < 5.0:
                    logger.info(
                        f"Prevented duplicate event {event_type} for task {task_id} (occurred {delta_sec:.1f}s ago)."
                    )
                    return FeedbackEventRecord(
                        id=last["id"],
                        user_id=user_id,
                        task_id=last.get("task_id"),
                        reminder_id=last.get("reminder_id"),
                        notification_id=last.get("notification_id"),
                        event_type=FeedbackEventType(last["event_type"]),
                        event_source=EventSource(last["event_source"]),
                        timestamp=last_time,
                        metadata=last.get("metadata", {}),
                        created_at=datetime.fromisoformat(last["created_at"].replace("Z", "+00:00")),
                    )

        event_id = f"evt_{user_id}_{len(recent_events) + 1}"
        record_dict = {
            "id": event_id,
            "user_id": user_id,
            "task_id": str(task_id) if task_id else None,
            "reminder_id": str(reminder_id) if reminder_id else None,
            "notification_id": str(notification_id) if notification_id else None,
            "event_type": event_type.value,
            "event_source": event_source.value,
            "timestamp": now.isoformat(),
            "metadata": copy.deepcopy(meta),
            "created_at": now.isoformat(),
        }

        self._user_events[user_id].append(record_dict)

        return FeedbackEventRecord(
            id=event_id,
            user_id=user_id,
            task_id=task_id,
            reminder_id=reminder_id,
            notification_id=notification_id,
            event_type=event_type,
            event_source=event_source,
            timestamp=now,
            metadata=meta,
            created_at=now,
        )

    async def get_events(
        self,
        user_id: str,
        task_id: Optional[str] = None,
        event_type: Optional[FeedbackEventType] = None,
        limit: int = 100,
    ) -> List[FeedbackEventRecord]:
        """Retrieves user events filtered with strict user isolation."""
        self._ensure_user(user_id)
        records: List[FeedbackEventRecord] = []

        for e in self._user_events[user_id]:
            if task_id and str(e.get("task_id")) != str(task_id):
                continue
            if event_type and e.get("event_type") != event_type.value:
                continue

            t_val = datetime.fromisoformat(e["timestamp"].replace("Z", "+00:00"))
            c_val = datetime.fromisoformat(e["created_at"].replace("Z", "+00:00"))
            records.append(
                FeedbackEventRecord(
                    id=e["id"],
                    user_id=e["user_id"],
                    task_id=e.get("task_id"),
                    reminder_id=e.get("reminder_id"),
                    notification_id=e.get("notification_id"),
                    event_type=FeedbackEventType(e["event_type"]),
                    event_source=EventSource(e["event_source"]),
                    timestamp=t_val,
                    metadata=copy.deepcopy(e.get("metadata", {})),
                    created_at=c_val,
                )
            )

        # Chronological sort (oldest to newest for timeline construction)
        records.sort(key=lambda x: x.timestamp)
        return records[:limit]


# Global singleton feedback store adapter
default_feedback_store = FeedbackStoreAdapter()
