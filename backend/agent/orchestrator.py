import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta

from .models import AgentChatRequest, AgentChatResponse, AgentIntent, AgentToolExecutionRecord
from .tools.base import ToolRegistry, ToolExecutionContext
from .tools.registry import create_default_registry
from .tools.schemas import (
    GetUpcomingTasksInput, CalculateRiskInput, CreateReminderInput,
    GetUserTasksInput, UpdateTaskInput, GetTaskHistoryInput
)
from .intent import classify_user_intent
from backend.ai import AIService, AIGenerationRequest

logger = logging.getLogger("remind.agent")


class AgentOrchestrator:
    """
    Bounded, tool-restricted AI Agent orchestration layer.
    Coordinates intent parsing, tool selection, domain engine invocation, and natural explanations.
    """

    MAX_TOOL_CALLS = 10  # Strict bound against runaway cycles

    def __init__(self, ai_service: Optional[AIService] = None, tool_registry: Optional[ToolRegistry] = None):
        self.ai_service = ai_service
        self.tool_registry = tool_registry or create_default_registry()

    async def execute_tool(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        context: ToolExecutionContext,
        trace: List[AgentToolExecutionRecord],
    ) -> Any:
        """Controlled, audited tool execution with schema validation and error capture."""
        tool = self.tool_registry.get(tool_name)
        if not tool:
            err_msg = f"Tool '{tool_name}' is not recognized in approved tool registry."
            logger.warning(err_msg)
            trace.append(AgentToolExecutionRecord(tool_name=tool_name, arguments=arguments, success=False, error=err_msg))
            raise ValueError(err_msg)

        try:
            result = await tool.run(raw_args=arguments, context=context)
            out_dict = result.model_dump() if hasattr(result, "model_dump") else (result.dict() if hasattr(result, "dict") else dict(result))
            trace.append(AgentToolExecutionRecord(tool_name=tool_name, arguments=arguments, success=True, output=out_dict))
            return result
        except Exception as exc:
            err_msg = str(exc)
            logger.error(f"Error executing tool '{tool_name}': {err_msg}")
            trace.append(AgentToolExecutionRecord(tool_name=tool_name, arguments=arguments, success=False, error=err_msg))
            raise exc

    async def run(self, request: AgentChatRequest, context: ToolExecutionContext) -> AgentChatResponse:
        """
        Main execution flow:
        1. Classify intent.
        2. Plan and execute approved sequence of tools (up to MAX_TOOL_CALLS).
        3. Capture verified tool facts.
        4. Synthesize natural language response adhering strictly to observed facts.
        """
        trace: List[AgentToolExecutionRecord] = []
        intent: AgentIntent = classify_user_intent(request.message)
        user_id = context.user_id

        logger.info(f"Agent request from user='{user_id}': intent='{intent.intent_name}', message='{request.message}'")

        # -------------------------------------------------------------
        # Plan 1: SCHEDULE RISKIEST REMINDER
        # Flow: get_upcoming_tasks -> calculate_forgetfulness_risk -> pick highest -> create_reminder
        # -------------------------------------------------------------
        if intent.intent_name == "schedule_riskiest_reminder":
            tasks_out = await self.execute_tool("get_upcoming_tasks", {"timeframe_hours": 72, "limit": 10}, context, trace)
            upcoming = tasks_out.upcoming_tasks

            if not upcoming:
                return AgentChatResponse(
                    message="You have no upcoming tasks scheduled, so there are no high-risk items requiring a reminder.",
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            # Calculate risk for upcoming tasks via Risk Engine
            assessments = []
            for t in upcoming:
                if len(trace) >= self.MAX_TOOL_CALLS - 2:
                    break
                try:
                    risk_res = await self.execute_tool("calculate_forgetfulness_risk", {"task_id": t.id}, context, trace)
                    assessments.append((t, risk_res))
                except Exception:
                    continue

            if not assessments:
                return AgentChatResponse(
                    message="Unable to evaluate risk for upcoming tasks.",
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            # Sort by risk score descending
            assessments.sort(key=lambda x: x[1].score, reverse=True)
            highest_task, highest_risk = assessments[0]

            # Invoke create_reminder (which strictly invokes Reminder Decision Engine)
            rem_out = await self.execute_tool("create_reminder", {"task_id": highest_task.id}, context, trace)

            if rem_out.reminder_created:
                rem_time_str = rem_out.remind_at.strftime("%I:%M %p on %b %d") if rem_out.remind_at else "the scheduled window"
                msg = (
                    f"Your task **'{highest_task.title}'** is currently the highest-risk item (Risk Score: {highest_risk.score}/100, {highest_risk.level}). "
                    f"I scheduled a proactive reminder for **{rem_time_str}** via {rem_out.intervention_level} intervention."
                )
            else:
                msg = (
                    f"Your task **'{highest_task.title}'** is currently the highest-risk item (Risk Score: {highest_risk.score}/100, {highest_risk.level}), "
                    f"but no new reminder was created: {rem_out.block_reason or rem_out.decision_reason}"
                )

            return AgentChatResponse(
                message=msg,
                intent=intent.intent_name,
                actions=[rem_out.model_dump()],
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 2: HIGHEST RISK TASK QUERY / WHAT MIGHT I FORGET TODAY
        # Flow: get_upcoming_tasks -> calculate_forgetfulness_risk -> rank
        # -------------------------------------------------------------
        elif intent.intent_name == "highest_risk_task":
            tasks_out = await self.execute_tool("get_upcoming_tasks", {"timeframe_hours": 48, "limit": 10}, context, trace)
            upcoming = tasks_out.upcoming_tasks

            if not upcoming:
                return AgentChatResponse(
                    message="You don't have any pending tasks right now. Great job staying on top of your schedule!",
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            assessments = []
            for t in upcoming:
                if len(trace) >= self.MAX_TOOL_CALLS:
                    break
                try:
                    risk_res = await self.execute_tool("calculate_forgetfulness_risk", {"task_id": t.id}, context, trace)
                    assessments.append((t, risk_res))
                except Exception:
                    continue

            assessments.sort(key=lambda x: x[1].score, reverse=True)
            top_task, top_risk = assessments[0]

            factors_summary = "; ".join(top_risk.factors[:2]) if top_risk.factors else "Approaching deadline"
            msg = (
                f"Based on your current schedule and forgetfulness risk factors:\n\n"
                f"• **'{top_task.title}'** is your highest-risk task (Risk Score: **{top_risk.score}/100**, **{top_risk.level}**).\n"
                f"• Key factors: {factors_summary}.\n\n"
            )
            if len(assessments) > 1:
                second_task, second_risk = assessments[1]
                msg += f"Second in line is **'{second_task.title}'** with a score of {second_risk.score}/100 ({second_risk.level})."

            return AgentChatResponse(
                message=msg,
                intent=intent.intent_name,
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 3: PREPARE FOR TOMORROW (Context-Aware)
        # -------------------------------------------------------------
        elif intent.intent_name == "prepare_tomorrow":
            tasks_out = await self.execute_tool("get_upcoming_tasks", {"timeframe_hours": 48, "limit": 10}, context, trace)
            upcoming = tasks_out.upcoming_tasks

            # Query context events
            events_out = await self.execute_tool("get_upcoming_events", {"limit": 5}, context, trace)
            events = events_out.events if events_out.available else []

            if not upcoming and not events:
                msg = "You have no tasks scheduled for tomorrow."
                if not events_out.available:
                    msg += " (Calendar integration is currently disconnected, so only task items are evaluated)."
                return AgentChatResponse(
                    message=msg,
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            sections = []
            if events:
                ev_lines = []
                for ev in events:
                    ev_lines.append(f"• **{ev['title']}** (Event)")
                sections.append("📅 **Upcoming Events:**\n" + "\n".join(ev_lines))

            if upcoming:
                t_lines = [f"• **{t.title}** (Priority: {t.priority.upper()})" for t in upcoming[:5]]
                sections.append("📋 **Preparation & Pending Tasks:**\n" + "\n".join(t_lines))

            msg = "Here is what you should prepare for tomorrow based on your available context:\n\n" + "\n\n".join(sections)
            return AgentChatResponse(
                message=msg,
                intent=intent.intent_name,
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 4: UPCOMING TASKS / REVIEW DEADLINES
        # -------------------------------------------------------------
        elif intent.intent_name == "upcoming_tasks":
            tasks_out = await self.execute_tool("get_upcoming_tasks", {"timeframe_hours": 72, "limit": 10}, context, trace)
            if not tasks_out.upcoming_tasks:
                return AgentChatResponse(
                    message="You have no upcoming tasks with approaching deadlines in the next 3 days.",
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            items_list = []
            for t in tasks_out.upcoming_tasks:
                due_str = t.due_at.strftime("%b %d at %I:%M %p") if t.due_at else "No deadline"
                items_list.append(f"• **{t.title}** — Due: {due_str} [{t.priority.upper()}]")

            return AgentChatResponse(
                message="Here are your upcoming tasks:\n\n" + "\n".join(items_list),
                intent=intent.intent_name,
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 5: COMPLETE TASK
        # -------------------------------------------------------------
        elif intent.intent_name == "complete_task":
            title_query = intent.entities.get("title_query", "").strip().lower()
            tasks_out = await self.execute_tool("get_user_tasks", {"status": "pending"}, context, trace)

            matching = None
            for t in tasks_out.tasks:
                if title_query and (title_query in t.title.lower() or t.title.lower() in title_query):
                    matching = t
                    break

            if not matching:
                if tasks_out.tasks:
                    matching = tasks_out.tasks[0]  # First pending
                else:
                    return AgentChatResponse(
                        message="I could not find an active pending task matching that description.",
                        intent=intent.intent_name,
                        tool_calls=[t.tool_name for t in trace],
                        execution_trace=trace,
                    )

            update_out = await self.execute_tool("update_task", {"task_id": matching.id, "status": "done"}, context, trace)
            return AgentChatResponse(
                message=f"I've marked **'{matching.title}'** as completed.",
                intent=intent.intent_name,
                actions=[update_out.model_dump()],
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 6: POSTPONE TASK
        # -------------------------------------------------------------
        elif intent.intent_name == "postpone_task":
            title_query = intent.entities.get("title_query", "").strip().lower()
            hours = intent.entities.get("postpone_hours", 24)
            tasks_out = await self.execute_tool("get_user_tasks", {"status": "pending"}, context, trace)

            matching = None
            for t in tasks_out.tasks:
                if title_query and (title_query in t.title.lower() or t.title.lower() in title_query):
                    matching = t
                    break

            if not matching and tasks_out.tasks:
                matching = tasks_out.tasks[0]

            if not matching:
                return AgentChatResponse(
                    message="I couldn't find an active task to postpone.",
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            update_out = await self.execute_tool(
                "update_task", {"task_id": matching.id, "postpone_hours": hours}, context, trace
            )
            return AgentChatResponse(
                message=f"I've postponed **'{matching.title}'** by {hours} hours.",
                intent=intent.intent_name,
                actions=[update_out.model_dump()],
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 7: CHECK HISTORY
        # -------------------------------------------------------------
        elif intent.intent_name == "check_history":
            hist_out = await self.execute_tool("get_task_history", {}, context, trace)
            return AgentChatResponse(
                message=(
                    f"Your historical activity metrics:\n"
                    f"• Completed tasks: {hist_out.total_tasks_completed}\n"
                    f"• Overdue tasks: {hist_out.total_tasks_overdue}\n"
                    f"• Snoozed reminders: {hist_out.total_reminders_snoozed}\n"
                    f"• Data sufficiency level: {hist_out.data_sufficiency.capitalize()}."
                ),
                intent=intent.intent_name,
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Plan 8: CREATE TASK REMINDER
        # -------------------------------------------------------------
        elif intent.intent_name == "create_task_reminder":
            title_query = intent.entities.get("title_query", "").strip().lower()
            tasks_out = await self.execute_tool("get_user_tasks", {"status": "pending"}, context, trace)

            matching = None
            for t in tasks_out.tasks:
                if title_query and (title_query in t.title.lower() or t.title.lower() in title_query):
                    matching = t
                    break

            if not matching and tasks_out.tasks:
                matching = tasks_out.tasks[0]

            if not matching:
                return AgentChatResponse(
                    message="Please specify which task you would like to set a reminder for.",
                    intent=intent.intent_name,
                    tool_calls=[t.tool_name for t in trace],
                    execution_trace=trace,
                )

            rem_out = await self.execute_tool("create_reminder", {"task_id": matching.id}, context, trace)
            if rem_out.reminder_created:
                rem_time_str = rem_out.remind_at.strftime("%I:%M %p on %b %d") if rem_out.remind_at else "the scheduled window"
                msg = f"Reminder created for **'{matching.title}'** at **{rem_time_str}** via {rem_out.intervention_level}."
            else:
                msg = f"Could not create reminder for **'{matching.title}'**: {rem_out.block_reason or rem_out.decision_reason}"

            return AgentChatResponse(
                message=msg,
                intent=intent.intent_name,
                actions=[rem_out.model_dump()],
                tool_calls=[t.tool_name for t in trace],
                execution_trace=trace,
            )

        # -------------------------------------------------------------
        # Default: Unknown intent fallback
        # -------------------------------------------------------------
        else:
            return AgentChatResponse(
                message="I'm here to help you manage your memory and task risks. You can ask me:\n• 'What might I forget today?'\n• 'Remind me about the task that looks most risky'\n• 'What should I prepare for tomorrow?'\n• 'Review my upcoming deadlines'",
                intent="unknown",
                tool_calls=[],
                execution_trace=[],
            )
