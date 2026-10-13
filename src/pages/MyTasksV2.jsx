import { useState } from 'react';
import {
  CheckSquare, Plus, Clock, Users, Brain, Filter,
  Check, Zap, AlertTriangle, ChevronDown, Tag,
  MoreHorizontal, X, Star, Bell, Pencil, Trash2,
  LayoutGrid, List, Search, RefreshCw, Shield,
  BarChart2, ArrowRight, Loader
} from 'lucide-react';
import CreateTaskModal from '../components/CreateTaskModal';
import EditTaskModal from '../components/EditTaskModal';
import { useTasks } from '../hooks/useTasks';
import './MyTasksV2.css';

const filterTabs = ['All Tasks', 'Today', 'Upcoming', 'Completed'];

export default function MyTasksV2() {
  const { tasks, loading, error, addTask, editTask, removeTask, markDone, toggleStar } = useTasks();
  const [activeTab, setActiveTab] = useState('All Tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState('table');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [remindToast, setRemindToast] = useState(null);

  const handleAddNewTask = async (newTaskData) => {
    let safeDueDate = newTaskData.due_at || null;
    if (!safeDueDate && newTaskData.due) {
      const parsed = new Date(newTaskData.due);
      if (!isNaN(parsed.getTime())) {
        safeDueDate = parsed.toISOString();
      }
    }

    const priorityVal = newTaskData.priority || 'medium';
    const tagList = newTaskData.category ? [`#${newTaskData.category.toLowerCase()}`] : ['#ai-extracted'];

    await addTask({
      title: newTaskData.title,
      tags: tagList,
      due_at: safeDueDate,
      priority: priorityVal,
      status: 'queued',
      risk_score: priorityVal === 'high' || priorityVal === 'urgent' ? 75 : 20,
      risk_label: priorityVal === 'high' || priorityVal === 'urgent' ? 'High Risk' : 'Low Slip Risk (20%)',
      risk_reason: 'Parsed via Natural-Language AI Engine',
    });
    setShowAddModal(false);
  };

  const handleSaveEdit = async (taskId, updates) => {
    await editTask(taskId, updates);
  };

  const handleQuickRemind = (task) => {
    setRemindToast(`Proactive recall cue active for: "${task.name || task.title}"`);
    setTimeout(() => setRemindToast(null), 3000);
  };


  // Map DB fields to display-friendly shape
  const mapped = tasks.map(t => ({
    ...t,
    name: t.title,
    due: t.due_at ? new Date(t.due_at).toLocaleString() : 'No due date',
    dueClass: t.status === 'done' ? 'done' : 'normal',
    dueNote: '',
    scheduleNote: t.is_routine ? 'Routine' : '',
    priorityClass: t.priority,
    statusClass: t.status,
    riskLabel: t.risk_label || '—',
    riskClass: t.risk_score > 70 ? 'high' : t.risk_score > 40 ? 'medium' : 'low',
    done: t.status === 'done',
  }));

  const filtered = mapped.filter(t => {
    const matchesSearch = t.name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'Completed') return t.done && matchesSearch;
    if (activeTab === 'Today') {
      const today = new Date().toDateString();
      const dueDate = t.due_at ? new Date(t.due_at).toDateString() : null;
      return dueDate === today && matchesSearch;
    }
    if (activeTab === 'Upcoming') return !t.done && matchesSearch;
    return matchesSearch;
  });

  const highRisk = tasks.filter(t => (t.risk_score || 0) > 70 && t.status !== 'done').length;
  const overdue = tasks.filter(t => t.due_at && new Date(t.due_at) < new Date() && t.status !== 'done').length;
  const completed = tasks.filter(t => t.status === 'done').length;

  return (
    <div className="tasks-v2-page animate-fade-in-up">
      {/* Page header */}
      <div className="tasks-v2-header">
        <div>
          <h1 className="tasks-v2-title">My Tasks</h1>
          <p className="tasks-v2-sub">Proactively managed tasks with cognitive slip predictions and routine alignment.</p>
        </div>
        <div>
          <button
            className="btn btn-primary"
            id="add-task-btn"
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={14} /> Add Task
            <span className="kbd-shortcut">C</span>
          </button>
        </div>
      </div>

      {/* Loading / Error state */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
          <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading tasks from database...
        </div>
      )}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #EF4444', borderRadius: 8, padding: '12px 16px', color: '#EF4444', fontSize: 12, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="tasks-v2-stats">
        <div className="tv2-stat">
          <div className="tv2-stat-body">
            <span className="tv2-stat-label">Active Tasks</span>
            <span className="tv2-stat-value">{tasks.filter(t => t.status !== 'done').length}</span>
          </div>
          <div className="tv2-stat-icon" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>
            <CheckSquare size={18} />
          </div>
        </div>
        <div className="tv2-stat tv2-stat-danger">
          <div className="tv2-stat-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="status-dot danger" />
              <span className="tv2-stat-label" style={{ color: 'var(--risk-high)' }}>High Risk of Slip</span>
            </div>
            <span className="tv2-stat-value" style={{ color: 'var(--risk-high)' }}>{highRisk} Tasks</span>
          </div>
          <AlertTriangle size={20} color="var(--risk-high)" opacity={0.6} />
        </div>
        <div className="tv2-stat tv2-stat-warning">
          <div className="tv2-stat-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span className="status-dot warning" />
              <span className="tv2-stat-label" style={{ color: 'var(--risk-medium)' }}>Overdue Today</span>
            </div>
            <span className="tv2-stat-value" style={{ color: 'var(--risk-medium)' }}>{overdue} Task{overdue !== 1 ? 's' : ''}</span>
          </div>
          <Clock size={20} color="var(--risk-medium)" opacity={0.6} />
        </div>
        <div className="tv2-stat tv2-stat-success">
          <div className="tv2-stat-body">
            <span className="tv2-stat-label">Completed (Total)</span>
            <span className="tv2-stat-value" style={{ color: 'var(--risk-low)' }}>{completed} Done</span>
          </div>
          <div className="tv2-stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--risk-low)' }}>
            <Check size={18} />
          </div>
        </div>
      </div>


      {/* Tabs + search */}
      <div className="tasks-v2-controls">
        <div className="tv2-tabs">
          {filterTabs.map(tab => (
            <button
              key={tab}
              className={`tv2-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="tv2-search">
          <Search size={13} className="tv2-search-icon" />
          <input
            className="tv2-search-input"
            placeholder="Filter tasks by title, tag, or context..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="tv2-search-hint">⌘F</span>
        </div>
        <div className="tv2-view-btns">
          <button
            className={`tv2-view-btn ${view === 'table' ? 'active' : ''}`}
            onClick={() => setView('table')}
            aria-label="Table view"
          >
            <List size={15} />
          </button>
          <button
            className={`tv2-view-btn ${view === 'grid' ? 'active' : ''}`}
            onClick={() => setView('grid')}
            aria-label="Grid view"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>


      {/* Table */}
      <div className="tv2-table">
        <div className="tv2-table-head">
          <span style={{ gridColumn: '1/4' }}>TASK TITLE & CONTEXT</span>
          <span>DUE & SCHEDULE</span>
          <span>PRIORITY & STATUS</span>
          <span>AI SLIP PREDICTION</span>
          <span>ACTIONS</span>
        </div>

        {filtered.map(task => (
          <div
            key={task.id}
            className={`tv2-row ${task.done ? 'tv2-row-done' : ''} ${task.dueClass === 'overdue' ? 'tv2-row-overdue' : ''}`}
          >
            {/* Checkbox */}
            <button
              className={`rem-check ${task.done ? 'done' : ''}`}
              onClick={() => markDone(task.id)}
              style={{ margin: 0, flexShrink: 0 }}
              aria-label="Mark done"
            >
              {task.done && <Check size={11} />}
            </button>

            {/* Star */}
            <button className="tv2-star-btn" onClick={() => toggleStar(task.id)} aria-label="Star">
              <Star
                size={13}
                fill={task.starred ? 'var(--risk-medium)' : 'none'}
                color={task.starred ? 'var(--risk-medium)' : 'var(--text-muted)'}
              />
            </button>

            {/* Task name + meta */}
            <div className="tv2-task-info">
              <div className="tv2-task-name-row">
                <span className="tv2-task-name">{task.name}</span>
                {task.aiRoutine && <span className="badge badge-low" style={{ fontSize: 9 }}>AI Routine</span>}
              </div>
              {task.dueNote && (
                <div className={`tv2-due-alert tv2-due-${task.dueClass}`}>
                  <Clock size={10} /> {task.dueNote}
                </div>
              )}
              <div className="tv2-tags">
                {task.tags.map(tag => (
                  <span key={tag} className="tv2-tag">{tag}</span>
                ))}
                {task.assignee && (
                  <span className="tv2-assignee">
                    <Users size={10} /> {task.assignee}
                  </span>
                )}
              </div>
            </div>

            {/* Due */}
            <div className="tv2-due-cell">
              <span className={`tv2-due-time ${task.dueClass === 'overdue' ? 'text-danger' : task.dueClass === 'warning' ? 'text-warning' : ''}`}>
                {task.due}
              </span>
              {task.scheduleNote && (
                <span className="tv2-schedule-note">{task.scheduleNote}</span>
              )}
            </div>

            {/* Priority + Status */}
            <div className="tv2-priority-cell">
              <span className={`badge badge-${task.priorityClass === 'high' || task.priorityClass === 'urgent' ? 'high' : task.priorityClass === 'medium' ? 'medium' : 'low'}`}>
                {task.priority}
              </span>
              <span className={`tv2-status tv2-status-${task.statusClass}`}>{task.status}</span>
            </div>

            {/* Risk prediction */}
            <div className="tv2-risk-cell">
              <span className={`tv2-risk-badge tv2-risk-${task.riskClass}`}>{task.riskLabel}</span>
              <span className="tv2-risk-reason">{task.risk_reason || task.reason || '—'}</span>
            </div>

            {/* Actions */}
            <div className="tv2-actions">
              <button
                className="rem-action-btn"
                onClick={() => handleQuickRemind(task)}
                aria-label="Set Reminder"
                title="Schedule Proactive Recall"
              >
                <Bell size={13} />
              </button>
              <button
                className="rem-action-btn"
                onClick={() => setEditingTask(task)}
                aria-label="Edit Task"
                title="Edit Task Details"
              >
                <Pencil size={13} />
              </button>
              <button
                className="rem-action-btn rem-action-danger"
                onClick={() => removeTask(task.id)}
                aria-label="Delete Task"
                title="Delete Task"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
            <CheckSquare size={36} opacity={0.3} style={{ marginBottom: 12 }} />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No tasks found</h3>
            <p style={{ fontSize: 13, marginBottom: 16 }}>Create your first proactive task or use Quick Add to schedule one!</p>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ margin: '0 auto', fontSize: 12 }}>
              <Plus size={14} /> Add First Task
            </button>
          </div>
        )}
      </div>


      {showAddModal && (
        <CreateTaskModal
          isOpen={true}
          onClose={() => setShowAddModal(false)}
          onSave={handleAddNewTask}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          isOpen={true}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveEdit}
        />
      )}

      {/* Reminder Notification Toast */}
      {remindToast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--brand-primary, #6366f1)',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <Bell size={15} />
          <span>{remindToast}</span>
        </div>
      )}
    </div>
  );
}
