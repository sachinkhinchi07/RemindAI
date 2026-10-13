import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.agent.orchestrator import AgentOrchestrator
from backend.agent.models import AgentChatRequest, AgentToolExecutionRecord
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.tools.registry import create_default_registry
from backend.agent.store import TaskStoreAdapter
from backend.agent.intent import classify_user_intent

client = TestClient(app)

NOW = datetime(2026, 10, 12, 10, 0, 0, tzinfo=timezone.utc)


def run_async(coro):
    return asyncio.run(coro)


@pytest.fixture
def store_with_data():
    adapter = TaskStoreAdapter()
    user_a = "user_alice"
    tasks = [
        {
            "id": "task_1",
            "user_id": user_a,
            "title": "Prepare Client Pitch Deck",
            "priority": "high",
            "status": "pending",
            "due_at": (NOW + timedelta(hours=14)).isoformat(),
            "is_routine": False,
            "tags": ["slides", "metrics"],
        },
        {
            "id": "task_2",
            "user_id": user_a,
            "title": "Water the office plants",
            "priority": "low",
            "status": "pending",
            "due_at": (NOW + timedelta(days=5)).isoformat(),
            "is_routine": True,
            "tags": [],
        },
    ]
    adapter.seed_user_data(user_a, tasks=tasks)
    return adapter, user_a


# --- 1. Intent Classification Tests ---

def test_intent_highest_risk():
    res1 = classify_user_intent("What might I forget today?")
    assert res1.intent_name == "highest_risk_task"

    res2 = classify_user_intent("Which task looks most risky?")
    assert res2.intent_name == "highest_risk_task"


def test_intent_schedule_riskiest():
    res = classify_user_intent("Remind me about the task that looks most risky.")
    assert res.intent_name == "schedule_riskiest_reminder"
    assert res.requires_action is True


def test_intent_prepare_tomorrow():
    res = classify_user_intent("What should I prepare for tomorrow?")
    assert res.intent_name == "prepare_tomorrow"


def test_intent_complete_task():
    res = classify_user_intent("Mark my presentation task as completed")
    assert res.intent_name == "complete_task"
    assert res.requires_action is True


def test_intent_postpone_task():
    res = classify_user_intent("Postpone my pitch deck until tomorrow")
    assert res.intent_name == "postpone_task"
    assert res.requires_action is True


def test_intent_unknown():
    res = classify_user_intent("Tell me a random joke about horses")
    assert res.intent_name == "unknown"


# --- 2. Tool Execution & Safety Tests ---

def test_tool_execution_valid(store_with_data):
    adapter, user = store_with_data
    registry = create_default_registry()
    ctx = ToolExecutionContext(user_id=user, data_store=adapter)

    tool = registry.get("get_user_tasks")
    assert tool is not None
    out = run_async(tool.run({"limit": 5}, ctx))
    assert out.total_count == 2
    assert out.tasks[0].title == "Prepare Client Pitch Deck"


def test_tool_unauthorized_access(store_with_data):
    adapter, _ = store_with_data
    registry = create_default_registry()
    # Missing user_id in context
    ctx = ToolExecutionContext(user_id="", data_store=adapter)
    tool = registry.get("get_user_tasks")

    with pytest.raises(PermissionError):
        run_async(tool.run({"limit": 5}, ctx))


def test_tool_unknown_rejected():
    orchestrator = AgentOrchestrator()
    ctx = ToolExecutionContext(user_id="test_user")
    trace = []
    with pytest.raises(ValueError):
        run_async(orchestrator.execute_tool("drop_all_tables", {}, ctx, trace))
    assert trace[0].success is False


# --- 3. Primary Demo Flow: "Remind me about the task that looks most risky" ---

def test_demo_flow_schedule_riskiest_reminder(store_with_data):
    adapter, user = store_with_data
    orchestrator = AgentOrchestrator()
    ctx = ToolExecutionContext(user_id=user, data_store=adapter)

    req = AgentChatRequest(message="Remind me about the task that looks most risky.")
    resp = run_async(orchestrator.run(req, ctx))

    assert resp.intent == "schedule_riskiest_reminder"
    assert "Prepare Client Pitch Deck" in resp.message
    assert len(resp.actions) == 1
    assert resp.actions[0]["reminder_created"] is True
    assert "get_upcoming_tasks" in resp.tool_calls
    assert "calculate_forgetfulness_risk" in resp.tool_calls
    assert "create_reminder" in resp.tool_calls


# --- 4. Risk Engine Integration Fidelity ---

def test_agent_uses_real_risk_engine(store_with_data):
    adapter, user = store_with_data
    orchestrator = AgentOrchestrator()
    ctx = ToolExecutionContext(user_id=user, data_store=adapter)

    req = AgentChatRequest(message="What might I forget today?")
    resp = run_async(orchestrator.run(req, ctx))

    assert resp.intent == "highest_risk_task"
    assert "Prepare Client Pitch Deck" in resp.message
    assert "Risk Score:" in resp.message


# --- 5. Reminder Decision Engine Integration & Duplicate Blocking ---

def test_agent_respects_reminder_decision_engine(store_with_data):
    adapter, user = store_with_data
    orchestrator = AgentOrchestrator()
    ctx = ToolExecutionContext(user_id=user, data_store=adapter)

    # First call: creates reminder
    req = AgentChatRequest(message="Remind me about the task that looks most risky.")
    resp1 = run_async(orchestrator.run(req, ctx))
    assert resp1.actions[0]["reminder_created"] is True

    # Second immediate call: should be blocked by anti-duplicate rule in Reminder Decision Engine
    resp2 = run_async(orchestrator.run(req, ctx))
    assert resp2.actions[0]["reminder_created"] is False
    assert resp2.actions[0]["blocked"] is True
    assert "no new reminder was created" in resp2.message.lower()


# --- 6. User Data Isolation Security Tests ---

def test_user_data_isolation():
    adapter = TaskStoreAdapter()
    user_alice = "alice"
    user_bob = "bob"

    adapter.seed_user_data(user_alice, tasks=[{"id": "a_1", "user_id": user_alice, "title": "Alice's Secret Task"}])
    adapter.seed_user_data(user_bob, tasks=[{"id": "b_1", "user_id": user_bob, "title": "Bob's Public Task"}])

    registry = create_default_registry()
    alice_ctx = ToolExecutionContext(user_id=user_alice, data_store=adapter)
    bob_ctx = ToolExecutionContext(user_id=user_bob, data_store=adapter)

    get_tasks_tool = registry.get("get_user_tasks")

    alice_tasks = run_async(get_tasks_tool.run({}, alice_ctx))
    bob_tasks = run_async(get_tasks_tool.run({}, bob_ctx))

    assert len(alice_tasks.tasks) == 1
    assert alice_tasks.tasks[0].title == "Alice's Secret Task"

    assert len(bob_tasks.tasks) == 1
    assert bob_tasks.tasks[0].title == "Bob's Public Task"

    # Alice cannot calculate risk on Bob's task ID
    calc_risk_tool = registry.get("calculate_forgetfulness_risk")
    with pytest.raises(ValueError):
        run_async(calc_risk_tool.run({"task_id": "b_1"}, alice_ctx))


# --- 7. Task Mutating Tools (Complete & Postpone) ---

def test_agent_complete_task(store_with_data):
    adapter, user = store_with_data
    orchestrator = AgentOrchestrator()
    ctx = ToolExecutionContext(user_id=user, data_store=adapter)

    req = AgentChatRequest(message="Mark my pitch deck task as completed")
    resp = run_async(orchestrator.run(req, ctx))

    assert resp.intent == "complete_task"
    assert "completed" in resp.message.lower()

    # Verify task status in store
    task = run_async(adapter.get_task_by_id(user, "task_1"))
    assert task["status"] == "done"


def test_agent_postpone_task(store_with_data):
    adapter, user = store_with_data
    orchestrator = AgentOrchestrator()
    ctx = ToolExecutionContext(user_id=user, data_store=adapter)

    req = AgentChatRequest(message="Postpone my pitch deck until tomorrow")
    resp = run_async(orchestrator.run(req, ctx))

    assert resp.intent == "postpone_task"
    assert "postponed" in resp.message.lower()


# --- 8. API Endpoint End-to-End ---

def test_api_agent_chat_endpoint():
    res = client.post("/api/agent/chat", json={
        "message": "What might I forget today?",
        "user_id": "api_test_user",
    })
    assert res.status_code == 200
    data = res.json()
    assert "message" in data
    assert "intent" in data
    assert "tool_calls" in data


def test_api_agent_tools_listing():
    res = client.get("/api/agent/tools")
    assert res.status_code == 200
    data = res.json()
    assert "tools" in data
    tool_names = [t["name"] for t in data["tools"]]
    assert "calculate_forgetfulness_risk" in tool_names
    assert "create_reminder" in tool_names
    assert "get_upcoming_tasks" in tool_names
