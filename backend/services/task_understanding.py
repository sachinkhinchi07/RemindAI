import logging
from datetime import datetime
from typing import Optional
import pytz

from backend.ai import AIService, AIGenerationRequest
from backend.ai.prompts import TASK_EXTRACTION_SYSTEM_PROMPT
from backend.schemas.task_understanding import (
    TaskUnderstandingLLMOutput,
    TaskParseRequest,
    ParsedTaskResponse,
)
from backend.utils.date_resolver import resolve_datetime

logger = logging.getLogger("remind_ai.task_understanding")

class TaskUnderstandingService:
    """Orchestrates natural language task extraction, date resolution, and ambiguity checks."""

    def __init__(self, ai_service: AIService):
        self.ai_service = ai_service

    async def parse_task(
        self,
        request: TaskParseRequest,
        reference_dt: Optional[datetime] = None,
    ) -> ParsedTaskResponse:
        user_text = request.text.strip()
        tz_str = request.timezone or "UTC"

        # Reference time determination
        try:
            tz = pytz.timezone(tz_str)
        except Exception:
            tz = pytz.UTC

        if reference_dt is None:
            if request.client_now:
                try:
                    reference_dt = datetime.fromisoformat(request.client_now.replace("Z", "+00:00"))
                except Exception:
                    reference_dt = datetime.now(tz)
            else:
                reference_dt = datetime.now(tz)

        current_date_str = reference_dt.strftime("%A, %B %d, %Y (%Z)")
        logger.info(
            "Parsing task text: '%s' [Reference time: %s, Timezone: %s]",
            user_text[:80],
            current_date_str,
            tz_str,
        )

        prompt_context = (
            f"Context: Today is {current_date_str}.\n"
            f"User statement to parse:\n\"\"\"{user_text}\"\"\""
        )

        ai_req = AIGenerationRequest(
            prompt=prompt_context,
            system_prompt=TASK_EXTRACTION_SYSTEM_PROMPT,
            temperature=0.0,
            max_tokens=600,
        )

        # Call AI service with strict Pydantic validation
        llm_output: TaskUnderstandingLLMOutput = await self.ai_service.generate_structured_response(
            ai_req, TaskUnderstandingLLMOutput
        )

        # Date & Time resolution
        resolved_dt, date_str, time_str = resolve_datetime(
            date_expr=llm_output.relative_date_expr,
            time_expr=llm_output.time_expr,
            reference_dt=reference_dt,
            user_tz_name=tz_str,
        )

        # Ambiguity reconciliation
        ambiguities = list(llm_output.ambiguities)
        if not llm_output.relative_date_expr and not date_str:
            if "deadline" not in " ".join(ambiguities).lower():
                ambiguities.append("No specific deadline or target date was identified.")
        if not llm_output.time_expr and not time_str:
            ambiguities.append("No specific time of day was stated.")

        # Recurrence check
        recurrence_supported = False  # Current schema note: task table does not have recurrence rule column yet

        return ParsedTaskResponse(
            title=llm_output.title,
            description=llm_output.description or user_text,
            due_at=resolved_dt.isoformat() if resolved_dt else None,
            due_date_str=date_str,
            due_time_str=time_str,
            priority=llm_output.priority,
            category=llm_output.category or "Work",
            related_items=llm_output.related_items or [],
            recurrence_rule=llm_output.recurrence_rule,
            recurrence_supported=recurrence_supported,
            ambiguities=ambiguities,
            original_text=user_text,
            confidence_score=0.95 if (date_str and llm_output.title) else 0.80,
        )
