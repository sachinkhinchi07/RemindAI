from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
import copy

from .base import CalendarContextProvider, RoutineContextProvider
from ..models import ContextualEvent, ContextualRoutine


class MemoryCalendarContextProvider(CalendarContextProvider):
    """
    In-memory / Sandbox calendar provider.
    Maintains clean user isolation with realistic upcoming events or empty states.
    Allows seeding events per user for testing and demo flows.
    """

    def __init__(self):
        # { user_id: [ContextualEvent, ...] }
        self._user_events: Dict[str, List[ContextualEvent]] = {}
        self._connected_users: Dict[str, bool] = {}

    async def is_available(self, user_id: str) -> bool:
        return self._connected_users.get(user_id, True)

    def set_available(self, user_id: str, available: bool):
        self._connected_users[user_id] = available

    def seed_events(self, user_id: str, events: List[ContextualEvent]):
        self._user_events[user_id] = copy.deepcopy(events)

    async def get_upcoming_events(
        self,
        user_id: str,
        start_time: datetime,
        end_time: datetime,
        limit: int = 20,
    ) -> List[ContextualEvent]:
        if not await self.is_available(user_id):
            return []

        events = self._user_events.get(user_id, [])
        matched = []
        for e in events:
            # Check overlap / range
            st = e.start_time
            if st.tzinfo is None:
                st = st.replace(tzinfo=timezone.utc)
            if start_time <= st <= end_time:
                matched.append(e)

        matched.sort(key=lambda x: x.start_time)
        return matched[:limit]


class MemoryRoutineContextProvider(RoutineContextProvider):
    """
    Routine provider supplying recurring cognitive habits.
    """

    def __init__(self):
        self._user_routines: Dict[str, List[ContextualRoutine]] = {}

    async def is_available(self, user_id: str) -> bool:
        return True

    def seed_routines(self, user_id: str, routines: List[ContextualRoutine]):
        self._user_routines[user_id] = copy.deepcopy(routines)

    async def get_user_routines(self, user_id: str) -> List[ContextualRoutine]:
        return self._user_routines.get(user_id, [])
