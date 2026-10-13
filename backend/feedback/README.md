# ReMind AI Feedback Loop and Behavioral Learning Foundation (Phase 11)

## Overview

The Feedback Loop Layer establishes an immutable, trustworthy behavioral evidence repository. It records actual observed interactions across tasks, reminders, notifications, voice commands, and agent tools.

**Architectural Boundaries:**
- **Observed vs. Inferred:** Strictly records observed actions (`TASK_COMPLETED`, `REMINDER_SNOOZED`, `COMPLETED_AFTER_REMINDER`). Does **NOT** make speculative causal claims (e.g. "reminder caused completion") or infer personal habits without verified evidence.
- **Machine Learning & Personalization:** **NOT IMPLEMENTED** in this phase. Machine learning is deferred to Phase 13, and personalization is deferred to Phase 12.
- **Data Sufficiency:** Evaluates statistical evidence conservatism (`NONE`: 0–2 events, `LIMITED`: 3–9 events, `MODERATE`: 10–19 events, `SUFFICIENT`: 20+ events).

---

## Feedback Event Taxonomy

### 1. Task Lifecycle
- `TASK_CREATED`: Task registered into system.
- `TASK_UPDATED`: Task priority, title, or fields modified.
- `TASK_COMPLETED`: Task marked finished/done.
- `TASK_POSTPONED`: Planned deadline deferred (`postpone_hours`).
- `TASK_SNOOZED`: Interim deferral.
- `TASK_CANCELLED`: Task removed or deactivated.

### 2. Reminder & Notification Lifecycle
- `REMINDER_SCHEDULED` / `NOTIFICATION_SENT`: Proactive intervention staged.
- `REMINDER_TRIGGERED` / `NOTIFICATION_DELIVERED`: Delivered across channel (`IN_APP`, `BROWSER`, `VOICE`).
- `NOTIFICATION_OPENED`: Viewed or acknowledged by user.
- `NOTIFICATION_SNOOZED`: Delay requested by user (e.g., +30 minutes).
- `NOTIFICATION_DISMISSED`: Cleared without completion.
- `NOTIFICATION_IGNORED`: Expired without user action.
- `NOTIFICATION_FAILED`: Delivery provider error.

### 3. Derived Behavioral Relationships
- `COMPLETED_AFTER_REMINDER`: Verified chronological sequence where a reminder occurred prior to task completion. Also records `time_from_reminder_to_completion_seconds` purely as descriptive measurement.
- `COMPLETED_BEFORE_REMINDER`: Task completed prior to scheduled reminder trigger.

### 4. Voice & Agent Interactions
- `VOICE_COMMAND`, `VOICE_CONFIRMATION`, `VOICE_COMPLETION`: Track spoken interactions without storing raw audio.
- `AGENT_ACTION`, `AGENT_RESPONSE`: Record bounded orchestrator tool executions.

---

## Storage & Idempotency Rules

1. **Append-Only Immutability:** Event history is never overwritten or mutated when task states transition.
2. **Duplicate Prevention:** Prevents rapid duplicate events (e.g., repeated `TASK_COMPLETED` requests within 5 seconds for the same task).
3. **Strict User Isolation:** All event queries, summaries, and timeline retrievals filter strictly by authenticated `user_id`.

---

## API Endpoints

- `GET /api/feedback/summary`: Returns descriptive metrics (`tasks_created`, `tasks_completed`, `tasks_postponed`, `reminders_snoozed`, `tasks_completed_after_reminder`, `data_sufficiency`).
- `GET /api/feedback/timeline/{task_id}`: Chronological timeline of observed actions for a task.
- `GET /api/feedback/events`: Filtered raw event log.
- `POST /api/feedback/event`: Controlled client interaction logging with task ownership verification.
