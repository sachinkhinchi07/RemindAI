from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta, time
import copy

from .base import AgentTool, ToolExecutionContext, ToolRegistry
from .schemas import (
    GetUserTasksInput, GetUserTasksOutput, TaskItemSummary,
    GetUpcomingTasksInput, GetUpcomingTasksOutput,
    GetUserPreferencesInput, GetUserPreferencesOutput,
    GetTaskHistoryInput, GetTaskHistoryOutput,
    CalculateRiskInput, CalculateRiskOutput,
    GetUpcomingEventsInput, GetUpcomingEventsOutput,
    CreateReminderInput, CreateReminderOutput,
    UpdateTaskInput, UpdateTaskOutput,
    GetPersonalizationProfileInput, GetPersonalizationProfileOutput,
)
from backend.risk import ForgetfulnessRiskEngine, TaskRiskInput, UserTaskHistory
from backend.reminders import (
    ReminderDecisionEngine, ReminderDecisionInput, UserReminderPreferences, ExistingReminderInfo
)
from backend.agent.store import default_task_store, TaskStoreAdapter
from backend.context import ContextService

from backend.ml.predictor import MLRiskPredictor

# Instantiate domain engines
_risk_engine = MLRiskPredictor()
_reminder_engine = ReminderDecisionEngine()
_context_service = ContextService()


def _get_store(context: ToolExecutionContext) -> TaskStoreAdapter:
    if context.data_store and isinstance(context.data_store, TaskStoreAdapter):
        return context.data_store
    return default_task_store


def _get_context_service(context: ToolExecutionContext) -> ContextService:
    store = _get_store(context)
    if hasattr(context, "context_service") and context.context_service:
        return context.context_service
    return ContextService(task_store=store)


# 1. get_user_tasks
async def execute_get_user_tasks(inp: GetUserTasksInput, context: ToolExecutionContext) -> GetUserTasksOutput:
    store = _get_store(context)
    raw_tasks = await store.get_tasks(
        user_id=context.user_id,
        status=inp.status,
        priority=inp.priority,
        limit=inp.limit,
    )
    items = []
    for t in raw_tasks:
        due = t.get("due_at")
        if isinstance(due, str):
            due = datetime.fromisoformat(due.replace("Z", "+00:00"))
        created = t.get("created_at")
        if isinstance(created, str):
            created = datetime.fromisoformat(created.replace("Z", "+00:00"))
        items.append(
            TaskItemSummary(
                id=str(t.get("id")),
                title=t.get("title", "Untitled Task"),
                status=t.get("status", "pending"),
                priority=t.get("priority", "medium").lower(),
                due_at=due,
                created_at=created,
                is_routine=bool(t.get("is_routine", False)),
                tags=t.get("tags") or [],
            )
        )
    return GetUserTasksOutput(tasks=items, total_count=len(items))


# 2. get_upcoming_tasks
async def execute_get_upcoming_tasks(inp: GetUpcomingTasksInput, context: ToolExecutionContext) -> GetUpcomingTasksOutput:
    store = _get_store(context)
    raw_tasks = await store.get_tasks(user_id=context.user_id, limit=100)
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(hours=inp.timeframe_hours)

    upcoming = []
    for t in raw_tasks:
        if t.get("status") in ["done", "completed", "cancelled"]:
            continue
        due = t.get("due_at")
        if isinstance(due, str):
            due = datetime.fromisoformat(due.replace("Z", "+00:00"))
        
        # Include if due date is within lookahead or overdue
        if due:
            if due <= cutoff:
                upcoming.append(
                    TaskItemSummary(
                        id=str(t.get("id")),
                        title=t.get("title", "Untitled Task"),
                        status=t.get("status", "pending"),
                        priority=t.get("priority", "medium").lower(),
                        due_at=due,
                        is_routine=bool(t.get("is_routine", False)),
                        tags=t.get("tags") or [],
                    )
                )
        else:
            # Tasks without due date that are active
            upcoming.append(
                TaskItemSummary(
                    id=str(t.get("id")),
                    title=t.get("title", "Untitled Task"),
                    status=t.get("status", "pending"),
                    priority=t.get("priority", "medium").lower(),
                    due_at=None,
                    is_routine=bool(t.get("is_routine", False)),
                    tags=t.get("tags") or [],
                )
            )

    # Sort upcoming: earliest due date first, None at the end
    upcoming.sort(key=lambda x: (x.due_at is None, x.due_at or now))
    trimmed = upcoming[: inp.limit]
    return GetUpcomingTasksOutput(upcoming_tasks=trimmed, count=len(trimmed))


# 3. get_user_preferences
async def execute_get_user_preferences(inp: GetUserPreferencesInput, context: ToolExecutionContext) -> GetUserPreferencesOutput:
    store = _get_store(context)
    prefs = await store.get_user_preferences(context.user_id)
    return GetUserPreferencesOutput(
        proactive_reminders_enabled=prefs.get("proactive_reminders_enabled", True),
        quiet_hours_on=prefs.get("quiet_hours_on", True),
        quiet_start=prefs.get("quiet_start", "22:00"),
        quiet_end=prefs.get("quiet_end", "08:00"),
        buffer_minutes=prefs.get("buffer_minutes", 45),
        preferred_channels=prefs.get("preferred_channels", ["banner", "desktop"]),
    )


# 4. get_task_history
async def execute_get_task_history(inp: GetTaskHistoryInput, context: ToolExecutionContext) -> GetTaskHistoryOutput:
    store = _get_store(context)
    hist = await store.get_user_history(context.user_id)
    total_actions = (
        hist.get("total_tasks_completed", 0)
        + hist.get("total_tasks_overdue", 0)
        + hist.get("similar_tasks_postponed", 0)
    )
    sufficiency = "sufficient" if total_actions >= 10 else ("moderate" if total_actions >= 3 else "limited")
    return GetTaskHistoryOutput(
        total_tasks_completed=hist.get("total_tasks_completed", 0),
        total_tasks_overdue=hist.get("total_tasks_overdue", 0),
        total_reminders_snoozed=hist.get("total_reminders_snoozed", 0),
        similar_tasks_postponed=hist.get("similar_tasks_postponed", 0),
        similar_tasks_missed=hist.get("similar_tasks_missed", 0),
        data_sufficiency=sufficiency,
    )


# 5. calculate_forgetfulness_risk (Strictly delegates to Phase 5 engine)
async def execute_calculate_forgetfulness_risk(inp: CalculateRiskInput, context: ToolExecutionContext) -> CalculateRiskOutput:
    store = _get_store(context)
    task = await store.get_task_by_id(context.user_id, inp.task_id)
    if not task:
        raise ValueError(f"Task with ID '{inp.task_id}' not found for authenticated user.")

    due = task.get("due_at")
    if isinstance(due, str):
        due = datetime.fromisoformat(due.replace("Z", "+00:00"))

    # Fetch user history
    hist_raw = await store.get_user_history(context.user_id)
    user_hist = UserTaskHistory(
        total_tasks_completed=hist_raw.get("total_tasks_completed", 0),
        total_tasks_overdue=hist_raw.get("total_tasks_overdue", 0),
        total_reminders_snoozed=hist_raw.get("total_reminders_snoozed", 0),
        similar_tasks_postponed=hist_raw.get("similar_tasks_postponed", 0),
        similar_tasks_missed=hist_raw.get("similar_tasks_missed", 0),
    )

    tags = task.get("tags") or []
    risk_input = TaskRiskInput(
        task_id=str(task.get("id")),
        title=task.get("title", "Untitled"),
        status=task.get("status", "pending"),
        priority=task.get("priority", "medium").lower(),
        due_at=due,
        is_routine=bool(task.get("is_routine", False)),
        preparation_items_count=len(tags) if isinstance(tags, list) else 0,
        user_history=user_hist,
    )

    assessment = _risk_engine.calculate_risk(risk_input)
    return CalculateRiskOutput(
        task_id=str(task.get("id")),
        title=task.get("title", "Untitled"),
        score=assessment.score,
        level=assessment.level,
        factors=[f.description for f in assessment.factors],
        explanation=assessment.explanation,
        confidence=assessment.confidence,
        data_sufficiency=assessment.data_sufficiency,
    )


# 6. get_upcoming_events (Connected to Context Awareness Layer)
async def execute_get_upcoming_events(inp: GetUpcomingEventsInput, context: ToolExecutionContext) -> GetUpcomingEventsOutput:
    ctx_svc = _get_context_service(context)
    normalized = await ctx_svc.get_normalized_context(
        user_id=context.user_id,
        include_tasks=False,
        include_events=True,
        include_routines=False,
    )

    if not normalized.calendar_connected:
        return GetUpcomingEventsOutput(
            available=False,
            events=[],
            message="Calendar integration is not connected for this account.",
        )

    ev_list = []
    for ev in normalized.upcoming_events[: inp.limit]:
        ev_list.append({
            "id": ev.id,
            "title": ev.title,
            "start_time": ev.start_time.isoformat(),
            "end_time": ev.end_time.isoformat() if ev.end_time else None,
            "location": ev.location,
            "source": ev.source,
        })

    msg = f"Retrieved {len(ev_list)} upcoming calendar event(s)." if ev_list else "No upcoming events scheduled in this window."
    return GetUpcomingEventsOutput(
        available=True,
        events=ev_list,
        message=msg,
    )


# 7. create_reminder (Strictly delegates to Phase 7 ReminderDecisionEngine)
async def execute_create_reminder(inp: CreateReminderInput, context: ToolExecutionContext) -> CreateReminderOutput:
    store = _get_store(context)
    task = await store.get_task_by_id(context.user_id, inp.task_id)
    if not task:
        raise ValueError(f"Task with ID '{inp.task_id}' not found for authenticated user.")

    # 1. Assess risk using Risk Engine
    risk_res = await execute_calculate_forgetfulness_risk(CalculateRiskInput(task_id=inp.task_id), context)

    # 2. Retrieve existing reminders
    raw_reminders = await store.get_reminders_for_task(context.user_id, inp.task_id)
    existing_items = []
    for r in raw_reminders:
        rem_time = r.get("remind_at")
        if isinstance(rem_time, str):
            rem_time = datetime.fromisoformat(rem_time.replace("Z", "+00:00"))
        snz = r.get("snooze_until")
        if isinstance(snz, str):
            snz = datetime.fromisoformat(snz.replace("Z", "+00:00"))
        existing_items.append(
            ExistingReminderInfo(
                reminder_id=str(r.get("id")),
                remind_at=rem_time,
                status=r.get("status", "scheduled"),
                snooze_until=snz,
            )
        )

    # 3. Retrieve preferences
    raw_prefs = await store.get_user_preferences(context.user_id)
    q_start_parts = [int(p) for p in raw_prefs.get("quiet_start", "22:00").split(":")]
    q_end_parts = [int(p) for p in raw_prefs.get("quiet_end", "08:00").split(":")]
    user_prefs = UserReminderPreferences(
        proactive_reminders_enabled=raw_prefs.get("proactive_reminders_enabled", True),
        quiet_hours_on=raw_prefs.get("quiet_hours_on", True),
        quiet_start=time(q_start_parts[0], q_start_parts[1]),
        quiet_end=time(q_end_parts[0], q_end_parts[1]),
        buffer_minutes=raw_prefs.get("buffer_minutes", 45),
        preferred_channels=raw_prefs.get("preferred_channels", ["banner", "desktop"]),
    )

    due = task.get("due_at")
    if isinstance(due, str):
        due = datetime.fromisoformat(due.replace("Z", "+00:00"))

    # 4. Phase 12 Personalization Layer Lookup
    personalized_lead_time = None
    try:
        from backend.personalization import default_personalization_service
        profile = await default_personalization_service.get_or_build_profile(context.user_id)
        tags = task.get("tags") or []
        cat = tags[0].lower() if tags and isinstance(tags, list) else "general"
        if cat in profile.category_lead_times_minutes:
            personalized_lead_time = profile.category_lead_times_minutes[cat]
        elif profile.recommended_lead_time_minutes != 120:
            personalized_lead_time = profile.recommended_lead_time_minutes

        if profile.preferred_notification_channels and user_prefs.proactive_reminders_enabled:
            # Only use personalized channels if not empty
            user_prefs.preferred_channels = profile.preferred_notification_channels
    except Exception:
        pass

    # 5. Run Reminder Decision Engine
    decision_input = ReminderDecisionInput(
        task_id=str(task.get("id")),
        title=task.get("title", "Untitled"),
        status=task.get("status", "pending"),
        priority=task.get("priority", "medium").lower(),
        due_at=due,
        risk_score=risk_res.score,
        risk_level=risk_res.level,
        risk_factors=risk_res.factors,
        existing_reminders=existing_items,
        preferences=user_prefs,
        personalized_lead_time_minutes=personalized_lead_time,
        current_time=datetime.now(timezone.utc),
    )

    decision = _reminder_engine.evaluate_decision(decision_input)

    # 5. Respect decision
    if not decision.should_remind:
        return CreateReminderOutput(
            task_id=inp.task_id,
            reminder_created=False,
            reminder_id=None,
            remind_at=decision.recommended_time,
            intervention_level=decision.intervention_level,
            decision_reason=decision.reason,
            blocked=decision.blocked,
            block_reason=decision.block_reason,
        )

    # 6. Save created reminder
    created_rec = await store.create_reminder(
        user_id=context.user_id,
        reminder_data={
            "task_id": inp.task_id,
            "remind_at": decision.recommended_time.isoformat() if decision.recommended_time else None,
            "intervention_level": decision.intervention_level,
            "channels": decision.delivery_channels,
            "status": "scheduled",
            "decision_reason": decision.reason,
        },
    )

    # 7. Bridge to Phase 10 Notification Service (schedule in-app / desktop notification)
    try:
        from backend.notifications import default_notification_store, NotificationService
        notif_svc = NotificationService(notif_store=default_notification_store, task_store=store)
        from backend.notifications.models import ScheduleNotificationRequest
        await notif_svc.schedule_notification(
            user_id=context.user_id,
            request=ScheduleNotificationRequest(
                task_id=inp.task_id,
                reminder_id=created_rec.get("id"),
                channel="IN_APP",
                title=f"Reminder: {task.get('title')}",
                message=decision.reason,
                scheduled_at=decision.recommended_time,
                intervention_level=decision.intervention_level,
            ),
        )
    except Exception as exc:
        pass  # safe non-blocking notification scheduling

    return CreateReminderOutput(
        task_id=inp.task_id,
        reminder_created=True,
        reminder_id=created_rec.get("id"),
        remind_at=decision.recommended_time,
        intervention_level=decision.intervention_level,
        decision_reason=decision.reason,
        blocked=False,
        block_reason=None,
    )


# 8. update_task
async def execute_update_task(inp: UpdateTaskInput, context: ToolExecutionContext) -> UpdateTaskOutput:
    store = _get_store(context)
    task = await store.get_task_by_id(context.user_id, inp.task_id)
    if not task:
        raise ValueError(f"Task with ID '{inp.task_id}' not found for authenticated user.")

    updates: Dict[str, Any] = {}
    if inp.status:
        updates["status"] = inp.status
        if inp.status == "done":
            updates["completed_at"] = datetime.now(timezone.utc).isoformat()
    if inp.priority:
        updates["priority"] = inp.priority

    if inp.new_due_at:
        updates["due_at"] = inp.new_due_at.isoformat()
    elif inp.postpone_hours:
        current_due = task.get("due_at")
        base = datetime.now(timezone.utc)
        if current_due:
            if isinstance(current_due, str):
                base = datetime.fromisoformat(current_due.replace("Z", "+00:00"))
            else:
                base = current_due
        new_due = base + timedelta(hours=inp.postpone_hours)
        updates["due_at"] = new_due.isoformat()

    if not updates:
        return UpdateTaskOutput(
            task_id=inp.task_id,
            success=False,
            updated_fields={},
            message="No update attributes provided.",
        )

    updated_task = await store.update_task(context.user_id, inp.task_id, updates)

    # Bridge to Phase 11 Feedback Loop
    try:
        from backend.feedback import default_feedback_service, FeedbackEventType, EventSource
        if inp.status == "done":
            await default_feedback_service.record_event(
                user_id=context.user_id,
                event_type=FeedbackEventType.TASK_COMPLETED,
                event_source=EventSource.AGENT,
                task_id=inp.task_id,
                metadata={"title": task.get("title")},
            )
        elif inp.postpone_hours:
            await default_feedback_service.record_event(
                user_id=context.user_id,
                event_type=FeedbackEventType.TASK_POSTPONED,
                event_source=EventSource.AGENT,
                task_id=inp.task_id,
                metadata={"postpone_hours": inp.postpone_hours, "title": task.get("title")},
            )
        else:
            await default_feedback_service.record_event(
                user_id=context.user_id,
                event_type=FeedbackEventType.TASK_UPDATED,
                event_source=EventSource.AGENT,
                task_id=inp.task_id,
                metadata={"updated_fields": list(updates.keys())},
            )
    except Exception:
        pass

    return UpdateTaskOutput(
        task_id=inp.task_id,
        success=True,
        updated_fields=updates,
        message=f"Task '{task.get('title')}' successfully updated.",
    )


# 9. get_personalization_profile
async def execute_get_personalization_profile(
    inp: GetPersonalizationProfileInput, context: ToolExecutionContext
) -> GetPersonalizationProfileOutput:
    from backend.personalization import default_personalization_service
    profile = await default_personalization_service.get_or_build_profile(context.user_id)
    return GetPersonalizationProfileOutput(
        user_id=profile.user_id,
        data_sufficiency=profile.data_sufficiency.value,
        sufficiency_explanation=profile.sufficiency_explanation,
        recommended_lead_time_minutes=profile.recommended_lead_time_minutes,
        preferred_notification_channels=profile.preferred_notification_channels,
        category_postponement_rates=profile.category_postponement_rates,
        active_personalization_rules=profile.active_personalization_rules,
        human_explanations=profile.human_explanations,
    )


def create_default_registry() -> ToolRegistry:
    """Instantiate and populate the central approved tool registry."""
    reg = ToolRegistry()

    reg.register(
        AgentTool(
            name="get_user_tasks",
            description="Retrieve active and historical tasks for the authenticated user.",
            input_schema=GetUserTasksInput,
            output_schema=GetUserTasksOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_get_user_tasks,
        )
    )

    reg.register(
        AgentTool(
            name="get_upcoming_tasks",
            description="Retrieve upcoming tasks requiring attention within a given timeframe.",
            input_schema=GetUpcomingTasksInput,
            output_schema=GetUpcomingTasksOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_get_upcoming_tasks,
        )
    )

    reg.register(
        AgentTool(
            name="get_user_preferences",
            description="Retrieve user reminder preferences and quiet hour settings.",
            input_schema=GetUserPreferencesInput,
            output_schema=GetUserPreferencesOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_get_user_preferences,
        )
    )

    reg.register(
        AgentTool(
            name="get_task_history",
            description="Retrieve historical task completion, snooze, and overdue metrics.",
            input_schema=GetTaskHistoryInput,
            output_schema=GetTaskHistoryOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_get_task_history,
        )
    )

    reg.register(
        AgentTool(
            name="calculate_forgetfulness_risk",
            description="Call Phase 5 Forgetfulness Risk Engine to calculate numerical risk and factors for a task.",
            input_schema=CalculateRiskInput,
            output_schema=CalculateRiskOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_calculate_forgetfulness_risk,
        )
    )

    reg.register(
        AgentTool(
            name="get_upcoming_events",
            description="Retrieve upcoming contextual calendar events.",
            input_schema=GetUpcomingEventsInput,
            output_schema=GetUpcomingEventsOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_get_upcoming_events,
        )
    )

    reg.register(
        AgentTool(
            name="create_reminder",
            description="Evaluate and schedule a proactive reminder through the Reminder Decision Engine.",
            input_schema=CreateReminderInput,
            output_schema=CreateReminderOutput,
            requires_auth=True,
            mutating=True,
            executor=execute_create_reminder,
        )
    )

    reg.register(
        AgentTool(
            name="update_task",
            description="Update task fields (mark complete, postpone, change priority).",
            input_schema=UpdateTaskInput,
            output_schema=UpdateTaskOutput,
            requires_auth=True,
            mutating=True,
            executor=execute_update_task,
        )
    )

    reg.register(
        AgentTool(
            name="get_personalization_profile",
            description="Retrieve verified user behavioral profile and learned habits to explain reminder decisions accurately.",
            input_schema=GetPersonalizationProfileInput,
            output_schema=GetPersonalizationProfileOutput,
            requires_auth=True,
            mutating=False,
            executor=execute_get_personalization_profile,
        )
    )

    return reg
