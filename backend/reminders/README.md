# Reminder Decision Engine

## Overview
The **Reminder Decision Engine** is a deterministic intelligence component in ReMind AI. It evaluates whether a proactive reminder should be scheduled, determines optimal timing, sets the intervention level, and enforces quiet hours, anti-spam caps, and task state lifecycle blocks.

IMPORTANT ARCHITECTURAL RULE:
- **No LLMs are used for reminder decisions.** The LLM only handles natural-language parsing (Phase 4). The Forgetfulness Risk Engine (Phase 5) computes numerical risk. The Reminder Decision Engine deterministically decides *when* and *how* to intervene.

---

## Decision Rules & Urgency Thresholds

| Risk Level | Risk Score | Task State | Proactive Reminder? | Intervention Level | Timing Strategy |
|---|---|---|---|---|---|
| **DONE / CANCELLED** | Any | Done / Cancelled | **No** (Blocked) | `NONE` | N/A |
| **LOW** | < 30 | Active | **No** | `NONE` | No proactive notification needed |
| **MEDIUM** | 30 – 69 | Active | **Yes** | `LOW_NUDGE` | 2h before deadline (or 45m if <4h away) |
| **HIGH** | $\ge$ 70 | Active | **Yes** | `PROACTIVE` | 3h before deadline (or evening before if tomorrow morning) |
| **OVERDUE** | Any | Active & Past Due | **Yes** | `ESCALATION` | Immediate window (`now + 15m`), banner & desktop channels |

---

## Anti-Spam & Quiet Hours Protections

1. **Maximum Reminders Limit:**
   - Tasks are limited to a maximum of **2 proactive reminders** to avoid notification fatigue.
2. **Duplicate Time Proximity:**
   - Proactive reminders will not be created if an active reminder is already scheduled within **2 hours** of the recommended time.
3. **Active Snooze Protection:**
   - If a reminder is in `snoozed` status with a future `snooze_until` timestamp, proactive suggestions are blocked.
4. **Quiet Hours Shift:**
   - Default quiet hours: `22:00` to `08:00`.
   - If a candidate reminder time lands within quiet hours:
     - Shifted to the morning after quiet hours (`08:15`).
     - **Deadline Safeguard:** If shifting forward would exceed or meet `due_at`, the reminder is shifted backwards to the evening before quiet hours (`21:30`).

---

## Data Models

Located in [`backend/reminders/models.py`](file:///C:/Users/user/Desktop/Remind AI/Remind AI/backend/reminders/models.py):
- `ReminderDecisionInput`: Input containing task metadata, due date, risk score, risk level, existing reminders, preferences, and reference timestamp.
- `ReminderDecision`: Output detailing `should_remind`, `intervention_level`, `recommended_time`, `reason`, `blocked`, and `decision_factors`.
- `UserReminderPreferences`: User configurations (quiet hours start/end, buffer minutes, preferred delivery channels).
- `ExistingReminderInfo`: Active/delivered/snoozed reminder states for deduplication.

---

## API Endpoints

- `POST /api/tasks/reminder-decision`
  Evaluates a single task's reminder decision. Returns a validated `ReminderDecision` payload.
