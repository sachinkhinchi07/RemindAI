import { useState } from 'react';
import {
  Pencil, Calendar, Clock, Tag, X, Save, AlertTriangle, Check
} from 'lucide-react';
import './EditTaskModal.css';

export default function EditTaskModal({ task, isOpen = true, onClose, onSave }) {
  if (!isOpen || !task) return null;

  const [title, setTitle] = useState(task.title || task.name || '');
  const [priority, setPriority] = useState((task.priority || 'medium').toLowerCase());
  const [status, setStatus] = useState((task.status || 'pending').toLowerCase());

  // Format existing due date for input type="datetime-local"
  const [dueAt, setDueAt] = useState(() => {
    if (!task.due_at) return '';
    try {
      const d = new Date(task.due_at);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  });

  const [tagsInput, setTagsInput] = useState(() => {
    if (Array.isArray(task.tags)) return task.tags.join(', ');
    return task.category || '';
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    const parsedTags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    let isoDueAt = null;
    if (dueAt) {
      const parsedDate = new Date(dueAt);
      if (!isNaN(parsedDate.getTime())) {
        isoDueAt = parsedDate.toISOString();
      }
    }

    const updates = {
      title: title.trim(),
      priority,
      status,
      due_at: isoDueAt,
      tags: parsedTags.length > 0 ? parsedTags : ['#task'],
    };

    if (onSave) {
      await onSave(task.id, updates);
    }
    setIsSaving(false);
    if (onClose) onClose();
  };

  return (
    <div className="edit-task-backdrop" onClick={onClose}>
      <div className="edit-task-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-task-header">
          <div className="edit-task-title">
            <Pencil size={16} color="var(--brand-primary, #6366f1)" />
            <span>Edit Scheduled Task</span>
          </div>
          <button className="edit-task-close" onClick={onClose} aria-label="Close edit task dialog">
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="edit-task-body">
            {/* Title */}
            <div className="edit-field-group">
              <label className="edit-field-label">Task Title</label>
              <input
                type="text"
                className="edit-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Deliver Project Presentation"
                required
                autoFocus
              />
            </div>

            {/* 2-col: Priority & Status */}
            <div className="edit-row-2col">
              <div className="edit-field-group">
                <label className="edit-field-label">Priority</label>
                <select
                  className="edit-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent Priority</option>
                </select>
              </div>

              <div className="edit-field-group">
                <label className="edit-field-label">Execution Status</label>
                <select
                  className="edit-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Completed / Done</option>
                </select>
              </div>
            </div>

            {/* Due Date & Time */}
            <div className="edit-field-group">
              <label className="edit-field-label">Target Due Date & Time</label>
              <input
                type="datetime-local"
                className="edit-input"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                style={{ cursor: 'pointer' }}
              />
            </div>

            {/* Tags / Categories */}
            <div className="edit-field-group">
              <label className="edit-field-label">Tags / Context (Comma separated)</label>
              <input
                type="text"
                className="edit-input"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. #work, #presentation, #q4"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="edit-task-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{ fontSize: 12, padding: '7px 14px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || !title.trim()}
              style={{ fontSize: 12, padding: '7px 16px', gap: 6 }}
            >
              {isSaving ? 'Saving...' : (
                <>
                  <Save size={14} /> Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
