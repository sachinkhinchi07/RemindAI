# Context Awareness Layer

## 1. Architecture Overview
The **Context Awareness Layer** (`backend/context/`) normalizes real user environment signals (tasks, calendar events, routines), detects deterministic task-event relationships, flags time conflicts, and calculates data quality scores.

```text
User / Task / Event / Routine Data
            ↓
     Context Providers (CalendarContextProvider, RoutineContextProvider)
            ↓
      ContextService
            ↓
    Normalized Context (NormalizedUserContext)
       ↙     ↓      ↘
 Risk Engine  Agent  Reminder Engine
```

### Core Separation of Responsibilities
- **Context Layer:** Retrieves and normalizes factual context, links tasks to events, and identifies conflicts.
- **Risk Engine (Phase 5):** The sole deterministic authority for forgetfulness risk calculations. It consumes context signals (e.g. `has_associated_event`, `event_imminent`) without double-counting deadlines.
- **Reminder Decision Engine (Phase 7):** The sole deterministic authority for intervention timing and anti-spam blocking. It aligns preparation reminders with associated calendar events.
- **AI Agent (Phase 8):** The orchestrator utilizing tools (`get_upcoming_events`) to answer contextual queries.
- **LLM:** Natural language understanding and explanation. **Never used to invent context or calculate scores.**

---

## 2. Context Providers & Data Sources
- `CalendarContextProvider` (Interface): Fetches upcoming events for the authenticated user within a time range.
  - Implemented by `MemoryCalendarContextProvider`: Realistic event sandbox supporting live seeding and clean disconnection states.
- `RoutineContextProvider` (Interface): Fetches recurring cognitive habits and preparation items.
  - Implemented by `MemoryRoutineContextProvider`: Recurring routines (e.g. morning setup, college prep).
- `TaskStoreAdapter`: Retrieves current tasks scoped strictly to `user_id`.

---

## 3. Normalized Context Schema (`NormalizedUserContext`)
- `user_id`: Authenticated user scope.
- `retrieved_at`: Timestamp of context snapshot.
- `data_quality`: `NONE` | `LIMITED` | `MODERATE` | `SUFFICIENT`.
- `data_sources`: List of active sources (e.g. `["tasks", "calendar", "routines"]`).
- `upcoming_events`: List of `ContextualEvent` items (`id`, `title`, `start_time`, `end_time`, `location`, `source`).
- `routines`: List of `ContextualRoutine` items (`id`, `title`, `typical_time`, `preparation_items`).
- `relationships`: Deterministic links (`ContextRelationship`) linking tasks to upcoming events (e.g. "Prepare presentation" $\rightarrow$ "Presentation").
- `conflicts`: Explicitly detected conflicts (`ContextConflict`, e.g. task deadline scheduled after event start time).
- `calendar_connected`: Boolean flag indicating whether third-party calendar sync is active or disconnected.

---

## 4. Missing & Conflicting Context Handling
- **Missing Data:** When calendar sync is disconnected, the system explicitly reports that calendar data is unavailable rather than assuming zero events exist.
- **Conflicting Data:** If a preparation task deadline occurs after the scheduled event start, a `time_mismatch` conflict record is generated and surfaced without silent overwrites.

---

## 5. Security & Isolation
- All context lookups filter strictly by `user_id`. Cross-user event or task leakage is strictly blocked and verified via unit tests.
