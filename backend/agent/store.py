from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import copy


class TaskStoreAdapter:
    """
    Adapter defining task and reminder access for the Agent.
    Guarantees user isolation: every query/mutation must filter strictly by user_id.
    Can operate against an in-memory test store or remote Supabase client.
    """

    def __init__(self, seed_tasks: Optional[List[Dict[str, Any]]] = None, seed_reminders: Optional[List[Dict[str, Any]]] = None):
        # In-memory store: { user_id: { "tasks": [...], "reminders": [...], "preferences": {...}, "history": {...} } }
        self._users_data: Dict[str, Dict[str, Any]] = {}
        if seed_tasks:
            for t in seed_tasks:
                u_id = t.get("user_id", "default_user")
                self._ensure_user(u_id)
                self._users_data[u_id]["tasks"].append(copy.deepcopy(t))
        if seed_reminders:
            for r in seed_reminders:
                u_id = r.get("user_id", "default_user")
                self._ensure_user(u_id)
                self._users_data[u_id]["reminders"].append(copy.deepcopy(r))

    def _ensure_user(self, user_id: str):
        if user_id not in self._users_data:
            self._users_data[user_id] = {
                "tasks": [],
                "reminders": [],
                "preferences": {
                    "proactive_reminders_enabled": True,
                    "quiet_hours_on": True,
                    "quiet_start": "22:00",
                    "quiet_end": "08:00",
                    "buffer_minutes": 45,
                    "preferred_channels": ["banner", "desktop"],
                },
                "history": {
                    "total_tasks_completed": 0,
                    "total_tasks_overdue": 0,
                    "total_reminders_snoozed": 0,
                    "similar_tasks_postponed": 0,
                    "similar_tasks_missed": 0,
                },
            }

    async def get_tasks(
        self,
        user_id: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        self._ensure_user(user_id)
        tasks = self._users_data[user_id]["tasks"]
        results = []
        for t in tasks:
            if status and t.get("status") != status:
                continue
            if priority and t.get("priority") != priority:
                continue
            results.append(t)
        return results[:limit]

    async def get_task_by_id(self, user_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        self._ensure_user(user_id)
        for t in self._users_data[user_id]["tasks"]:
            if str(t.get("id")) == str(task_id):
                return t
        return None

    async def get_reminders_for_task(self, user_id: str, task_id: str) -> List[Dict[str, Any]]:
        self._ensure_user(user_id)
        results = []
        for r in self._users_data[user_id]["reminders"]:
            if str(r.get("task_id")) == str(task_id):
                results.append(r)
        return results

    async def create_reminder(self, user_id: str, reminder_data: Dict[str, Any]) -> Dict[str, Any]:
        self._ensure_user(user_id)
        reminder_record = copy.deepcopy(reminder_data)
        reminder_record["id"] = f"rem_{len(self._users_data[user_id]['reminders']) + 1}"
        reminder_record["user_id"] = user_id
        if "created_at" not in reminder_record:
            reminder_record["created_at"] = datetime.now(timezone.utc).isoformat()
        self._users_data[user_id]["reminders"].append(reminder_record)
        return reminder_record

    async def update_task(self, user_id: str, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        self._ensure_user(user_id)
        for t in self._users_data[user_id]["tasks"]:
            if str(t.get("id")) == str(task_id):
                t.update(updates)
                return t
        return None

    async def get_user_preferences(self, user_id: str) -> Dict[str, Any]:
        self._ensure_user(user_id)
        return self._users_data[user_id]["preferences"]

    async def get_user_history(self, user_id: str) -> Dict[str, Any]:
        self._ensure_user(user_id)
        base_hist = copy.deepcopy(self._users_data[user_id]["history"])
        # Overlay observed behavioral feedback counts if available
        try:
            from backend.feedback import default_feedback_service
            summary = await default_feedback_service.get_user_summary(user_id)
            if summary.total_events > 0:
                base_hist["total_tasks_completed"] = max(base_hist.get("total_tasks_completed", 0), summary.tasks_completed)
                base_hist["similar_tasks_postponed"] = max(base_hist.get("similar_tasks_postponed", 0), summary.tasks_postponed)
                base_hist["total_reminders_snoozed"] = max(base_hist.get("total_reminders_snoozed", 0), summary.reminders_snoozed)
        except Exception:
            pass
        return base_hist

    def seed_user_data(self, user_id: str, tasks: List[Dict[str, Any]], reminders: Optional[List[Dict[str, Any]]] = None, history: Optional[Dict[str, Any]] = None):
        self._ensure_user(user_id)
        self._users_data[user_id]["tasks"] = copy.deepcopy(tasks)
        if reminders is not None:
            self._users_data[user_id]["reminders"] = copy.deepcopy(reminders)
        if history is not None:
            self._users_data[user_id]["history"].update(history)


# Global default in-memory adapter
default_task_store = TaskStoreAdapter()
