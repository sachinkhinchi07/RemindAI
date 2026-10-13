# ReMind AI Notification Infrastructure (Phase 10)

## Overview

The Notification Infrastructure Layer is responsible for delivering approved reminder decisions to users across supported channels.

**Architectural Boundaries:**
- **Deterministic Risk Engine:** Calculates forgetfulness risk scores.
- **Reminder Decision Engine:** Decides *if* and *when* a reminder should trigger.
- **Notification Infrastructure (This Layer):** Handles delivery scheduling, state transitions, duplicate suppression, action execution (Complete, Snooze, Dismiss), and feedback logging.
- **LLM/AI Service:** Is **NOT** used to schedule reminders, choose delivery channels, or trigger actions.

---

## Supported Notification Channels

1. `IN_APP`: Delivered directly to the UI Notification Center.
2. `BROWSER`: Web Notification API payload dispatch.
3. `VOICE`: Spoken notifications via Web Speech API / local TTS synthesizer.

---

## Notification Lifecycle States

```text
[SCHEDULED] ───► [SENDING] ───► [DELIVERED] ───► [READ]
      │              │               │
      │              └──► [FAILED]   ├──► [SNOOZED] (schedules new reminder)
      │                     (retry)  ├──► [COMPLETED_AFTER_REMINDER]
      ▼                              └──► [DISMISSED]
 [CANCELLED] (if task completed/cancelled before delivery)
```

1. **`SCHEDULED`**: Reminder is registered with target delivery time `due_at`.
2. **`SENDING`**: Delivery in progress by provider.
3. **`DELIVERED`**: Successfully rendered in-app or presented to user.
4. **`FAILED`**: Provider delivery error. Retried up to 3 times before terminal failure.
5. **`CANCELLED`**: Suppressed because the underlying task was completed or cancelled before delivery.
6. **`READ`**: Acknowledged by user in the UI.
7. **`SNOOZED`**: Snoozed by user; original marked `SNOOZED`, new reminder scheduled for `now + snooze_minutes`.
8. **`DISMISSED`**: Dismissed by user explicitly.

---

## Duplicate Prevention Rules

1. Before scheduling a new notification, the engine queries active notifications for `(user_id, task_id, channel)`.
2. Any notification with status in `["SCHEDULED", "SENDING", "DELIVERED"]` is considered active.
3. If an active notification already exists, the scheduling request returns the existing record instead of creating a duplicate.

---

## Completed Task Suppression

1. Prior to scheduling, if the target task is already in status `done` or `completed`, scheduling is rejected.
2. During queue processing (`deliver_due_notifications`), the system inspects the current status of the task. If the user finished or cancelled the task in the interim, the notification status transitions immediately to `CANCELLED` and logs a `CANCELLED_TASK_COMPLETED` behavioral feedback event.

---

## Behavioral Feedback Schema (Foundations for Phase 11)

Every delivery, state transition, and user action records an immutable feedback event:
- `event_id`: Unique UUID.
- `user_id`: Authenticated user id.
- `notification_id`: Reference notification.
- `task_id`: Underlying task.
- `reminder_id`: Reminder reference if applicable.
- `event_type`: `SCHEDULED` | `DELIVERED` | `READ` | `SNOOZED` | `DISMISSED` | `COMPLETED_AFTER_REMINDER` | `CANCELLED_TASK_COMPLETED` | `DELIVERY_FAILED`
- `timestamp`: UTC ISO8601 string.
- `metadata`: Relevant context (e.g., snooze duration, channel, retry attempt).

---

## API Endpoints

- `GET /api/notifications`: Retrieve all active or recent notifications for the authenticated user (`x-user-id`).
- `POST /api/notifications/schedule`: Schedule a notification from an approved reminder decision.
- `POST /api/notifications/{notification_id}/action`: Execute user action (`COMPLETE`, `SNOOZE`, `DISMISS`, `READ`).
