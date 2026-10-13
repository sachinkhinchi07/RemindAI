import { useState, useMemo, useRef, useEffect } from 'react';
import {
  AlertTriangle, TrendingUp, CheckCircle2, Star,
  Clock, Users, Zap, RefreshCw, Mic, MicOff, Paperclip,
  ChevronRight, Bell, MapPin, Calendar, ArrowRight,
  Activity, Shield, BarChart2, Info,
  Brain, Sparkles, AlertCircle, X, Check, AlarmClock, Eye
} from 'lucide-react';
import { createTask, createReminder } from '../lib/db';
import { parseNaturalDateTime } from '../lib/nlpParser';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../hooks/useTasks';

import './Dashboard.css';


const statsData = [
  {
    label: 'High Risk of Forgetting',
    value: '2',
    sub: 'tasks slip predicted',
    extra: '87% avg. predicted miss rate',
    badge: 'Urgent',
    badgeClass: 'badge-high',
    icon: AlertTriangle,
    iconColor: '#EF4444',
    trend: 'up',
  },
  {
    label: 'Medium Risk',
    value: '4',
    sub: 'tasks pending adjustment',
    extra: '+35m schedule slippage',
    badge: 'Routine Drift',
    badgeClass: 'badge-medium',
    icon: Clock,
    iconColor: '#F59E0B',
    trend: 'neutral',
  },
  {
    label: 'Completed Today',
    value: '9',
    sub: 'tasks resolved',
    extra: '100% morning routine lock',
    badge: 'On Track',
    badgeClass: 'badge-low',
    icon: CheckCircle2,
    iconColor: '#10B981',
    trend: 'down',
  },
  {
    label: 'Routine Memory Score',
    value: '94%',
    sub: 'Adaptive model calibrated',
    extra: '+3% this week',
    badge: 'Optimal',
    badgeClass: 'badge-brand',
    icon: Brain,
    iconColor: '#818CF8',
    trend: 'up',
  },
];

const atRiskTasks = [
  {
    id: 1,
    name: 'Submit quarterly vendor contract renewal',
    badge: 'High Risk • 87% chance of slip',
    badgeClass: 'high',
    dueTime: 'Due in 2h (12:00 PM)',
    category: 'Procurement & Ops',
    reason: 'Prior month delayed by 4 days due to legal review queue collision.',
    status: 'high',
  },
  {
    id: 2,
    name: 'Review design specs with mobile engineering team',
    badge: 'Routine drift detected (+45m)',
    badgeClass: 'medium',
    dueTime: '2:30 PM (Orig: 1:45 PM)',
    category: 'Product & Design',
    reason: 'Lead engineer on vacation; ReMind pushed sync downstream to prevent calendar crunch.',
    status: 'medium',
    actionLabel: 'Resync',
  },
  {
    id: 3,
    name: 'Morning cognitive reset & daily standup notes',
    badge: 'Completed at 9:15 AM',
    badgeClass: 'done',
    dueTime: 'Archived to Memory Graph',
    category: '#routine-standup',
    status: 'done',
  },
];

const upcomingRoutines = [
  { time: '11:30 AM', label: 'Sprint Review Submission', prob: 94, sources: ['Calendar', 'Slack Trigger'] },
  { time: '02:30 PM', label: 'Mobile Spec Sync', prob: 76, shift: 'Shifted from 1:45 PM based on historical standup spillover.' },
  { time: '05:15 PM', label: 'End of Day Mental Debrief', prob: 88, note: '5-minute audio journal prompt will be staged.' },
];

const reminders = [
  { icon: '📺', label: 'Standup async c...', time: 'In 20m', at: '10:00 AM', tag: 'Work', tagClass: 'work' },
  { icon: '💻', label: 'Review Design...', time: 'Scheduled', at: '1:30 PM', tag: 'Dev', tagClass: 'dev' },
  { icon: '🌿', label: '10-min cognitive...', time: 'Routine', at: '4:00 PM', tag: 'Health', tagClass: 'health' },
  { icon: '🌙', label: 'Log daily r...', time: 'Evening Rhythm', at: '6:00 PM', tag: 'Personal', tagClass: 'personal' },
];

const suggestions = [
  {
    title: 'Quarterly Marketing Sprint Review',
    extra: 'Pattern #82',
    badge: 'Postponed 3x this week',
    badgeClass: 'medium',
    desc: 'AI suggestion: Lock a focused 45-min block at 11:30 AM today before fatigue sets in.',
    actions: [
      { label: 'Accept Suggestion', cls: 'btn-primary' },
      { label: 'Snooze', cls: 'btn-secondary' },
    ],
  },
  {
    title: 'Client Architecture Deliverable',
    extra: 'Zero Drafts',
    badge: 'Due in 36 Hours',
    badgeClass: 'high',
    desc: 'Zero document modifications recorded. ReMind recommends deconstructing into 3 smaller micro-drafts.',
    actions: [
      { label: 'Break Down into 3 Sub-Tasks', cls: 'btn-primary' },
      { label: 'Dismiss', cls: 'btn-secondary' },
    ],
  },
];

const weekDays = ['M', 'T', 'W', 'T*', 'F', 'S', 'S'];

export default function Dashboard() {
  const { tasks, loading: tasksLoading, markDone, addTask } = useTasks();
  const [activeFilter, setActiveFilter] = useState('All');
  const [captureText, setCaptureText] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [captureFeedback, setCaptureFeedback] = useState('');
  const [activeSuggestions, setActiveSuggestions] = useState(suggestions);

  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
  const [bannerAccepted, setBannerAccepted] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const parsedMemory = useMemo(() => {
    return parseNaturalDateTime(captureText);
  }, [captureText]);

  // Voice Speech-to-Text Support via Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setCaptureText(transcript);
        }
      };

      recognition.onerror = (err) => {
        console.error('Speech recognition error:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceRecording = () => {
    if (!recognitionRef.current) {
      setCaptureFeedback('⚠️ Speech recognition not supported in this browser.');
      setTimeout(() => setCaptureFeedback(''), 4000);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setCaptureFeedback('🎙️ Listening... speak your reminder naturally.');
      } catch (err) {
        console.warn('Voice restart:', err);
        setIsListening(false);
      }
    }
  };

  const handleAutoSchedule = async () => {
    if (!captureText.trim()) return;
    setIsScheduling(true);
    setCaptureFeedback('');
    try {
      const parsed = parseNaturalDateTime(captureText);
      const titleToSave = parsed.cleanTitle || captureText.trim();
      
      const payload = {
        title: titleToSave,
        priority: 'high',
        status: 'pending',
        risk_score: 80,
        risk_label: parsed.hasParsed 
          ? `Auto-Scheduled • ${parsed.dateLabel || 'Today'}${parsed.timeStr ? ` @ ${parsed.timeStr}` : ''}`
          : 'Auto-Scheduled • High Risk',
        risk_reason: parsed.hasParsed
          ? `Natural language parsed: ${[parsed.dateLabel, parsed.timeStr].filter(Boolean).join(' at ')}`
          : 'Captured from NLP Instant Memory bar',
        tags: ['#instant-capture', '#nlp-parsed'],
      };

      if (parsed.dateStr) {
        payload.due_date = parsed.dateStr;
      }
      if (parsed.timeStr) {
        payload.due_time = parsed.timeStr;
      }

      // 1. Create task record
      const { data: createdTask } = await createTask(payload);

      // 2. Synchronize directly to Reminders table if a target time/date was identified
      if (createdTask?.id && (parsed.targetIsoTimestamp || parsed.dateStr)) {
        try {
          await createReminder({
            task_id: createdTask.id,
            remind_at: parsed.targetIsoTimestamp || new Date(parsed.dateStr).toISOString(),
            status: 'pending',
          });
        } catch (remErr) {
          console.warn('Reminder sync warning (non-fatal):', remErr);
        }
      }

      setCaptureText('');
      const feedbackMsg = parsed.hasParsed
        ? `✅ Auto-scheduled "${titleToSave}" for ${[parsed.dateLabel, parsed.timeStr].filter(Boolean).join(' at ')} & synced to Reminders!`
        : '✅ Successfully scheduled & saved to database!';
      setCaptureFeedback(feedbackMsg);
      setTimeout(() => setCaptureFeedback(''), 5000);
    } catch (err) {
      console.error(err);
      setCaptureFeedback('⚠️ Error saving to database');
    } finally {
      setIsScheduling(false);
    }
  };

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter to quickly schedule
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAutoSchedule();
    }
  };

  const handleAcceptBanner = async () => {
    await createTask({
      title: 'Q3 Marketing Sprint Review',
      priority: 'high',
      status: 'scheduled',
      risk_score: 75,
      risk_label: 'AI Proactive Scheduled',
      risk_reason: 'Recurring Thursday rhythm adherence prompt',
      tags: ['#ai-routine', '#marketing'],
    });
    setBannerAccepted(true);
  };

  const handleSuggestionAction = async (suggestionIndex, actionLabel, title) => {
    if (actionLabel.toLowerCase().includes('accept') || actionLabel.toLowerCase().includes('break down')) {
      await createTask({
        title,
        priority: 'high',
        status: 'pending',
        risk_score: 70,
        risk_label: 'AI Recommendation Accepted',
        risk_reason: 'Generated from Proactive Suggestion Engine',
        tags: ['#ai-suggestion'],
      });
    }
    // Remove the handled suggestion card
    setActiveSuggestions(prev => prev.filter((_, idx) => idx !== suggestionIndex));
  };

  // Convert DB tasks to dashboard shape, falling back or merging with demo tasks if DB has fewer
  const dbMappedTasks = tasks.map(t => ({
    id: t.id,
    name: t.title,
    badge: t.risk_label || (t.risk_score ? `Risk: ${t.risk_score}%` : (t.priority === 'high' ? 'High Risk • 85% slip' : 'Medium Risk')),
    badgeClass: t.risk_score > 70 || t.priority === 'high' ? 'high' : (t.status === 'completed' ? 'done' : 'medium'),
    dueTime: t.due_time || (t.due_date ? new Date(t.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today'),
    category: (t.tags && t.tags[0]) || t.category || 'General',
    reason: t.risk_reason || t.description || 'Monitored by ReMind proactive defense graph.',
    status: t.status === 'completed' ? 'done' : (t.priority === 'high' ? 'high' : 'medium'),
    raw: t,
  }));

  const displayTasks = dbMappedTasks.length > 0 ? dbMappedTasks : atRiskTasks;

  const filteredTasks = displayTasks.filter(task => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'High Risk') return task.status === 'high' || task.badgeClass === 'high';
    if (activeFilter === 'Medium Risk') return task.status === 'medium' || task.badgeClass === 'medium';
    if (activeFilter === 'Completed') return task.status === 'done';
    if (activeFilter === 'Routines') return task.category?.includes('routine') || task.badge?.includes('routine');
    return true;
  });

  const filterButtons = ['All', 'High Risk', 'Medium Risk', 'Routines', 'Completed'];

  return (
    <div className="dashboard animate-fade-in-up">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-greeting">
          <h1 className="greeting-title">Good morning, <span className="gradient-text">{userName}</span>. ReMind has detected 2 forgotten routines.</h1>
          <p className="greeting-sub">Your proactive memory system synced 4 minutes ago across 3 calendar bridges.</p>
        </div>
        <div className="dashboard-date">
          <Calendar size={14} />
          <span>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {/* AI Proactive Detection Banner */}
      {!bannerAccepted && (
        <div className="proactive-banner animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <div className="banner-left">
            <div className="banner-badge">
              <Sparkles size={13} />
              AI PROACTIVE DETECTION
              <span className="conf-badge">• High Confidence</span>
            </div>
            <p className="banner-text">
              Based on your recurring Thursday rhythm, you normally submit the{' '}
              <strong>Q3 Marketing Sprint review by 11:30 AM</strong>. Would you like me to schedule a prompt?
            </p>
          </div>
          <div className="banner-actions">
            <button className="btn btn-secondary" onClick={() => setBannerAccepted(true)}>Dismiss</button>
            <button className="btn btn-primary" onClick={handleAcceptBanner}>
              <Check size={14} />
              Accept & Schedule
            </button>
          </div>
        </div>
      )}


      {/* Stats Grid */}
      <div className="stats-grid animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {statsData.map((stat, i) => (
          <div key={i} className="stat-card-item">
            <div className="stat-card-top">
              <span className="stat-label">{stat.label}</span>
              <span className={`badge ${stat.badgeClass}`}>{stat.badge}</span>
            </div>
            <div className="stat-card-value-row">
              <span className="stat-value" style={{ color: stat.iconColor }}>{stat.value}</span>
              <div className="stat-icon" style={{ background: `${stat.iconColor}18`, color: stat.iconColor }}>
                <stat.icon size={18} strokeWidth={2} />
              </div>
            </div>
            <div className="stat-sub">{stat.sub}</div>
            <div className="stat-extra">
              {stat.trend === 'up' && <TrendingUp size={11} />}
              {stat.extra}
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions row */}
      {activeSuggestions.length > 0 && (
        <div className="suggestions-row animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          {activeSuggestions.map((s, i) => (
            <div key={i} className="suggestion-card">
              <div className="suggestion-top">
                <span className={`badge badge-${s.badgeClass}`}>{s.badge}</span>
                <span className="suggestion-extra">{s.extra}</span>
              </div>
              <h3 className="suggestion-title">{s.title}</h3>
              <p className="suggestion-desc">{s.desc}</p>
              <div className="suggestion-actions">
                {s.actions.map((a, j) => (
                  <button
                    key={j}
                    className={`btn ${a.cls}`}
                    style={{ fontSize: 12 }}
                    onClick={() => handleSuggestionAction(i, a.label, s.title)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main 2-col layout */}
      <div className="dashboard-main animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
        {/* Left: Tasks */}
        <div className="tasks-col">
          <div className="section-header">
            <div>
              <h2 className="section-title">Proactive Reminders & Predicted Tasks</h2>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Ranked by algorithmically determined forgetting curves</p>
            </div>
          </div>

          {/* Filters */}
          <div className="task-filters">
            {filterButtons.map(f => (
              <button
                key={f}
                className={`filter-btn ${activeFilter === f ? 'active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Task list */}
          <div className="task-list">
            {filteredTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
                No tasks in this view. Use the Instant Memory Capture to schedule one!
              </div>
            ) : (
              filteredTasks.map(task => (
                <div key={task.id} className={`task-item task-${task.status}`}>
                  <div
                    className="task-check"
                    style={{ cursor: task.raw ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (task.raw && task.status !== 'done') {
                        markDone(task.id);
                      }
                    }}
                    title={task.raw ? "Mark complete in database" : ""}
                  >
                    {task.status === 'done' ? (
                      <div className="task-check-done"><Check size={12} /></div>
                    ) : (
                      <div className="task-check-empty" />
                    )}
                  </div>
                  <div className="task-body">
                    <div className="task-top-row">
                      <span className={`task-risk-badge ${task.badgeClass}`}>{task.badge}</span>
                      {task.actionLabel && (
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}>
                          {task.actionLabel}
                        </button>
                      )}
                    </div>
                    <p className="task-name" style={{ textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
                      {task.name}
                    </p>
                    <div className="task-meta">
                      <span><Clock size={11} /> {task.dueTime}</span>
                      <span><Users size={11} /> {task.category}</span>
                    </div>
                    {task.reason && (
                      <div className="task-reason">
                        <Brain size={11} />
                        <span><strong>AI Reason:</strong> {task.reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="tasks-footer">
            <Brain size={13} />
            <span>Learned micro-routines continuously calibrated via feedback loop.</span>
          </div>
        </div>

        {/* Right: Sidebar panels */}
        <div className="dashboard-right">
          {/* Instant Memory Capture */}
          <div className="card-elevated memory-capture">
            <div className="section-header" style={{ marginBottom: 10 }}>
              <span className="section-title" style={{ fontSize: 13 }}>Instant Memory Capture</span>
              <span className="badge badge-brand" style={{ fontSize: 10 }}>NLP Active</span>
            </div>
            <textarea
              className="capture-input"
              placeholder="Talk to ReMind AI or type a natural reminder... (e.g. 'Remind me to follow up with Clara tomorrow at 3pm')"
              rows={3}
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={handleKeyDown}
            />

            {/* Live NLP Parsed Chip Indicator */}
            {parsedMemory.hasParsed && captureText.trim() && (
              <div 
                style={{
                  background: 'rgba(99, 102, 241, 0.08)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  marginBottom: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  animation: 'fadeIn 0.2s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Auto-Detected:
                    </span>
                    {parsedMemory.dateLabel && (
                      <span className="badge badge-brand" style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={11} /> {parsedMemory.dateLabel}
                      </span>
                    )}
                    {parsedMemory.timeStr && (
                      <span className="badge badge-brand" style={{ fontSize: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {parsedMemory.timeStr}
                      </span>
                    )}
                  </div>
                </div>

                {parsedMemory.cleanTitle && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Task:</span>
                    <strong style={{ color: 'var(--text-primary)' }}>"{parsedMemory.cleanTitle}"</strong>
                  </div>
                )}
              </div>
            )}

            {/* Quick 1-Click NLP Presets */}
            {!captureText && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {[
                  'Follow up with Clara tomorrow at 3pm',
                  'Team review on Friday at 11am',
                  'Call client tonight at 7:30pm',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setCaptureText(sample)}
                    style={{
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: '3px 9px',
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--text-primary)';
                      e.currentTarget.style.borderColor = 'var(--border-default)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)';
                      e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    }}
                  >
                    + {sample}
                  </button>
                ))}
              </div>
            )}

            {captureFeedback && (
              <div style={{ fontSize: 11, color: captureFeedback.includes('✅') ? '#10B981' : (captureFeedback.includes('🎙️') ? 'var(--brand-primary)' : '#EF4444'), marginTop: 4, marginBottom: 8 }}>
                {captureFeedback}
              </div>
            )}

            <div className="capture-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className={`capture-tool-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleVoiceRecording}
                  title={isListening ? 'Stop listening' : 'Speak reminder (Voice to text)'}
                  style={{
                    background: isListening ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-hover)',
                    borderColor: isListening ? '#EF4444' : 'var(--border-subtle)',
                    color: isListening ? '#EF4444' : 'var(--text-secondary)',
                    transition: 'all 0.2s',
                  }}
                >
                  {isListening ? <MicOff size={14} className="animate-pulse" /> : <Mic size={14} />}
                </button>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {isListening ? 'Listening...' : 'Ctrl+↵ to schedule'}
                </span>
              </div>

              <button 
                className="btn btn-primary" 
                style={{ fontSize: 12, padding: '7px 14px' }}
                onClick={handleAutoSchedule}
                disabled={isScheduling || !captureText.trim()}
              >
                <Zap size={13} />
                {isScheduling ? 'Scheduling...' : 'Auto-Schedule'}
              </button>
            </div>
          </div>

          {/* Learned Routines */}
          <div className="card-elevated">
            <div className="section-header" style={{ marginBottom: 14 }}>
              <span className="section-title" style={{ fontSize: 13 }}>Upcoming Learned Routines</span>
            </div>
            <div className="routines-list">
              {upcomingRoutines.map((r, i) => (
                <div key={i} className="routine-item">
                  <div className="routine-dot-line">
                    <div className="routine-dot" style={{ background: r.prob > 85 ? 'var(--brand-primary)' : 'var(--risk-medium)' }} />
                    {i < upcomingRoutines.length - 1 && <div className="routine-line" />}
                  </div>
                  <div className="routine-body">
                    <div className="routine-top">
                      <span className="routine-time">{r.time} — {r.label}</span>
                      <span className="routine-prob" style={{ color: r.prob > 85 ? 'var(--brand-primary-light)' : 'var(--risk-medium)' }}>
                        {r.prob}% Prob.
                      </span>
                    </div>
                    {r.sources && (
                      <div className="routine-sources">
                        {r.sources.map(s => <span key={s} className="tag">{s}</span>)}
                      </div>
                    )}
                    {(r.shift || r.note) && (
                      <p className="routine-note">{r.shift || r.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Reminders */}
          <div className="card-elevated">
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title" style={{ fontSize: 13 }}>Upcoming Reminders</span>
            </div>
            <div className="reminders-list">
              {reminders.map((r, i) => (
                <div key={i} className="reminder-item">
                  <div className="reminder-icon">{r.icon}</div>
                  <div className="reminder-body">
                    <span className="reminder-label">{r.label}</span>
                    <span className="reminder-at">{r.at}</span>
                  </div>
                  <div className="reminder-right">
                    <span className={`tag tag-${r.tagClass}`}>{r.tag}</span>
                    <span className="reminder-time-label">{r.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Retention graph */}
          <div className="card-elevated">
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title" style={{ fontSize: 13 }}>Weekly Retention</span>
              <span className="label">RETENTION SCORE</span>
            </div>
            <div className="retention-chart">
              {weekDays.map((d, i) => (
                <div key={i} className="bar-col">
                  <div className="bar-wrap">
                    <div
                      className="bar-fill completed"
                      style={{ height: `${[65, 80, 72, 55, 30, 0, 0][i]}%` }}
                    />
                    <div
                      className="bar-fill slip"
                      style={{ height: `${[5, 10, 8, 25, 15, 0, 0][i]}%`, marginTop: 2 }}
                    />
                  </div>
                  <span className="bar-label" style={{ color: d === 'T*' ? 'var(--text-brand)' : 'var(--text-muted)' }}>{d}</span>
                </div>
              ))}
            </div>
            <div className="chart-legend">
              <span><span className="legend-dot" style={{ background: 'var(--brand-primary)' }} />Completed on time</span>
              <span><span className="legend-dot" style={{ background: 'rgba(239,68,68,0.4)' }} />Predicted slip risk</span>
            </div>
          </div>
        </div>
      </div>

      {/* At-Risk Tasks Table */}
      <div className="at-risk-section animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
        <div className="section-header">
          <div>
            <h2 className="section-title">At-Risk Tasks & Slippage Predictions</h2>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Tasks statistically prone to omission based on contextual friction.</p>
          </div>
        </div>

        <div className="risk-table">
          <div className="risk-table-header">
            <span>TASK NAME</span>
            <span>DUE TIME</span>
            <span>PRIORITY</span>
            <span>RISK LEVEL</span>
            <span>REASON FOR RISK</span>
          </div>
          {[
            {
              name: 'Submit Q3 Sprint Retrospective',
              due: 'Today, 11:30 AM',
              priority: 'High',
              risk: 'High Risk',
              riskClass: 'high',
              reason: 'Historically missed when 3+ back-to-back meetings occur',
              dot: 'danger',
            },
            {
              name: 'Renew Cloudflare SSL Certification',
              due: 'Tomorrow, 9:00 AM',
              priority: 'Urgent',
              risk: 'High Risk',
              riskClass: 'high',
              reason: 'Last updated 11 months ago, no checklist initiated',
              dot: 'warning',
            },
            {
              name: 'Send weekly 1-on-1 feedback to Design Lead',
              due: 'Friday, 4:00 PM',
              priority: 'Medium',
              risk: 'Medium Risk',
              riskClass: 'medium',
              reason: 'Routine drift (+35m slippage recorded 2 consecutive weeks)',
              dot: 'medium',
            },
          ].map((row, i) => (
            <div key={i} className="risk-table-row">
              <div className="risk-task-name">
                <span className={`status-dot ${row.dot === 'danger' ? 'danger' : row.dot === 'medium' ? 'warning' : 'warning'}`} />
                {row.name}
              </div>
              <span className="risk-due">{row.due}</span>
              <span className={`badge badge-${row.priority === 'High' ? 'high' : row.priority === 'Urgent' ? 'high' : 'medium'}`}>{row.priority}</span>
              <span className={`badge badge-${row.riskClass}`}>{row.risk}</span>
              <span className="risk-reason">{row.reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="dashboard-footer">
        <span>ReMind AI Platform v2.4.0</span>
        <span className="status-dot active" style={{ margin: '0 8px' }} />
        <span>Proactive Engine: Nominal</span>
      </div>
    </div>
  );
}
