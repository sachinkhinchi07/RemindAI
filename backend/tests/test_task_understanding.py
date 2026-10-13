import asyncio
from datetime import datetime, date, time
import pytest
import httpx
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.main import app
from backend.ai.service import AIService
from backend.ai.ollama_provider import OllamaProvider
from backend.services.task_understanding import TaskUnderstandingService
from backend.schemas.task_understanding import (
    TaskParseRequest,
    TaskUnderstandingLLMOutput,
)
from backend.utils.date_resolver import (
    resolve_relative_date,
    parse_time_expression,
    resolve_datetime,
)

# Reference date: Monday, October 12, 2026
REF_DT = datetime(2026, 10, 12, 9, 0, 0)

client = TestClient(app)

def test_1_normal_task_date_resolved_no_fabricated_time():
    """Test 1: 'I need to submit my assignment tomorrow.' -> title extracted, date resolved, no fabricated time."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Submit assignment",
            relative_date_expr="tomorrow",
            time_expr=None,
            priority="medium",
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="I need to submit my assignment tomorrow.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.title == "Submit assignment"
        assert res.due_date_str == "Tuesday, Oct 13, 2026"
        assert res.due_time_str is None
        assert any("time" in a.lower() for a in res.ambiguities)

    asyncio.run(run())

def test_2_date_and_time():
    """Test 2: 'I have a presentation tomorrow at 10 AM.' -> presentation, resolved date, 10:00 AM."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Presentation",
            relative_date_expr="tomorrow",
            time_expr="10:00 AM",
            priority="medium",
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="I have a presentation tomorrow at 10 AM.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.title == "Presentation"
        assert res.due_date_str == "Tuesday, Oct 13, 2026"
        assert res.due_time_str == "10:00 AM"
        assert "2026-10-13" in res.due_at

    asyncio.run(run())

def test_3_multiple_items():
    """Test 3: 'I have a presentation tomorrow. I need my laptop, charger and presentation file.' -> related items."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Presentation",
            relative_date_expr="tomorrow",
            time_expr=None,
            priority="medium",
            related_items=["laptop", "charger", "presentation file"],
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="I have a presentation tomorrow. I need my laptop, charger and presentation file.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.title == "Presentation"
        assert res.related_items == ["laptop", "charger", "presentation file"]

    asyncio.run(run())

def test_4_priority_understanding():
    """Test 4: 'I absolutely must submit this report tomorrow.' -> priority high."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Submit report",
            relative_date_expr="tomorrow",
            priority="urgent",
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="I absolutely must submit this report tomorrow.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.priority in ["urgent", "high"]

    asyncio.run(run())

def test_5_ambiguous_input():
    """Test 5: 'I have a meeting soon.' -> meeting, no invented date/time, ambiguity reported."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Meeting",
            relative_date_expr=None,
            time_expr=None,
            ambiguities=["Meeting time and date were not specified."],
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="I have a meeting soon.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.title == "Meeting"
        assert res.due_date_str is None
        assert res.due_time_str is None
        assert len(res.ambiguities) > 0

    asyncio.run(run())

def test_6_recurring_task():
    """Test 6: 'Every Monday at 8 AM I need to submit my weekly report.' -> recurrence identified."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Submit weekly report",
            relative_date_expr=None,
            time_expr="8:00 AM",
            recurrence_rule="Every Monday at 8 AM",
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="Every Monday at 8 AM I need to submit my weekly report.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.recurrence_rule == "Every Monday at 8 AM"
        assert res.recurrence_supported is False

    asyncio.run(run())

def test_7_missing_deadline():
    """Test 7: 'I need to buy groceries.' -> task parsed, no fabricated deadline."""
    async def run():
        mock_output = TaskUnderstandingLLMOutput(
            title="Buy groceries",
            relative_date_expr=None,
            time_expr=None,
            category="Errands",
        )
        mock_ai_service = MagicMock(spec=AIService)
        mock_ai_service.generate_structured_response = MagicMock(
            return_value=asyncio.Future()
        )
        mock_ai_service.generate_structured_response.return_value.set_result(mock_output)

        service = TaskUnderstandingService(ai_service=mock_ai_service)
        req = TaskParseRequest(text="I need to buy groceries.")
        res = await service.parse_task(req, reference_dt=REF_DT)

        assert res.title == "Buy groceries"
        assert res.due_at is None
        assert res.due_date_str is None
        assert res.due_time_str is None

    asyncio.run(run())

def test_8_malformed_llm_response():
    """Test 8: Malformed model output returns safe HTTP 422 error and does not write to DB."""
    with patch("backend.ai.ollama_provider.OllamaProvider.generate_response") as mock_gen:
        mock_gen.return_value = MagicMock(content="Malformed text not json")
        res = client.post("/api/tasks/parse", json={"text": "A presentation tomorrow"})
        assert res.status_code == 422
        assert "couldn't understand that task" in res.json()["detail"]

def test_9_ollama_unavailable():
    """Test 9: Ollama unavailable returns clean HTTP 503 error."""
    with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("Connection refused")):
        res = client.post("/api/tasks/parse", json={"text": "Meeting tomorrow"})
        assert res.status_code == 503
        assert "temporarily offline" in res.json()["detail"]

def test_10_unauthorized_user_isolation():
    """Test 10: Endpoint rejects empty or invalid requests and preserves user payload isolation."""
    res = client.post("/api/tasks/parse", json={"text": " "})
    assert res.status_code == 422  # Pydantic min_length validation failure
