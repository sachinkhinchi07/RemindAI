import { useState, useEffect } from 'react';
import {
  Bell, Clock, Check, X, AlertTriangle, RefreshCw,
  Zap, ChevronDown, Settings, Wifi, Smartphone,
  Monitor, MessageSquare, Filter, ToggleRight,
  ArrowRight, Moon, Shield, AlertCircle, Send,
  RotateCcw, Search, Loader, Activity
} from 'lucide-react';
import { useReminders } from '../hooks/useReminders';
import { useSettings } from '../hooks/useProfile';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './RemindersV2.css';


const recallItems = [
  {
    id: 1,
    chips: ['AI Proactive Recall', 'Desktop Banner', 'Slack Direct'],
    time: 'Today, 11:15 AM',
    timeNote: '15m',
    timeClass: 'urgent',
    taskName: 'Submit Q3 Sprint Retrospective & Deck',
    taskTag: 'Core Roadmap',
    status: 'Scheduled',
    statusClass: 'scheduled',
    desc: 'Pre-calculated cognitive window: Alex normally requires 25m focus to finish retrospective syntheses without meeting distraction.',
    actions: [
      { label: '⏰ Snooze', cls: 'btn-ghost' },
      { label: '🔁 Reschedule', cls: 'btn-ghost' },
      { label: 'Mark ✓', cls: 'btn-success', primary: true },
    ],
    type: 'ai',
  },
  {
    id: 2,
    chips: ['Deadline Alert', 'Browser Push'],
    time: 'Today, 2:15 PM',
    timeNote: 'Deferred by user',
    timeClass: 'warning',
    taskName: 'Renew Cloudflare SSL Wildcard Certification',
    taskTag: 'Infra & DevOps',
    status: 'Snoozed +30m',
    statusClass: 'snoozed',
    desc: 'Renewal token generated. Domain DNS records will expire in 48 hours via Terraform.',
    actions: [
      { label: '⚡ Wake Now', cls: 'btn-ghost' },
      { label: '🔁 Reschedule', cls: 'btn-ghost' },
      { label: 'Mark ✓', cls: 'btn-success', primary: true },
    ],
    type: 'deadline',
  },
  {
    id: 3,
    chips: ['Routine Buffer', 'Mobile Push'],
    time: 'Today, 1:00 PM',
    timeNote: '(after sprint)',
    timeClass: 'normal',
    taskName: '10-min Post-Lunch Cognitive Reset Walk',
    taskTag: 'Health Habit',
    status: 'Queued',
    statusClass: 'queued',
    desc: 'Recommended by ReMind AI based on consecutive 4 hours of screen glare and upcoming design review.',
    actions: [
      { label: '⏰ Snooze +15m', cls: 'btn-ghost' },
      { label: '🔁 Reschedule', cls: 'btn-ghost' },
      { label: 'Mark ✓', cls: 'btn-success', primary: true },
    ],
    type: 'routine',
  },
  {
    id: 4,
    chips: ['! Contextual Squeeze', 'Slack & Email'],
    time: 'Missed (Was 9:00 AM)',
    timeNote: 'Missed Today',
    timeClass: 'missed',
    taskName: 'Client Architecture Deliverable Sign-off',
    taskTag: 'Critical Milestones',
    status: 'Missed',
    statusClass: 'missed',
    desc: 'Delivery window was missed during scheduled calendar focus mode. External stakeholders pending approval.',
    actions: [
      { label: '📬 Instant Resend', cls: 'btn-danger' },
      { label: 'Push to 4:00 PM', cls: 'btn-ghost' },
      { label: 'Mark Done ✓', cls: 'btn-secondary', primary: true },
    ],
    type: 'missed',
  },
  {
    id: 5,
    chips: ['✅ Delivered', 'Slack Direct'],
    time: 'Sent at 8:30 AM',
    timeNote: '(Acknowledged)',
    timeClass: 'done',
    taskName: 'Synchronize Staging Branch with Main Pipeline',
    taskTag: 'Complete',
    status: 'Complete',
    statusClass: 'complete',
    desc: 'Triggered on-time. Alex marked completed via Slack interactive button at 8:42 AM.',
    actions: [],
    type: 'done',
  },
];

const deliveryChannels = [
  { id: 'banner', icon: Monitor, label: 'In-App Banner', sub: 'Persistent docked floating prompt', checked: true },
  { id: 'desktop', icon: Monitor, label: 'Desktop System Banner', sub: 'macOS & Windows native toast', checked: true },
  { id: 'slack', icon: MessageSquare, label: 'Slack Direct Message', sub: 'Instant actionable buttons @ReMindBot', checked: true },
  { id: 'mobile', icon: Smartphone, label: 'Mobile Push Notification', sub: 'iOS / Android companion app', checked: false },
];

const filterTabs = ['All Reminders', 'Scheduled 7', 'Snoozed 3', 'Delivered 12', 'Dismissed 4', 'Missed 1'];

const bufferTimes = ['15m', '30m', '45m', 'Smart'];

export default function RemindersV2() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reminders: dbReminders, loading: remLoading, snoozeReminder, markDelivered, dismissReminder, refetch } = useReminders();
  const { settings, saveSettings } = useSettings();

  const [items, setItems] = useState(recallItems);
  const [activeTab, setActiveTab] = useState('All Reminders');
  const [channels, setChannels] = useState({ banner: true, desktop: true, slack: true, mobile: false });
  const [quietHours, setQuietHours] = useState(true);
  const [smartThrottle, setSmartThrottle] = useState(true);
  const [bufferTime, setBufferTime] = useState('45m');
  const [prefSaved, setPrefSaved] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null); // { id, title }
  const [snoozeTarget, setSnoozeTarget] = useState(null); // { id, title }
  const [customToast, setCustomToast] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [permMessage, setPermMessage] = useState(null);
  const [behaviorSummary, setBehaviorSummary] = useState(null);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setPermMessage('Notifications are not supported by this browser.');
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setPermissionStatus(res);
      if (res === 'granted') {
        setPermMessage('System Notifications Allowed! Native banners enabled.');
        try {
          new Notification('ReMind AI Active', {
            body: 'Desktop System Banners successfully authorized!',
            icon: '/favicon.ico',
          });
        } catch (_) {}
      } else if (res === 'denied') {
        setPermMessage('Notifications denied. You can re-enable them in browser site settings.');
      }
      setTimeout(() => setPermMessage(null), 4000);
    } catch (e) {
      console.warn('Notification permission error:', e);
    }
  };

  const handleSavePref = async () => {
    await saveSettings({ channels, quietHours, smartThrottle, bufferTime });
    setPrefSaved(true);
    setTimeout(() => setPrefSaved(false), 2000);
  };

  useEffect(() => {
    async function loadFeedbackSummary() {
      try {
        const res = await fetch('http://localhost:8000/api/feedback/summary', {
          headers: { 'x-user-id': user?.id || 'demo_user' },
        });
        if (res.ok) {
          const data = await res.json();
          setBehaviorSummary(data);
        }
      } catch (err) {
        console.warn('Could not load behavioral summary:', err);
      }
    }
    loadFeedbackSummary();
  }, [user]);

  const showToast = (text, type = 'success') => {
    setCustomToast({ text, type });
    setTimeout(() => setCustomToast(null), 3500);
  };

  // Sync DB reminders into state if available
  useEffect(() => {
    if (dbReminders && dbReminders.length > 0) {
      const mapped = dbReminders.map(r => ({
        id: r.id,
        chips: r.delivery_channels || ['AI Proactive Recall'],
        time: new Date(r.remind_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeNote: r.status,
        timeClass: r.status === 'snoozed' ? 'warning' : 'normal',
        taskName: r.title,
        taskTag: 'Reminder',
        status: r.status === 'snoozed' ? 'Snoozed +30m' : r.status === 'delivered' ? 'Complete' : 'Scheduled',
        statusClass: r.status === 'snoozed' ? 'snoozed' : r.status === 'delivered' ? 'complete' : 'scheduled',
        desc: r.description || 'Proactive recall cue generated for focus retention.',
        type: r.status === 'delivered' ? 'done' : r.status === 'snoozed' ? 'deadline' : 'ai',
      }));
      setItems(mapped);
    }
  }, [dbReminders]);

  // Handle Mark Done / Complete
  const handleMarkItemDone = async (id) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const isComplete = item.status === 'Complete';
        return {
          ...item,
          status: isComplete ? 'Scheduled' : 'Complete',
          statusClass: isComplete ? 'scheduled' : 'complete',
          type: isComplete ? 'ai' : 'done',
          timeClass: isComplete ? 'normal' : 'done',
        };
      }
      return item;
    }));

    if (typeof id === 'string') {
      try { await markDelivered(id); } catch (_) {}
    }
    showToast('Reminder marked complete! Cognitive slip risk neutralized to 0%.');
  };

  // Handle Snooze
  const handleApplySnooze = async (id, minutes, label) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status: `Snoozed +${minutes}m`,
          statusClass: 'snoozed',
          timeClass: 'warning',
          timeNote: `Deferred +${minutes}m`,
        };
      }
      return item;
    }));

    if (typeof id === 'string') {
      try { await snoozeReminder(id, minutes); } catch (_) {}
    }

    setSnoozeTarget(null);
    showToast(`Reminder snoozed for ${minutes} minutes (${label}).`);
  };

  // Handle Reschedule
  const handleApplyReschedule = (id, newTime) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          time: newTime,
          timeNote: 'Rescheduled',
          status: 'Scheduled',
          statusClass: 'scheduled',
          timeClass: 'normal',
        };
      }
      return item;
    }));

    setRescheduleTarget(null);
    showToast(`Reminder successfully rescheduled to ${newTime}.`);
  };

  // Handle Wake Now
  const handleWakeNow = (id) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status: 'Active Now',
          statusClass: 'scheduled',
          time: 'Active Now',
          timeClass: 'urgent',
          timeNote: 'Forced recall',
        };
      }
      return item;
    }));
    showToast('Reminder activated immediately. Desktop banner prompt fired!');
  };

  // Handle Instant Resend
  const handleInstantResend = (id) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          status: 'Resent',
          statusClass: 'scheduled',
          time: 'Just now',
          timeClass: 'urgent',
          timeNote: 'Re-dispatched',
        };
      }
      return item;
    }));
    showToast('Urgent reminder re-dispatched via Slack Direct and In-App Banner!');
  };

  // Handle Dismiss (X)
  const handleDismiss = async (id) => {
    setItems(prev => prev.filter(item => item.id !== id));
    if (typeof id === 'string') {
      try { await dismissReminder(id); } catch (_) {}
    }
    showToast('Reminder dismissed from active cue queue.');
  };

  // Filter items based on activeTab
  const filteredItems = items.filter(item => {
    if (activeTab === 'All Reminders') return true;
    if (activeTab.startsWith('Scheduled')) return item.status.includes('Scheduled') || item.status === 'Queued' || item.status === 'Active Now';
    if (activeTab.startsWith('Snoozed')) return item.status.includes('Snoozed');
    if (activeTab.startsWith('Delivered')) return item.status === 'Complete';
    if (activeTab.startsWith('Missed')) return item.status === 'Missed';
    if (activeTab.startsWith('Dismissed')) return false;
    return true;
  });

  const toggleChannel = (id) => {
    const updated = { ...channels, [id]: !channels[id] };
    setChannels(updated);
    saveSettings({ channels: updated });
  };

  return (
    <div className="rem-v2-page animate-fade-in-up">
      {/* Header */}
      <div className="rem-v2-header">
        <div>
          <h1 className="rem-v2-title">Reminders & Notification Schedules</h1>
          <p className="rem-v2-sub">Proactive cognitive recall delivery, smart snooze management, and delivery preferences.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => navigate('/settings')}><Settings size={13} /> View Settings</button>
          <button className="btn btn-secondary" onClick={() => refetch && refetch()}><RefreshCw size={13} /> Sync Channels</button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="rem-v2-stats">
        {[
          {
            label: 'Scheduled Reminders',
            value: behaviorSummary ? behaviorSummary.reminders_scheduled : 7,
            note: behaviorSummary ? `${behaviorSummary.reminders_delivered} delivered` : 'Active delivery',
            noteClass: 'brand', icon: Clock, iconColor: '#818CF8', border: 'border-brand',
          },
          {
            label: 'Snoozed by User',
            value: behaviorSummary ? behaviorSummary.reminders_snoozed : 3,
            note: behaviorSummary ? 'Observed user postponements' : 'In cognitive buffer',
            noteClass: 'warning', icon: Bell, iconColor: '#F59E0B', badge: 'Behavioral Signal',
          },
          {
            label: 'Completed After Reminder',
            value: behaviorSummary ? behaviorSummary.tasks_completed_after_reminder : 4,
            note: behaviorSummary ? `${behaviorSummary.tasks_completed} total completed` : 'Verified completion',
            noteClass: 'success', icon: Check, iconColor: '#10B981', badge: 'Observed Action',
          },
          {
            label: 'Data Sufficiency',
            value: behaviorSummary ? behaviorSummary.data_sufficiency : 'LIMITED',
            note: behaviorSummary ? behaviorSummary.sufficiency_explanation : 'Collecting interaction evidence',
            noteClass: behaviorSummary?.data_sufficiency === 'SUFFICIENT' ? 'success' : 'brand',
            icon: Activity, iconColor: '#EC4899', border: 'border-brand',
          },
        ].map((s, i) => (
          <div key={i} className={`rem-v2-stat ${s.border === 'border-brand' ? 'rem-stat-brand' : s.border === 'border-danger' ? 'rem-stat-danger' : ''}`}>
            <div className="rem-v2-stat-top">
              <span className="rem-v2-stat-label">{s.label}</span>
              <div className="rem-v2-stat-icon" style={{ background: `${s.iconColor}18`, color: s.iconColor }}>
                <s.icon size={16} />
              </div>
            </div>
            <div className="rem-v2-stat-value" style={{ fontSize: typeof s.value === 'string' && s.value.length > 5 ? 18 : 26 }}>{s.value}</div>
            {s.badge && <div className="badge badge-medium" style={{ width: 'fit-content', fontSize: 9, marginBottom: 4 }}>{s.badge}</div>}
            <div className={`rem-v2-stat-note note-${s.noteClass}`}>{s.note}</div>
          </div>
        ))}
      </div>

      {/* Phase 11 Behavioral Evidence Banner */}
      {behaviorSummary && behaviorSummary.descriptive_insights.length > 0 && (
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <Activity size={18} color="var(--brand-primary)" />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-brand)' }}>
              Behavioral Learning Foundation (Phase 11):
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
              {behaviorSummary.descriptive_insights.join(' • ')}
            </span>
          </div>
          <span className="badge badge-brand" style={{ fontSize: 10 }}>
            Sufficiency: {behaviorSummary.data_sufficiency}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="rem-v2-tabs-row">
        <div className="rem-v2-tabs">
          {filterTabs.map(t => (
            <button
              key={t}
              className={`rem-v2-tab ${activeTab === t ? 'active' : t.includes('Missed') ? 'tab-missed' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t}
              {t.includes('Missed') && <span className="status-dot danger" style={{ width: 6, height: 6, marginLeft: 4 }} />}
              {t.includes('Scheduled') && <span className="tab-active-dot" />}
            </button>
          ))}
          <span className="tab-smart-label">
            <span className="status-dot active" style={{ width: 6, height: 6 }} />
            Smart Delivery Active
          </span>
        </div>
      </div>

      {/* Main 2-col: Queue + Delivery settings */}
      <div className="rem-v2-main">
        {/* Left: Recall Cue Queue */}
        <div className="rem-v2-queue">
          <div className="section-header" style={{ marginBottom: 16 }}>
            <h2 className="section-title">Recall Cue Queue</h2>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sorted by impending execution window</span>
          </div>

          {/* Live Action Toast */}
          {customToast && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 8,
                background: customToast.type === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--brand-glow)',
                border: `1px solid ${customToast.type === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--border-brand)'}`,
                color: customToast.type === 'error' ? '#ef4444' : 'var(--text-brand)',
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 14,
              }}
            >
              <Check size={14} />
              <span>{customToast.text}</span>
            </div>
          )}

          <div className="cue-list">
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                No reminders found in this category.
              </div>
            ) : (
              filteredItems.map(item => (
                <div key={item.id} className={`cue-item cue-${item.type}`}>
                  <div className="cue-header">
                    <div className="cue-chips">
                      {item.chips.map((c, i) => (
                        <span key={i} className={`cue-chip ${c.includes('!') ? 'chip-danger' : c.includes('✅') ? 'chip-success' : ''}`}>{c}</span>
                      ))}
                    </div>
                    <div className="cue-time-info">
                      <span className={`cue-time cue-time-${item.timeClass}`}>{item.time}</span>
                      {item.timeNote && (
                        <span className={`cue-time-note ${item.timeClass === 'urgent' ? 'time-note-urgent' : ''}`}>{item.timeNote}</span>
                      )}
                    </div>
                  </div>

                  <div className="cue-body">
                    <div className="cue-title-row">
                      <h3
                        className="cue-task-name"
                        style={{
                          textDecoration: item.status === 'Complete' ? 'line-through' : 'none',
                          color: item.status === 'Complete' ? 'var(--text-muted)' : undefined,
                        }}
                      >
                        {item.taskName}
                      </h3>
                      {item.taskTag && (
                        <div className="cue-task-tag">{item.taskTag}</div>
                      )}
                      <span className={`cue-status cue-status-${item.statusClass}`}>{item.status}</span>
                    </div>
                    <p className="cue-desc">{item.desc}</p>
                  </div>

                  <div className="cue-actions">
                    {/* Dynamic Action Buttons */}
                    {item.type !== 'done' && (
                      <>
                        {item.type === 'missed' ? (
                          <>
                            <button
                              className="btn btn-danger"
                              style={{ fontSize: 11, padding: '5px 10px' }}
                              onClick={() => handleInstantResend(item.id)}
                            >
                              <Send size={11} style={{ marginRight: 4 }} />
                              Instant Resend
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '5px 10px' }}
                              onClick={() => setRescheduleTarget({ id: item.id, title: item.taskName })}
                            >
                              Push to 4:00 PM
                            </button>
                          </>
                        ) : item.status.includes('Snoozed') ? (
                          <>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '5px 10px', color: '#f59e0b' }}
                              onClick={() => handleWakeNow(item.id)}
                            >
                              <Zap size={11} style={{ marginRight: 4 }} />
                              Wake Now
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '5px 10px' }}
                              onClick={() => setRescheduleTarget({ id: item.id, title: item.taskName })}
                            >
                              <RotateCcw size={11} style={{ marginRight: 4 }} />
                              Reschedule
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '5px 10px' }}
                              onClick={() => setSnoozeTarget({ id: item.id, title: item.taskName })}
                            >
                              <Clock size={11} style={{ marginRight: 4 }} />
                              Snooze
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: '5px 10px' }}
                              onClick={() => setRescheduleTarget({ id: item.id, title: item.taskName })}
                            >
                              <RotateCcw size={11} style={{ marginRight: 4 }} />
                              Reschedule
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {/* Mark Done Toggle Button */}
                    <button
                      className={`btn ${item.status === 'Complete' ? 'btn-secondary' : 'btn-success'}`}
                      style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => handleMarkItemDone(item.id)}
                    >
                      <Check size={11} style={{ marginRight: 4 }} />
                      {item.status === 'Complete' ? 'Completed ✓' : 'Mark Done ✓'}
                    </button>

                    {/* Dismiss Button */}
                    <button
                      className="btn btn-ghost cue-dismiss"
                      onClick={() => handleDismiss(item.id)}
                      title="Dismiss reminder"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>

        {/* Right: Delivery settings */}
        <div className="rem-v2-delivery">
          <div className="card-elevated delivery-card">
            <div className="label" style={{ marginBottom: 6 }}>Delivery</div>
            <div className="badge badge-brand" style={{ marginBottom: 14, width: 'fit-content', fontSize: 10 }}>
              ReMind Reminder Decision Engine (Active)
            </div>

            {/* Buffer */}
            <div className="delivery-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Proactive Recall Buffer</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
                Default lead time calculated before high-stakes focus sessions or meetings.
              </p>
              <div className="buffer-btns">
                {bufferTimes.map(t => (
                  <button
                    key={t}
                    className={`buffer-btn ${bufferTime === t ? 'active' : ''}`}
                    onClick={() => setBufferTime(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* Active Delivery Channels */}
            <div className="delivery-section">
              <div className="label" style={{ marginBottom: 10 }}>Active Delivery Channels</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                Distribute prompts across synchronized active surfaces.
              </p>
              <div className="channels-list">
                {deliveryChannels.map(ch => (
                  <label key={ch.id} className="channel-item">
                    <div className="channel-icon">
                      <ch.icon size={14} />
                    </div>
                    <div className="channel-body">
                      <span className="channel-label">{ch.label}</span>
                      <span className="channel-sub">{ch.sub}</span>
                    </div>
                    <button
                      className={`toggle-btn ${channels[ch.id] ? 'on' : ''}`}
                      onClick={() => toggleChannel(ch.id)}
                      style={{ width: 36, height: 20, flexShrink: 0 }}
                    >
                      <div className="toggle-knob" style={{ width: 14, height: 14 }} />
                    </button>
                  </label>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* Cognitive Guardrails */}
            <div className="delivery-section">
              <div className="label" style={{ marginBottom: 12 }}>Cognitive Guardrails</div>
              {[
                {
                  id: 'quiet',
                  label: 'Quiet Hours', time: '10pm – 8:00 AM',
                  sub: 'Defer non-vital cognitive nudges until morning cycle',
                  on: quietHours, set: setQuietHours,
                },
                {
                  id: 'throttle',
                  label: 'Smart Frequency Throttling', time: '',
                  sub: 'Suppress cues during detected calendar deep-work focus sessions',
                  on: smartThrottle, set: setSmartThrottle,
                },
              ].map(g => (
                <div key={g.id} className="guardrail-item">
                  <div className="guardrail-top">
                    <div className="guardrail-header">
                      <span className="guardrail-label">
                        <Moon size={12} /> {g.label}
                        {g.time && <span className="guardrail-time">{g.time}</span>}
                      </span>
                    </div>
                    <button
                      className={`toggle-btn ${g.on ? 'on' : ''}`}
                      onClick={() => g.set(!g.on)}
                      style={{ width: 36, height: 20, flexShrink: 0 }}
                    >
                      <div className="toggle-knob" style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                  <p className="guardrail-sub">{g.sub}</p>
                  {g.id === 'quiet' && (
                    <div className="guardrail-note">
                      <Check size={11} /> Allow Critical Slip alerts during quiet hours
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Browser permissions notice */}
            <div
              className="browser-notice"
              style={{
                borderColor: permissionStatus === 'granted' ? 'rgba(16,185,129,0.3)' : undefined,
                background: permissionStatus === 'granted' ? 'rgba(16,185,129,0.08)' : undefined,
              }}
            >
              {permissionStatus === 'granted' ? (
                <Check size={13} color="var(--risk-low)" />
              ) : (
                <AlertCircle size={13} color="var(--risk-medium)" />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <p
                    style={{
                      fontSize: 11,
                      color: permissionStatus === 'granted' ? 'var(--risk-low)' : 'var(--risk-medium)',
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {permissionStatus === 'granted' ? 'Native Notifications Authorized' : 'Browser Permissions Notice'}
                  </p>
                  <span
                    className={`badge ${permissionStatus === 'granted' ? 'badge-low' : 'badge-medium'}`}
                    style={{ fontSize: 9 }}
                  >
                    {permissionStatus.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4, margin: '2px 0 0' }}>
                  {permissionStatus === 'granted'
                    ? 'Windows & macOS system toasts are active. Reminders can pop up even when the browser is in the background.'
                    : 'System notifications are currently restricted in this browser profile. Click below to verify or grant foreground authorization.'}
                </p>
                {permMessage && (
                  <p style={{ fontSize: 10, color: 'var(--text-brand)', fontWeight: 600, marginTop: 4 }}>
                    {permMessage}
                  </p>
                )}
                {permissionStatus !== 'granted' && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 10, marginTop: 6, padding: '3px 8px', color: 'var(--risk-medium)', cursor: 'pointer' }}
                    onClick={requestNotificationPermission}
                  >
                    Request System Prompt...
                  </button>
                )}
                {permissionStatus === 'granted' && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 10, marginTop: 6, padding: '3px 8px', color: 'var(--risk-low)', cursor: 'pointer' }}
                    onClick={() => {
                      try {
                        new Notification('ReMind AI Test Alert', {
                          body: 'System banners are connected and firing cleanly!',
                          icon: '/favicon.ico',
                        });
                      } catch (_) {}
                    }}
                  >
                    Send Test Desktop Toast
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
                onClick={handleSavePref}
              >
                {prefSaved ? 'Saved ✓' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer sync bar */}
      <div className="rem-v2-footer">
        <span className="status-dot active" />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>ReMind Neural Sync active</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Continuous background monitor is synchronizing with Google Calendar, Linear, and macOS events.</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next algorithmic audit: 12:00 PM</span>
        </div>
      </div>

      {/* Snooze Options Modal */}
      {snoozeTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setSnoozeTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 14, width: 360, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>Snooze Reminder</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{snoozeTarget.title}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { min: 10, label: '10 mins' },
                { min: 15, label: '15 mins' },
                { min: 30, label: '30 mins (Standard)' },
                { min: 60, label: '1 hour' },
                { min: 120, label: '2 hours' },
                { min: 240, label: 'Later this afternoon' },
              ].map(s => (
                <button
                  key={s.min}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '8px 10px', justifyContent: 'center' }}
                  onClick={() => handleApplySnooze(snoozeTarget.id, s.min, s.label)}
                >
                  +{s.label}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, justifyContent: 'center' }} onClick={() => setSnoozeTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reschedule Options Modal */}
      {rescheduleTarget && (
        <div
          className="modal-backdrop"
          onClick={() => setRescheduleTarget(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 14, width: 360, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>Reschedule Delivery Slot</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>{rescheduleTarget.title}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                'Today, 3:30 PM',
                'Today, 4:00 PM',
                'Today, 5:15 PM',
                'Tomorrow, 9:00 AM',
                'Tomorrow, 11:30 AM',
                'Next Focus Window',
              ].map(slot => (
                <button
                  key={slot}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '8px 8px', justifyContent: 'center' }}
                  onClick={() => handleApplyReschedule(rescheduleTarget.id, slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, justifyContent: 'center' }} onClick={() => setRescheduleTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
