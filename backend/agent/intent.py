import re
from typing import Any, Dict, Optional
from .models import AgentIntent


def classify_user_intent(message: str) -> AgentIntent:
    """
    Deterministic & robust pattern-matching classifier with entity extraction.
    Ensures safe classification even if Ollama is unavailable or slow.
    """
    msg = message.strip().lower()

    # 1. Schedule riskiest reminder: "Remind me about the task that looks most risky", "schedule reminder for risky task"
    if ("remind" in msg or "reminder" in msg) and ("riskiest" in msg or "most risky" in msg or "high risk" in msg):
        return AgentIntent(
            intent_name="schedule_riskiest_reminder",
            entities={},
            requires_action=True,
            confidence=0.95,
        )

    # 2. Highest risk query: "What might I forget today?", "Which task looks most risky?", "What is my riskiest task?"
    if (
        "what might i forget" in msg
        or "most risky" in msg
        or "riskiest" in msg
        or "which task looks most risky" in msg
        or "routine slippage" in msg
        or "forget today" in msg
    ):
        return AgentIntent(
            intent_name="highest_risk_task",
            entities={},
            requires_action=False,
            confidence=0.92,
        )

    # 3. Prepare for tomorrow: "What should I prepare for tomorrow?", "Help me prepare for tomorrow"
    if "prepare" in msg and "tomorrow" in msg:
        return AgentIntent(
            intent_name="prepare_tomorrow",
            entities={"target_day": "tomorrow"},
            requires_action=False,
            confidence=0.94,
        )

    # 4. Mark completed: "Mark my presentation task as completed", "complete presentation task"
    if "completed" in msg or "mark" in msg and "done" in msg or "complete " in msg:
        # Extract title if present: "mark <title> [as] completed/done"
        match = re.search(r"(?:mark|complete)\s+(?:my\s+)?(.*?)(?:\s+as\s+completed|\s+as\s+done|\s+task|\s*$)", msg)
        task_name = match.group(1).replace("task", "").strip() if match else ""
        return AgentIntent(
            intent_name="complete_task",
            entities={"title_query": task_name},
            requires_action=True,
            confidence=0.90,
        )

    # 5. Postpone task: "Postpone my presentation until tomorrow", "postpone presentation by 2 hours"
    if "postpone" in msg or "delay" in msg or "push" in msg:
        hours = 24 if "tomorrow" in msg else 2
        match = re.search(r"(?:postpone|delay|push)\s+(?:my\s+)?(.*?)(?:\s+until|\s+by|\s+task|\s*$)", msg)
        task_name = match.group(1).replace("task", "").strip() if match else ""
        return AgentIntent(
            intent_name="postpone_task",
            entities={"title_query": task_name, "postpone_hours": hours},
            requires_action=True,
            confidence=0.88,
        )

    # 6. Explicit reminder request: "Remind me to check emails at 5pm", "Create a reminder for presentation"
    if "remind" in msg or "reminder" in msg:
        match = re.search(r"(?:remind me (?:about|to)|create a? reminder for)\s+(.*)", msg)
        query = match.group(1).strip() if match else ""
        return AgentIntent(
            intent_name="create_task_reminder",
            entities={"title_query": query},
            requires_action=True,
            confidence=0.85,
        )

    # 7. Check history: "Check my history", "How many tasks have I completed?", "What is my past routine?"
    if "history" in msg or "how many tasks" in msg or "past" in msg or "track record" in msg:
        return AgentIntent(
            intent_name="check_history",
            entities={},
            requires_action=False,
            confidence=0.89,
        )

    # 8. Upcoming tasks: "Do I have anything important coming up?", "Review my upcoming deadlines", "upcoming tasks"
    if "upcoming" in msg or "deadlines" in msg or "coming up" in msg or "schedule" in msg or "next tasks" in msg:
        return AgentIntent(
            intent_name="upcoming_tasks",
            entities={"timeframe_hours": 48},
            requires_action=False,
            confidence=0.91,
        )

    # Default unknown
    return AgentIntent(
        intent_name="unknown",
        entities={},
        requires_action=False,
        confidence=0.30,
    )
