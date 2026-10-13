from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
import re

from .models import (
    NormalizedUserContext,
    ContextualEvent,
    ContextualRoutine,
    ContextRelationship,
    ContextConflict,
)
from .providers.base import CalendarContextProvider, RoutineContextProvider
from .providers.memory import MemoryCalendarContextProvider, MemoryRoutineContextProvider
from backend.agent.store import TaskStoreAdapter, default_task_store


class ContextService:
    """
    Central Context Awareness Service.
    Retrieves, normalizes, detects relationships, identifies conflicts, and calculates data quality.
    """

    def __init__(
        self,
        task_store: Optional[TaskStoreAdapter] = None,
        calendar_provider: Optional[CalendarContextProvider] = None,
        routine_provider: Optional[RoutineContextProvider] = None,
    ):
        self.task_store = task_store or default_task_store
        self.calendar_provider = calendar_provider or MemoryCalendarContextProvider()
        self.routine_provider = routine_provider or MemoryRoutineContextProvider()

    async def get_normalized_context(
        self,
        user_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        include_tasks: bool = True,
        include_events: bool = True,
        include_routines: bool = True,
    ) -> NormalizedUserContext:
        """Fetch and assemble unified normalized context strictly for user_id."""
        now = datetime.now(timezone.utc)
        start = start_time or now
        end = end_time or (now + timedelta(days=7))

        data_sources: List[str] = []

        # 1. Tasks
        raw_tasks = []
        if include_tasks:
            raw_tasks = await self.task_store.get_tasks(user_id=user_id, limit=50)
            data_sources.append("tasks")

        # 2. Calendar Events
        events: List[ContextualEvent] = []
        cal_connected = False
        if include_events and self.calendar_provider:
            cal_connected = await self.calendar_provider.is_available(user_id)
            if cal_connected:
                events = await self.calendar_provider.get_upcoming_events(user_id, start, end)
                data_sources.append("calendar")

        # 3. Routines
        routines: List[ContextualRoutine] = []
        if include_routines and self.routine_provider:
            routines = await self.routine_provider.get_user_routines(user_id)
            if routines:
                data_sources.append("routines")

        # 4. Deterministic Relationships Detection
        relationships, conflicts = self._detect_relationships_and_conflicts(raw_tasks, events, routines)

        # 5. Data Quality Calculation
        data_quality = "NONE"
        if raw_tasks and (events or routines):
            data_quality = "SUFFICIENT" if len(raw_tasks) >= 2 and (len(events) >= 1 or len(routines) >= 1) else "MODERATE"
        elif raw_tasks:
            data_quality = "LIMITED"

        return NormalizedUserContext(
            user_id=user_id,
            retrieved_at=now,
            timezone_name="UTC",
            data_quality=data_quality,
            data_sources=data_sources,
            tasks_count=len(raw_tasks),
            upcoming_events=events,
            routines=routines,
            relationships=relationships,
            conflicts=conflicts,
            calendar_connected=cal_connected,
        )

    def _detect_relationships_and_conflicts(
        self,
        tasks: List[Dict[str, Any]],
        events: List[ContextualEvent],
        routines: List[ContextualRoutine],
    ) -> Tuple[List[ContextRelationship], List[ContextConflict]]:
        """
        Deterministic, rule-based matching without LLM hallucination.
        Pairs tasks like 'Prepare slides' or 'Presentation deck' with an event like 'Presentation'.
        Detects conflicts when a task deadline differs from the paired event start time.
        """
        relationships: List[ContextRelationship] = []
        conflicts: List[ContextConflict] = []

        # Stop words to filter out generic tokens
        prep_keywords = {"prep", "prepare", "preparation", "review", "slides", "deck", "pack", "charge", "file"}

        for t in tasks:
            t_id = str(t.get("id"))
            t_title = t.get("title", "").lower()
            t_due = t.get("due_at")
            if isinstance(t_due, str):
                t_due = datetime.fromisoformat(t_due.replace("Z", "+00:00"))

            # Check match against Calendar Events
            for ev in events:
                ev_title = ev.title.lower()
                st = ev.start_time
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)

                # Match logic:
                # 1. Event title in task title (e.g. "Presentation" in "Prepare presentation")
                # 2. Shared significant stems
                matched = False
                explanation = ""

                if ev_title in t_title or any(w in t_title for w in ev_title.split() if len(w) > 3):
                    # Check if task is preparation for event
                    if any(pk in t_title for pk in prep_keywords) or "for" in t_title or "to" in t_title:
                        matched = True
                        explanation = f"Task '{t.get('title')}' represents preparation for upcoming event '{ev.title}'."
                    else:
                        matched = True
                        explanation = f"Task '{t.get('title')}' is scheduled around event '{ev.title}'."

                if matched:
                    relationships.append(
                        ContextRelationship(
                            relationship_type="preparation_for",
                            task_id=t_id,
                            event_id=ev.id,
                            confidence="HIGH",
                            source="deterministic_match",
                            explanation=explanation,
                        )
                    )

                    # Check for time conflict if both have timestamps
                    if t_due and st:
                        diff_hours = abs((t_due - st).total_seconds()) / 3600.0
                        # If task is supposed to be for the event, but task deadline is AFTER event start time:
                        if t_due > st + timedelta(minutes=15):
                            conflicts.append(
                                ContextConflict(
                                    conflict_type="time_mismatch",
                                    description=(
                                        f"Task '{t.get('title')}' deadline ({t_due.strftime('%I:%M %p')}) "
                                        f"is after the start of associated event '{ev.title}' ({st.strftime('%I:%M %p')})."
                                    ),
                                    task_id=t_id,
                                    event_id=ev.id,
                                    task_time=t_due,
                                    event_time=st,
                                )
                            )

            # Check match against Routines
            for rt in routines:
                rt_title = rt.title.lower()
                if rt_title in t_title or any(w in t_title for w in rt_title.split() if len(w) > 3):
                    relationships.append(
                        ContextRelationship(
                            relationship_type="routine_habit",
                            task_id=t_id,
                            routine_id=rt.id,
                            confidence="HIGH",
                            source="deterministic_match",
                            explanation=f"Task aligns with recurring routine '{rt.title}'.",
                        )
                    )

        return relationships, conflicts
