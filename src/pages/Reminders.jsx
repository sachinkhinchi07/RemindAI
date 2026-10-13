import { useState } from 'react';
import {
  Bell, Plus, Clock, Check, X, ChevronRight,
  Repeat, Brain, Filter, Zap, Calendar,
  AlertTriangle, Star, MoreHorizontal
} from 'lucide-react';
import './Reminders.css';

const reminders = [
  {
    id: 1,
    type: 'ai',
    label: 'Flag Sprint Retro deck to Sarah',
    time: 'Today, 12:15 PM',
    tag: 'Work',
    tagClass: 'work',
    urgency: 'high',
    reason: 'You usually notify Product Lead before 12:30 PM. Calculated risk.',
    repeat: false,
  },
  {
    id: 2,
    type: 'ai',
    label: 'Order catering for Friday offsite',
    time: 'Today, 2:00 PM',
    tag: 'Work',
    tagClass: 'work',
    urgency: 'medium',
    reason: "Calendar item 'Design Sprint' has 12 attendees. Lead time expires in 4h.",
    repeat: false,
  },
  {
    id: 3,
    type: 'manual',
    label: 'Standup async call',
    time: 'Today, 10:00 AM',
    tag: 'Work',
    tagClass: 'work',
    urgency: 'normal',
    done: true,
  },
  {
    id: 4,
    type: 'routine',
    label: '10-min cognitive reset',
    time: 'Today, 4:00 PM',
    tag: 'Health',
    tagClass: 'health',
    urgency: 'normal',
    repeat: true,
  },
  {
    id: 5,
    type: 'routine',
    label: 'Log daily retrospective',
    time: 'Today, 6:00 PM',
    tag: 'Personal',
    tagClass: 'personal',
    urgency: 'normal',
    repeat: true,
  },
  {
    id: 6,
    type: 'manual',
    label: 'Renew Cloudflare SSL Certification',
    time: 'Tomorrow, 9:00 AM',
    tag: 'DevOps',
    tagClass: 'dev',
    urgency: 'high',
    repeat: false,
  },
];

export default function Reminders() {
  const [items, setItems] = useState(reminders);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const toggleDone = (id) => {
    setItems(prev => prev.map(r => r.id === id ? { ...r, done: !r.done } : r));
  };

  const dismiss = (id) => {
    setItems(prev => prev.filter(r => r.id !== id));
  };

  const addReminder = () => {
    if (!newLabel.trim()) return;
    setItems(prev => [...prev, {
      id: Date.now(),
      type: 'manual',
      label: newLabel,
      time: 'Custom',
      tag: 'Personal',
      tagClass: 'personal',
      urgency: 'normal',
    }]);
    setNewLabel('');
    setShowAdd(false);
  };

  return (
    <div className="reminders-page animate-fade-in-up">
      <div className="rem-header">
        <div>
          <h1 className="rem-title">Smart Reminders</h1>
          <p className="rem-sub">Context-aware, AI-generated and manual reminders — sorted by urgency</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary"><Filter size={13} /> Filter</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Reminder
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="add-reminder-panel animate-fade-in">
          <div className="add-reminder-inner">
            <Brain size={16} color="var(--text-brand)" />
            <input
              className="input"
              placeholder='e.g. "Remind me to send the Q3 report by 5 PM"'
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addReminder()}
              autoFocus
            />
            <button className="btn btn-primary" onClick={addReminder}>
              <Zap size={13} /> Schedule
            </button>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="rem-stats">
        {[
          { label: 'Active', value: items.filter(r => !r.done).length, color: 'var(--text-brand)' },
          { label: 'AI-Generated', value: items.filter(r => r.type === 'ai').length, color: 'var(--brand-primary)' },
          { label: 'Routines', value: items.filter(r => r.type === 'routine').length, color: 'var(--risk-low)' },
          { label: 'Completed Today', value: items.filter(r => r.done).length, color: 'var(--text-muted)' },
        ].map((s, i) => (
          <div key={i} className="rem-stat">
            <span className="rem-stat-value" style={{ color: s.color }}>{s.value}</span>
            <span className="rem-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Reminders list */}
      <div className="rem-list">
        {items.map(r => (
          <div key={r.id} className={`rem-item rem-urgency-${r.urgency} ${r.done ? 'rem-done' : ''}`}>
            <button
              className={`rem-check ${r.done ? 'done' : ''}`}
              onClick={() => toggleDone(r.id)}
              aria-label="Toggle done"
            >
              {r.done && <Check size={12} />}
            </button>

            <div className="rem-icon-col">
              {r.type === 'ai' && <div className="rem-type-icon ai-icon"><Brain size={13} /></div>}
              {r.type === 'routine' && <div className="rem-type-icon routine-icon"><Repeat size={13} /></div>}
              {r.type === 'manual' && <div className="rem-type-icon manual-icon"><Bell size={13} /></div>}
            </div>

            <div className="rem-body">
              <div className="rem-top">
                <span className="rem-label">{r.label}</span>
                {r.urgency === 'high' && <AlertTriangle size={13} color="var(--risk-high)" />}
              </div>
              <div className="rem-meta">
                <Clock size={11} />
                <span>{r.time}</span>
                <span className={`tag tag-${r.tagClass}`}>{r.tag}</span>
                {r.repeat && <span className="tag"><Repeat size={10} /> Recurring</span>}
                {r.type === 'ai' && <span className="badge badge-brand" style={{ fontSize: 9, padding: '1px 6px' }}>AI</span>}
              </div>
              {r.reason && (
                <p className="rem-reason">{r.reason}</p>
              )}
            </div>

            <div className="rem-actions">
              <button className="rem-action-btn" onClick={() => dismiss(r.id)} aria-label="Dismiss">
                <X size={13} />
              </button>
              <button className="rem-action-btn" aria-label="More">
                <MoreHorizontal size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
