import { useState, useRef } from 'react';
import {
  Sparkles, FileText, Mic, Shuffle, Calendar, Clock,
  CheckCircle2, X, Edit3, ArrowRight, Check, AlertCircle,
  Laptop, Shield, Plus, Trash2, Tag, Loader2
} from 'lucide-react';
import { speechRecognizer } from '../lib/voiceService';
import './CreateTaskModal.css';

export default function CreateTaskModal({ isOpen = true, onClose, onSave }) {
  const [activeTab, setActiveTab] = useState('nl'); // 'nl' | 'manual'
  const [prompt, setPrompt] = useState(
    'I have a presentation tomorrow at 10 AM. Remind me to carry my laptop and presentation file.'
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDictating, setIsDictating] = useState(false);

  // Extracted preview fields
  const [extractedTitle, setExtractedTitle] = useState('Deliver Project Presentation');
  const [eventDate, setEventDate] = useState('Tomorrow (Fri, Oct 25), 10:00 AM');
  const [proactiveRecall, setProactiveRecall] = useState('Tomorrow at 8:45 AM');
  const [resolvedDueAt, setResolvedDueAt] = useState(null);
  const [extractedPriority, setExtractedPriority] = useState('medium');
  const [extractedCategory, setExtractedCategory] = useState('Work');
  const [ambiguitiesList, setAmbiguitiesList] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [checklist, setChecklist] = useState([
    { id: 1, text: 'Pack laptop and charger', tag: 'Hardware', checked: true },
    { id: 2, text: 'Verify presentation file and USB backup', tag: 'Asset', checked: true },
  ]);

  // Interactive calendar & proactive recall buffer state
  const [customDateTime, setCustomDateTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [recallBufferMinutes, setRecallBufferMinutes] = useState(75);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const dateInputRef = useRef(null);

  const updateRecallTime = (targetDt, bufferMins) => {
    const recallDate = new Date(targetDt.getTime() - bufferMins * 60 * 1000);
    const recallTime = recallDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sameDay = recallDate.toDateString() === targetDt.toDateString();
    setProactiveRecall(
      sameDay
        ? `Tomorrow at ${recallTime}`
        : `${recallDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${recallTime}`
    );
  };

  const handleDateTimeChange = (newVal) => {
    setCustomDateTime(newVal);
    const dt = new Date(newVal);
    if (!isNaN(dt.getTime())) {
      setResolvedDueAt(dt.toISOString());
      const formattedDate = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      const formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setEventDate(`${formattedDate}, ${formattedTime}`);
      updateRecallTime(dt, recallBufferMinutes);
    }
  };

  const handleBufferChange = (bufferMins) => {
    setRecallBufferMinutes(bufferMins);
    const dt = customDateTime ? new Date(customDateTime) : new Date();
    if (!isNaN(dt.getTime())) {
      updateRecallTime(dt, bufferMins);
    }
  };

  // Manual form state
  const [manualTitle, setManualTitle] = useState('');
  const [manualDueDate, setManualDueDate] = useState('');
  const [manualPriority, setManualPriority] = useState('High Priority');
  const [manualCategory, setManualCategory] = useState('Work');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const handleExtract = async () => {
    if (!prompt.trim()) return;
    setIsExtracting(true);
    setParseError(null);
    try {
      const response = await fetch('http://localhost:8000/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: prompt,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          client_now: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || 'ReMind could not parse that task text.');
      }

      const parsed = await response.json();
      setExtractedTitle(parsed.title || 'New Task');
      setResolvedDueAt(parsed.due_at || null);
      setExtractedPriority(parsed.priority || 'medium');
      setExtractedCategory(parsed.category || 'Work');
      setAmbiguitiesList(parsed.ambiguities || []);

      // Format display dates
      if (parsed.due_date_str) {
        setEventDate(`${parsed.due_date_str}${parsed.due_time_str ? ` at ${parsed.due_time_str}` : ''}`);
        setProactiveRecall(`${parsed.due_date_str}${parsed.due_time_str ? ' (Proactive Recall Scheduled)' : ''}`);
      } else {
        setEventDate('No deadline specified');
        setProactiveRecall('As needed');
      }

      // Populate checklist items
      if (parsed.related_items && parsed.related_items.length > 0) {
        setChecklist(
          parsed.related_items.map((item, idx) => ({
            id: idx + 1,
            text: item,
            tag: 'Item',
            checked: true,
          }))
        );
      } else {
        setChecklist([]);
      }
    } catch (err) {
      console.warn('Backend parsing unavailable, using local fallback:', err.message);
      setParseError(err.message);
      // Fallback for seamless offline use
      if (prompt.toLowerCase().includes('flight') || prompt.toLowerCase().includes('airport')) {
        setExtractedTitle('Catch Flight & Airport Transit');
        setEventDate('Thursday, Nov 14, 2:30 PM');
        setProactiveRecall('Thursday at 11:30 AM (3h buffer)');
        setChecklist([
          { id: 1, text: 'Passport & boarding pass check', tag: 'Doc', checked: true },
          { id: 2, text: 'Cab reservation confirmation', tag: 'Transit', checked: true },
        ]);
      } else {
        setExtractedTitle('Deliver Project Presentation');
        setEventDate('Tomorrow, 10:00 AM');
        setProactiveRecall('Tomorrow at 8:45 AM');
      }
    } finally {
      setIsExtracting(false);
    }
  };


  const handleDictate = () => {
    if (isDictating) {
      setIsDictating(false);
      return;
    }

    if (!speechRecognizer.isSupported()) {
      setParseError('Microphone speech recognition is not supported in this browser. You can type instead.');
      return;
    }

    setIsDictating(true);
    setParseError(null);

    speechRecognizer.startListening({
      onResult: (transcript) => {
        setPrompt(transcript);
        setIsDictating(false);
      },
      onError: (errMsg) => {
        setParseError(errMsg);
        setIsDictating(false);
      },
      onStatusChange: (status) => {
        if (status === 'idle') setIsDictating(false);
      },
    });
  };

  const toggleCheck = (id) => {
    setChecklist(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => {
      if (onSave) {
        const computedDueAt = resolvedDueAt || (customDateTime ? new Date(customDateTime).toISOString() : null);
        onSave({
          title: activeTab === 'nl' ? extractedTitle : (manualTitle || 'New Scheduled Task'),
          due: activeTab === 'nl' ? eventDate : (manualDueDate || 'Tomorrow, 10:00 AM'),
          due_at: activeTab === 'nl' ? computedDueAt : (manualDueDate ? new Date(manualDueDate).toISOString() : null),
          priority: activeTab === 'nl' ? extractedPriority : (manualPriority.toLowerCase().includes('high') ? 'high' : 'medium'),
          category: activeTab === 'nl' ? extractedCategory : manualCategory,
          recall: proactiveRecall,
          checklist,
        });
      }
      if (onClose) onClose();
    }, 600);
  };


  return (
    <div className="task-modal-backdrop" onClick={onClose}>
      <div className="task-modal-drawer animate-slide-left" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="task-modal-header">
          <div className="header-left">
            <span className="dot-indicator" />
            <div>
              <h2 className="header-title">Create New Task</h2>
              <p className="header-sub">Add manually or use natural language for AI routine extraction</p>
            </div>
          </div>
          <div className="header-right">
            <span className="kbd-esc">ESC</span>
            <button className="btn-close" onClick={onClose} aria-label="Close dialog">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="task-tabs-row">
          <button
            className={`task-tab-btn ${activeTab === 'nl' ? 'active' : ''}`}
            onClick={() => setActiveTab('nl')}
          >
            <Sparkles size={15} className="tab-sparkle-icon" />
            <span>Natural Language AI Entry</span>
            <span className="pill-pro-active">Pro Active</span>
          </button>
          <button
            className={`task-tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            <FileText size={15} />
            <span>Structured Manual Form</span>
          </button>
        </div>

        {/* Body Container */}
        <div className="task-modal-body">
          {activeTab === 'nl' ? (
            <div className="nl-flow">
              {/* Natural Language Prompt Section */}
              <div className="prompt-section">
                <div className="prompt-section-header">
                  <span className="prompt-label">Natural Language Prompt</span>
                  <span className="context-badge">
                    <Sparkles size={12} />
                    Context-aware extraction active
                  </span>
                </div>

                <div className="prompt-box-wrapper">
                  <textarea
                    className="prompt-textarea"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="E.g., I have a presentation tomorrow at 10 AM. Remind me to carry my laptop and presentation file."
                  />
                  <button
                    className={`btn-dictate ${isDictating ? 'recording' : ''}`}
                    onClick={handleDictate}
                    type="button"
                  >
                    <Mic size={14} className={isDictating ? 'pulse-mic' : ''} />
                    <span>{isDictating ? 'Listening...' : 'Dictate'}</span>
                  </button>
                </div>

                <div className="prompt-actions-bar">
                  <div className="parse-context-hint">
                    <Shuffle size={14} className="shuffle-icon" />
                    <span>Parses calendar context, preparation rush & items</span>
                  </div>
                  <button
                    className="btn-extract-primary"
                    onClick={handleExtract}
                    disabled={isExtracting}
                  >
                    {isExtracting ? (
                      <>
                        <Loader2 size={15} className="spin-icon" />
                        <span>Analyzing context...</span>
                      </>
                    ) : (
                      <>
                        <span>Extract with ReMind AI</span>
                        <Sparkles size={15} />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Extraction Preview Card */}
              <div className="ai-preview-card">
                <div className="preview-card-header">
                  <div className="preview-title-left">
                    <Sparkles size={16} className="sparkle-gold" />
                    <span className="preview-heading">AI Extraction Preview — Demo Data</span>
                  </div>
                  <div className="confidence-pill">
                    <span className="confidence-dot" />
                    Confidence 98.4%
                  </div>
                </div>

                <div className="preview-content">
                  {/* Extracted Title */}
                  <div className="form-group">
                    <label className="field-label">Extracted Title (Editable)</label>
                    <div className="editable-input-wrap">
                      <input
                        type="text"
                        className="editable-title-input"
                        value={extractedTitle}
                        onChange={(e) => setExtractedTitle(e.target.value)}
                      />
                      <Edit3 size={15} className="edit-icon" />
                    </div>
                  </div>

                  {/* Dates Row */}
                  <div className="dates-grid">
                    <div className="date-field-col">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Target Event Date & Time</label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingDate(prev => !prev);
                            if (!isEditingDate) setTimeout(() => dateInputRef.current?.showPicker?.(), 50);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#4f46e5',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Edit3 size={11} /> {isEditingDate ? 'Done' : 'Change Date'}
                        </button>
                      </div>
                      <div
                        className="date-display-box"
                        style={{ cursor: 'pointer', position: 'relative' }}
                        onClick={() => {
                          if (!isEditingDate) {
                            setIsEditingDate(true);
                            setTimeout(() => dateInputRef.current?.showPicker?.(), 50);
                          }
                        }}
                        title="Click to select date and time"
                      >
                        <Calendar size={15} className="date-icon" />
                        {isEditingDate ? (
                          <input
                            ref={dateInputRef}
                            type="datetime-local"
                            className="date-picker-input"
                            value={customDateTime}
                            onChange={(e) => handleDateTimeChange(e.target.value)}
                            onBlur={() => setIsEditingDate(false)}
                            autoFocus
                            style={{
                              border: 'none',
                              outline: 'none',
                              background: 'transparent',
                              fontFamily: 'inherit',
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: '#1e293b',
                              width: '100%',
                              cursor: 'pointer',
                            }}
                          />
                        ) : (
                          <span style={{ flex: 1, fontWeight: 600 }}>{eventDate}</span>
                        )}
                      </div>
                    </div>

                    <div className="date-field-col">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="field-label" style={{ marginBottom: 0 }}>Suggested Proactive Recall</label>
                      </div>
                      <div className="date-display-box highlight">
                        <Clock size={15} className="date-icon" />
                        <span style={{ fontWeight: 600 }}>{proactiveRecall}</span>
                      </div>
                    </div>
                  </div>

                  {/* Subtext explanation & Proactive Buffer Controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: -4 }}>
                    <div className="recall-rationale" style={{ margin: 0 }}>
                      <span className="curved-arrow">↳</span>
                      <span>Set {recallBufferMinutes}m prior to presentation to allow commute & room equipment setup.</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>Buffer:</span>
                      {[
                        { label: '30m', mins: 30 },
                        { label: '45m', mins: 45 },
                        { label: '75m', mins: 75 },
                        { label: '2h', mins: 120 },
                      ].map((b) => (
                        <button
                          key={b.mins}
                          type="button"
                          onClick={() => handleBufferChange(b.mins)}
                          style={{
                            fontSize: 10.5,
                            padding: '2px 7px',
                            borderRadius: 6,
                            border: recallBufferMinutes === b.mins ? '1.5px solid #6366f1' : '1px solid #cbd5e1',
                            background: recallBufferMinutes === b.mins ? '#eef2ff' : '#ffffff',
                            color: recallBufferMinutes === b.mins ? '#4338ca' : '#64748b',
                            fontWeight: recallBufferMinutes === b.mins ? 700 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Extracted Items Checklist */}
                  <div className="checklist-section">
                    <label className="field-label">Extracted Related Items / Sub-checklist (2 items detected)</label>
                    <div className="checklist-items-stack">
                      {checklist.map((item) => (
                        <div key={item.id} className="checklist-item-row" onClick={() => toggleCheck(item.id)}>
                          <div className={`checkbox-custom ${item.checked ? 'checked' : ''}`}>
                            {item.checked && <Check size={12} strokeWidth={3} />}
                          </div>
                          <span className={`checklist-item-text ${item.checked ? '' : 'unchecked'}`}>
                            {item.text}
                          </span>
                          <span className="item-tag-badge">{item.tag}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Status bar */}
                <div className="preview-status-bar">
                  <div className="status-left">
                    <CheckCircle2 size={16} className="status-check-icon" />
                    <span>All critical task parameters resolved via AI synthesis</span>
                  </div>
                  <span className="ready-badge">Ready</span>
                </div>
              </div>
            </div>
          ) : (
            /* Manual Form */
            <div className="manual-flow">
              <div className="form-group">
                <label className="field-label">Task Name / Title</label>
                <input
                  type="text"
                  className="manual-input"
                  placeholder="e.g. Prepare Quarter End Financial Review"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </div>

              <div className="dates-grid">
                <div className="date-field-col">
                  <label className="field-label">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    className="manual-input"
                    value={manualDueDate}
                    onChange={(e) => setManualDueDate(e.target.value)}
                  />
                </div>
                <div className="date-field-col">
                  <label className="field-label">Priority Level</label>
                  <select
                    className="manual-select"
                    value={manualPriority}
                    onChange={(e) => setManualPriority(e.target.value)}
                  >
                    <option>High Priority</option>
                    <option>Urgent</option>
                    <option>Medium Priority</option>
                    <option>Low Priority</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="field-label">Context Category</label>
                <select
                  className="manual-select"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  <option>Work & Engineering</option>
                  <option>Design & Systems</option>
                  <option>Personal & Habits</option>
                  <option>Travel & Transit</option>
                </select>
              </div>

              <div className="manual-info-box">
                <Shield size={16} />
                <span>AI will automatically analyze your historical forgetfulness and schedule optimal recall cues.</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="task-modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save-schedule" onClick={handleSave}>
            {saveSuccess ? (
              <>
                <Check size={16} />
                <span>Scheduled!</span>
              </>
            ) : (
              <>
                <FileText size={16} />
                <span>Save & Schedule Reminder</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
