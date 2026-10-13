from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from datetime import datetime
from ..models import ContextualEvent, ContextualRoutine


class BaseContextProvider(ABC):
    """Abstract base provider for modular context ingestion."""

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Identifier for the source (e.g. 'calendar', 'tasks', 'routines')."""
        pass

    @abstractmethod
    async def is_available(self, user_id: str) -> bool:
        """Whether this provider has active credentials/connection for the user."""
        pass


class CalendarContextProvider(BaseContextProvider):
    """Calendar provider interface supporting current demo events or future Google Calendar."""

    @property
    def source_name(self) -> str:
        return "calendar"

    @abstractmethod
    async def get_upcoming_events(
        self,
        user_id: str,
        start_time: datetime,
        end_time: datetime,
        limit: int = 20,
    ) -> List[ContextualEvent]:
        """Fetch calendar events in time window strictly for user_id."""
        pass


class RoutineContextProvider(BaseContextProvider):
    """Routine and habit provider interface."""

    @property
    def source_name(self) -> str:
        return "routines"

    @abstractmethod
    async def get_user_routines(self, user_id: str) -> List[ContextualRoutine]:
        """Fetch active routines strictly for user_id."""
        pass
