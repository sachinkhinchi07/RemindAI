# AI Agent Orchestration Layer

## 1. Overview & Architectural Principle
The **ReMind AI Agent** is a bounded, tool-restricted orchestration layer that coordinates user intent, context, and domain services.

### Core Architectural Separation
- **LLM / Natural Language Understanding:** Parses user statements into structured intents and communicates findings.
- **Forgetfulness Risk Engine (Phase 5):** The sole deterministic source of truth for numerical risk scoring (0–100), risk levels (`LOW`, `MEDIUM`, `HIGH`), and contributing factors. The Agent *never* invents or modifies risk scores.
- **Reminder Decision Engine (Phase 7):** The sole deterministic source of truth for proactive reminder decisions, intervention levels, quiet hours adjustments, and anti-spam blocking. The Agent *never* creates reminders bypassing this engine.
- **AI Agent (Phase 8):** The orchestrator coordinating tools, enforcing user isolation, observing tool facts, and synthesizing explanations.

---

## 2. Agent Execution Flow
```text
User Natural-Language Query ("Remind me about the task that looks most risky")
                                  ↓
                       Intent Classification
                                  ↓
                  Approved Tool Execution Pipeline
            (Bounded: MAX_TOOL_CALLS = 10, no loops)
                                  ↓
        ┌─────────────────────────┴─────────────────────────┐
        ↓                                                   ↓
get_upcoming_tasks                         calculate_forgetfulness_risk
(Filtered by user_id)                        (Phase 5 Deterministic Engine)
        ↓                                                   ↓
        └─────────────────────────┬─────────────────────────┘
                                  ↓
                     Identify Highest-Risk Task
                                  ↓
                           create_reminder
              (Phase 7 Deterministic Reminder Decision Engine)
                                  ↓
           Persist Reminder (Only if Approved by Engine)
                                  ↓
                   Verified Natural-Language Response
```

---

## 3. Registered Tool Registry

| Tool Name | Description | Mutating? | Requires Auth? |
|---|---|---|---|
| `get_user_tasks` | Retrieves active/historical tasks for authenticated user | No | Yes |
| `get_upcoming_tasks` | Retrieves upcoming tasks within lookahead window (e.g. 48h/72h) | No | Yes |
| `get_user_preferences`| Retrieves reminder preferences (quiet hours, channels) | No | Yes |
| `get_task_history` | Retrieves completion, overdue, and snooze metrics | No | Yes |
| `calculate_forgetfulness_risk` | Evaluates task risk strictly via Phase 5 Risk Engine | No | Yes |
| `get_upcoming_events` | Safe context stub for external calendar integration (Phase 9) | No | Yes |
| `create_reminder` | Schedules a reminder strictly via Phase 7 Decision Engine | Yes | Yes |
| `update_task` | Modifies authorized task fields (complete, postpone, priority) | Yes | Yes |

---

## 4. Security & User Isolation
- Every tool call receives a `ToolExecutionContext` containing the verified `user_id`.
- The storage adapter enforces strict user scoping (`user_id = context.user_id`).
- Cross-user queries and mutations are blocked (tested and verified).
- No arbitrary code execution, SQL generation, or direct database credentials exposure.

---

## 5. API Endpoints
- `POST /api/agent/chat`
  Processes natural-language queries and executes bounded tool workflows.
- `GET /api/agent/tools`
  Returns JSON schemas and metadata for all approved tools.
