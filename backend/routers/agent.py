from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional
import logging

from backend.agent.models import AgentChatRequest, AgentChatResponse
from backend.agent.orchestrator import AgentOrchestrator
from backend.agent.tools.base import ToolExecutionContext
from backend.agent.tools.registry import create_default_registry
from backend.agent.store import default_task_store
from backend.ai import AIService, get_ai_service

logger = logging.getLogger("remind.agent.router")

router = APIRouter(prefix="/api/agent", tags=["AI Agent"])

_shared_registry = create_default_registry()


def get_agent_orchestrator(ai_service: AIService = Depends(get_ai_service)) -> AgentOrchestrator:
    return AgentOrchestrator(ai_service=ai_service, tool_registry=_shared_registry)


@router.post("/chat", response_model=AgentChatResponse)
async def agent_chat_endpoint(
    request: AgentChatRequest,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None),
    orchestrator: AgentOrchestrator = Depends(get_agent_orchestrator),
):
    """
    Phase 8 AI Agent Orchestration Endpoint:
    Processes natural-language inquiries, plans tool execution, coordinates the Risk Engine
    and Reminder Decision Engine, and returns a verified, factual response.
    """
    # Resolve user identity safely (header or payload, fallback to demo_user)
    effective_user_id = x_user_id or request.user_id or "demo_user"

    context = ToolExecutionContext(
        user_id=effective_user_id,
        auth_token=authorization,
        data_store=default_task_store,
    )

    try:
        response = await orchestrator.run(request, context)
        return response
    except Exception as exc:
        logger.exception("Error in agent chat endpoint")
        raise HTTPException(
            status_code=500,
            detail=f"Agent orchestration failed: {str(exc)}",
        )


@router.get("/tools")
async def list_agent_tools():
    """List available and approved tools registered in the Agent orchestration registry."""
    return {"tools": _shared_registry.get_tool_descriptions()}
