import { useState } from 'react';
import {
  CheckSquare, Plus, Clock, Users, Brain, Filter,
  Check, Zap, AlertTriangle, ChevronDown, Tag,
  MoreHorizontal, X, Star
} from 'lucide-react';
import './MyTasks.css';

const tasks = [
  { id: 1, name: 'Submit Q3 Sprint Retrospective', due: 'Today, 11:30 AM', priority: 'High', risk: 94, riskClass: 'high', category: 'Procurement & Ops', done: false, starred: true },
  { id: 2, name: 'Renew Cloudflare SSL Certification', due: 'Tomorrow, 9:00 AM', priority: 'Urgent', risk: 89, riskClass: 'high', category: 'DevOps', done: false, starred: false },
  { id: 3, name: 'Review design specs with mobile engineering team', due: '2:30 PM today', priority: 'Medium', risk: 67, riskClass: 'medium', category: 'Product & Design', done: false, starred: false },
  { id: 4, name: 'Send weekly 1-on-1 feedback to Design Lead', due: 'Friday, 4:00 PM', priority: 'Medium', risk: 67, riskClass: 'medium', category: 'Management', done: false, starred: false },
  { id: 5, name: 'Flag Sprint Retro deck to Sarah', due: 'Today, 12:15 PM', priority: 'High', risk: 55, riskClass: 'medium', category: 'Work', done: false, starred: true },
  { id: 6, name: 'Morning cognitive reset & daily standup notes', due: '9:15 AM', priority: 'Low', risk: 5, riskClass: 'low', category: 'Routine', done: true, starred: false },
  { id: 7, name: 'Team standup async call', due: '10:00 AM', priority: 'Low', risk: 8, riskClass: 'low', category: 'Work', done: true, starred: false },
];

export default function MyTasks() {
  const [items, setItems] = useState(tasks);
  const [activeFilter, setActiveFilter] = useState('All');
  const [newTask, setNewTask] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const toggleDone = (id) => setItems(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const toggleStar = (id) => setItems(prev => prev.map(t => t.id === id ? { ...t, starred: !t.starred } : t));

  const filtered = items.filter(t => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Active') return !t.done;
    if (activeFilter === 'Completed') return t.done;
    if (activeFilter === 'High Risk') return t.riskClass === 'high' && !t.done;
    if (activeFilter === 'Starred') return t.starred;
    return true;
  });

  const addTask = () => {
    if (!newTask.trim()) return;
    setItems(prev => [...prev, {
      id: Date.now(),
      name: newTask,
      due: 'No due date',
      priority: 'Medium',
      risk: 20,
      riskClass: 'low',
      category: 'General',
      done: false,
      starred: false,
    }]);
    setNewTask('');
    setShowAdd(false);
  };

  return (
    <div className="my-tasks-page animate-fade-in-up">
      <div className="tasks-page-header">
        <div>
          <h1 className="tasks-page-title">My Tasks</h1>
          <p className="tasks-page-sub">Ranked by AI-predicted forgetting probability</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={14} /> Add Task
        </button>
      </div>

      {/* Summary row */}
      <div className="tasks-summary">
        {[
          { label: 'Total', value: items.length, color: 'var(--text-brand)' },
          { label: 'Active', value: items.filter(t => !t.done).length, color: 'var(--brand-primary-light)' },
          { label: 'High Risk', value: items.filter(t => t.riskClass === 'high' && !t.done).length, color: 'var(--risk-high)' },
          { label: 'Completed', value: items.filter(t => t.done).length, color: 'var(--risk-low)' },
        ].map((s, i) => (
          <div key={i} className="task-summary-item">
            <span className="task-summary-val" style={{ color: s.color }}>{s.value}</span>
            <span className="task-summary-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Add task */}
      {showAdd && (
        <div className="task-add-panel animate-fade-in">
          <Brain size={15} color="var(--text-brand)" />
          <input
            className="input"
            placeholder='Describe a task... ReMind AI will assess its risk automatically'
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            autoFocus
          />
          <button className="btn btn-primary" onClick={addTask} style={{ fontSize: 12 }}><Zap size={12} /> Create</button>
          <button className="btn btn-ghost" onClick={() => setShowAdd(false)}><X size={13} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="tasks-filter-row">
        {['All', 'Active', 'High Risk', 'Starred', 'Completed'].map(f => (
          <button
            key={f}
            className={`filter-btn ${activeFilter === f ? 'active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
            {f === 'High Risk' && items.filter(t => t.riskClass === 'high' && !t.done).length > 0 && (
              <span className="sidebar-badge danger" style={{ marginLeft: 4 }}>
                {items.filter(t => t.riskClass === 'high' && !t.done).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tasks */}
      <div className="tasks-full-list">
        {/* Header */}
        <div className="tasks-full-header">
          <span style={{ gridColumn: '1 / 3' }}>TASK</span>
          <span>DUE</span>
          <span>PRIORITY</span>
          <span>RISK SCORE</span>
          <span>CATEGORY</span>
          <span />
        </div>

        {filtered.map(task => (
          <div key={task.id} className={`tasks-full-row ${task.done ? 'row-done' : ''} risk-border-${task.riskClass}`}>
            <button
              className={`rem-check ${task.done ? 'done' : ''}`}
              onClick={() => toggleDone(task.id)}
              style={{ marginTop: 0 }}
            >
              {task.done && <Check size={11} />}
            </button>

            <div className="task-full-name">
              <span className="task-name-text">{task.name}</span>
              {task.starred && <Star size={12} color="var(--risk-medium)" fill="var(--risk-medium)" />}
            </div>

            <div className="task-due-cell">
              <Clock size={11} />
              {task.due}
            </div>

            <span className={`badge badge-${task.priority === 'High' || task.priority === 'Urgent' ? 'high' : task.priority === 'Medium' ? 'medium' : 'low'}`}>
              {task.priority}
            </span>

            <div className="risk-score-cell">
              <span className={`risk-num risk-${task.riskClass}`}>{task.risk}%</span>
              <div className="risk-bar mini-risk-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${task.risk}%`,
                    background: task.riskClass === 'high' ? 'var(--risk-high)' : task.riskClass === 'medium' ? 'var(--risk-medium)' : 'var(--risk-low)',
                  }}
                />
              </div>
            </div>

            <span className="tag category-tag">{task.category}</span>

            <div style={{ display: 'flex', gap: 4 }}>
              <button className="rem-action-btn" onClick={() => toggleStar(task.id)}>
                <Star size={12} fill={task.starred ? 'var(--risk-medium)' : 'none'} color={task.starred ? 'var(--risk-medium)' : 'var(--text-muted)'} />
              </button>
              <button className="rem-action-btn"><MoreHorizontal size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
