from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
import copy


class NotificationStoreAdapter:
    """
    Adapter defining notification persistence and feedback logs.
    Guarantees user isolation: every query/mutation must filter strictly by user_id.
    """

    def __init__(self):
        # { user_id: { "notifications": [...], "feedback_logs": [...] } }
        self._user_data: Dict[str, Dict[str, Any]] = {}

    def _ensure_user(self, user_id: str):
        if user_id not in self._user_data:
            self._user_data[user_id] = {
                "notifications": [],
                "feedback_logs": [],
            }

    async def get_notifications(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        self._ensure_user(user_id)
        notifs = self._user_data[user_id]["notifications"]
        results = []
        for n in notifs:
            if status and n.get("status") != status:
                continue
            results.append(copy.deepcopy(n))
        # Sort newest first
        def _get_sort_key(item):
            val = item.get("created_at")
            if isinstance(val, datetime):
                return val.isoformat()
            return str(val or "")

        results.sort(key=_get_sort_key, reverse=True)
        return results[:limit]

    async def get_notification_by_id(self, user_id: str, notification_id: str) -> Optional[Dict[str, Any]]:
        self._ensure_user(user_id)
        for n in self._user_data[user_id]["notifications"]:
            if str(n.get("id")) == str(notification_id):
                return n
        return None

    async def find_active_notification_for_task(
        self, user_id: str, task_id: str, channel: str
    ) -> Optional[Dict[str, Any]]:
        """Used for strict duplicate prevention."""
        self._ensure_user(user_id)
        for n in self._user_data[user_id]["notifications"]:
            if (
                str(n.get("task_id")) == str(task_id)
                and n.get("channel") == channel
                and n.get("status") in ["SCHEDULED", "SENDING", "DELIVERED"]
            ):
                return n
        return None

    async def save_notification(self, user_id: str, notification_data: Dict[str, Any]) -> Dict[str, Any]:
        self._ensure_user(user_id)
        record = copy.deepcopy(notification_data)
        if "id" not in record or not record["id"]:
            record["id"] = f"notif_{len(self._user_data[user_id]['notifications']) + 1}"
        record["user_id"] = user_id
        now_str = datetime.now(timezone.utc).isoformat()
        if "created_at" not in record:
            record["created_at"] = now_str
        record["updated_at"] = now_str

        # Update if exists, otherwise insert
        for idx, n in enumerate(self._user_data[user_id]["notifications"]):
            if str(n.get("id")) == str(record["id"]):
                self._user_data[user_id]["notifications"][idx] = record
                return record

        self._user_data[user_id]["notifications"].append(record)
        return record

    async def record_feedback(self, user_id: str, event_type: str, metadata: Dict[str, Any]):
        """Persists reliable behavioral interaction data for Phase 11 feedback loop."""
        self._ensure_user(user_id)
        entry = {
            "id": f"fb_{len(self._user_data[user_id]['feedback_logs']) + 1}",
            "user_id": user_id,
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "metadata": copy.deepcopy(metadata),
        }
        self._user_data[user_id]["feedback_logs"].append(entry)
        return entry

    async def get_feedback_logs(self, user_id: str) -> List[Dict[str, Any]]:
        self._ensure_user(user_id)
        return copy.deepcopy(self._user_data[user_id]["feedback_logs"])


# Global singleton store adapter
default_notification_store = NotificationStoreAdapter()
