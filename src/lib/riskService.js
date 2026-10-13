/**
 * API client service for ReMind AI Risk Engine endpoints.
 */

const BACKEND_BASE_URL = 'http://localhost:8000';

export async function assessSingleTaskRisk(taskInput) {
  const res = await fetch(`${BACKEND_BASE_URL}/api/tasks/risk/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskInput),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Risk assessment failed with HTTP ${res.status}`);
  }
  return res.json();
}

export async function batchAssessTasksRisk(tasks, userHistory = null) {
  const payload = {
    tasks: tasks.map(t => ({
      task_id: t.id,
      title: t.title || t.name,
      status: t.status || 'pending',
      priority: (t.priority || 'medium').toLowerCase(),
      due_at: t.due_at || null,
      is_routine: Boolean(t.is_routine),
      preparation_items_count: Array.isArray(t.tags) ? t.tags.length : 0,
    })),
    user_history: userHistory,
  };

  const res = await fetch(`${BACKEND_BASE_URL}/api/tasks/risk/batch-assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Batch risk assessment failed with HTTP ${res.status}`);
  }
  return res.json();
}
