import { useState, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, Calendar,
  AlertTriangle, Clock, Users, Zap, ExternalLink, Check,
  X, Edit3, RotateCcw, MapPin, Link2
} from 'lucide-react';
import './CalendarRoutines.css';

const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const filterTabs = ['All (14)', 'Tasks (4)', 'Appointments / Meetings (5)', 'Deadlines (2)', 'Reminders (3)'];

// Helper to get start of Monday for any given date
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

// Calculate week number of year
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

export default function CalendarRoutines() {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [activeFilter, setActiveFilter] = useState('All (14)');
  const [viewMode, setViewMode] = useState('Week');
  const [isDone, setIsDone] = useState(false);
  const [bufferTime, setBufferTime] = useState('15 mins');
  const [scheduledTime, setScheduledTime] = useState('11:30 AM');
  const [actionNotice, setActionNotice] = useState(null);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [showBufferModal, setShowBufferModal] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Selected event for right inspector
  const [selectedEvent, setSelectedEvent] = useState({
    title: 'Submit Q3 Retrospective & Deck',
    time: '11:30 AM',
    risk: 94,
    type: 'high-risk',
    relatedTask: 'Core Roadmap Sprint Retro',
  });

  // Keep live time updated
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Compute 5 weekdays (Mon - Fri) for the active currentDate
  const monday = getMonday(currentDate);
  const today = new Date();

  const weekDays = [0, 1, 2, 3, 4].map(offset => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return {
      day: dayNames[offset],
      date: d.getDate(),
      fullDate: d,
      isToday,
    };
  });

  // Calculate dynamic week number and quarter info
  const weekNum = getWeekNumber(currentDate);
  const quarter = Math.floor(currentDate.getMonth() / 3) + 1;
  const isViewingCurrentDate =
    currentDate.toDateString() === today.toDateString();

  // Navigation handlers
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'Month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (viewMode === 'Day') {
      newDate.setDate(newDate.getDate() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'Month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (viewMode === 'Day') {
      newDate.setDate(newDate.getDate() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const handleGoToday = () => {
    setCurrentDate(new Date());
  };

  // Base schedule templates mapped to day index (0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri)
  const getDayEvents = (dayOffset, dayNum) => {
    const scheduleByWeekday = {
      0: [
        { time: '09:00', label: 'Routine Check', sub: 'Morning Setup & Pack', type: 'routine' },
        { time: '10:00', label: 'Sprint Planning', sub: '10:00 - 11:00 AM', type: 'meeting' },
      ],
      1: [
        { time: '11:00', label: 'Customer Interview', sub: 'Feedback Session', type: 'meeting' },
      ],
      2: [
        { time: '10:00', label: 'Team Standup', sub: 'Google Meet', type: 'meeting' },
        { time: '10:00', label: 'Design Sync', sub: 'Figma Review', type: 'meeting' },
        { time: '13:00', label: 'Engineering All-Hands', sub: 'Sprint Demo', type: 'meeting' },
      ],
      3: [
        { time: '09:00', label: '8:45 AM Routine', sub: 'Laptop & Equipment Check', type: 'routine' },
        { time: '10:00', label: 'Client Roadmap Sync', sub: '10:00 - 10:45 AM', type: 'meeting' },
        { time: '11:00', label: selectedEvent.title, sub: 'Buffer', type: 'high-risk', risk: selectedEvent.risk },
        { time: '13:00', label: 'Executive Sync', sub: '1:00 PM - 1:45 PM', type: 'meeting' },
      ],
      4: [
        { time: '10:00', label: 'Weekly 1:1', sub: 'Manager Check-in', type: 'meeting' },
        { time: '12:00', label: 'Lunch Break', sub: 'Focus Recovery', type: 'break' },
      ],
    };
    return scheduleByWeekday[dayOffset] || [];
  };

  const handleMarkDone = () => {
    setIsDone(prev => !prev);
    setActionNotice(!isDone ? 'Task marked complete! Cognitive slip risk resolved to 0%.' : 'Task re-opened.');
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleReschedule = (newTime) => {
    setScheduledTime(newTime);
    setSelectedEvent(prev => ({ ...prev, time: newTime, risk: 28 }));
    setShowRescheduleModal(false);
    setActionNotice(`Successfully rescheduled to ${newTime}. Radar slip risk reduced to 28%.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleUpdateBuffer = (newBuffer) => {
    setBufferTime(newBuffer);
    setShowBufferModal(false);
    setActionNotice(`Proactive recall buffer updated to ${newBuffer}.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  // Format header label based on active date
  const formattedDateLabel = currentDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="calendar-page animate-fade-in-up">
      {/* Page header */}
      <div className="cal-page-header">
        <div>
          <h1 className="cal-title">Calendar & Routines</h1>
          <p className="cal-sub">Chronological schedule alignment, recurring habits, and cognitive routine tracking.</p>
        </div>
      </div>

      {/* Calendar controls */}
      <div className="cal-controls">
        <div className="cal-nav">
          <button className="cal-nav-btn" onClick={handlePrev} aria-label="Previous" title="Previous period">
            <ChevronLeft size={15} />
          </button>
          <button
            onClick={handleGoToday}
            className="cal-date-label"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            title="Click to jump to Today"
          >
            <Calendar size={14} color="var(--brand-primary, #6366f1)" />
            <span>
              {isViewingCurrentDate ? `Today (${formattedDateLabel})` : formattedDateLabel}
            </span>
          </button>
          <button className="cal-nav-btn" onClick={handleNext} aria-label="Next" title="Next period">
            <ChevronRight size={15} />
          </button>
          <span className="cal-week-info">
            W{weekNum} • Q{quarter} Strategic Sprint
          </span>
        </div>
        <div className="cal-view-btns">
          {['Month', 'Week', 'Day'].map(v => (
            <button
              key={v}
              className={`view-btn ${viewMode === v ? 'active' : ''}`}
              onClick={() => setViewMode(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="cal-filter-tabs">
        {filterTabs.map(f => (
          <button
            key={f}
            className={`filter-tab ${activeFilter === f ? 'active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Calendar + Detail panel */}
      <div className="cal-main">
        {/* Calendar grid */}
        <div className="cal-grid-wrapper">
          {viewMode === 'Week' && (
            <div className="cal-grid">
              {/* Header row */}
              <div className="cal-time-col" />
              {weekDays.map(d => (
                <div key={d.date} className={`cal-day-header ${d.isToday ? 'today' : ''}`}>
                  <span className="cal-day-name">{d.day}</span>
                  <span className={`cal-day-num ${d.isToday ? 'today-num' : ''}`}>{d.date}</span>
                </div>
              ))}

              {/* Current time indicator row */}
              <div className="cal-time-line-row">
                <div className="cal-time-col" />
                {weekDays.map((d, i) => (
                  <div key={i} className="cal-time-line-cell">
                    {d.isToday && (
                      <div className="current-time-line">
                        <span className="current-time-label">{currentTimeStr || '11:15 AM'}</span>
                        <div className="current-time-dot" />
                        <div className="current-time-bar" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Hour rows */}
              {hours.map((hour) => (
                <div key={`row-${hour}`} style={{ display: 'contents' }}>
                  <div className="cal-time-label">{hour}</div>
                  {weekDays.map((d, dayIndex) => {
                    const dayEvents = getDayEvents(dayIndex, d.date);
                    return (
                      <div key={`${d.date}-${hour}`} className={`cal-cell ${d.isToday ? 'today-col' : ''}`}>
                        {dayEvents
                          .filter(e => e.time === hour)
                          .map((event, ei) => (
                            <div
                              key={ei}
                              className={`cal-event cal-event-${event.type}`}
                              onClick={() => {
                                setSelectedEvent({
                                  title: event.label,
                                  time: `${hour} - ${event.sub || 'Scheduled'}`,
                                  risk: event.risk || (event.type === 'routine' ? 12 : 35),
                                  type: event.type,
                                  relatedTask: event.label,
                                });
                              }}
                              style={{ cursor: 'pointer' }}
                              title="Click to view details in Inspector"
                            >
                              {event.risk && (
                                <div className="event-risk-badge">{event.risk}% SLIP RISK</div>
                              )}
                              <div className="event-name">{event.label}</div>
                              {event.sub && <div className="event-sub">{event.sub}</div>}
                              {event.type === 'high-risk' && (
                                <div className="event-trigger">
                                  🔔 Trigger set (Slack)
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {viewMode === 'Day' && (
            <div className="cal-day-view" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    {isViewingCurrentDate ? 'Today • Active Routine Tracking' : 'Selected Focus Day'}
                  </p>
                </div>
                <button
                  className="badge badge-brand"
                  style={{ fontSize: '11px', border: 'none', cursor: 'pointer' }}
                  onClick={handleGoToday}
                >
                  {isViewingCurrentDate ? 'Active Focus Day' : 'Return to Today'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                {hours.map(hour => {
                  // Use weekday index (0..4) or default to middle day
                  const activeWeekdayIdx = Math.max(0, Math.min(4, currentDate.getDay() - 1));
                  const eventsThisHour = getDayEvents(activeWeekdayIdx, currentDate.getDate()).filter(e => e.time === hour);
                  return (
                    <div key={hour} style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '12px', minHeight: '48px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', paddingTop: '6px' }}>{hour}</span>
                      <div style={{ borderLeft: '2px solid var(--border-subtle)', paddingLeft: '12px', minHeight: '40px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {eventsThisHour.length === 0 ? (
                          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', paddingTop: '6px' }}>Free cognitive window</span>
                        ) : (
                          eventsThisHour.map((event, idx) => (
                            <div
                              key={idx}
                              className={`cal-event cal-event-${event.type}`}
                              onClick={() => {
                                setSelectedEvent({
                                  title: event.label,
                                  time: `${hour} - ${event.sub || 'Scheduled'}`,
                                  risk: event.risk || 20,
                                  type: event.type,
                                  relatedTask: event.label,
                                });
                              }}
                              style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-default)', cursor: 'pointer' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{event.label}</strong>
                                {event.risk && <span className="badge badge-high" style={{ fontSize: '10px' }}>{event.risk}% SLIP RISK</span>}
                              </div>
                              {event.sub && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{event.sub}</p>}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {viewMode === 'Month' && (
            <div className="cal-month-view" style={{ padding: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '8px' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <span key={d} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                {Array.from(
                  { length: new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() },
                  (_, i) => i + 1
                ).map(dayNum => {
                  const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
                  const isCurrentDay =
                    today.getDate() === dayNum &&
                    today.getMonth() === currentDate.getMonth() &&
                    today.getFullYear() === currentDate.getFullYear();
                  const weekdayOffset = Math.max(0, Math.min(4, checkDate.getDay() - 1));
                  const dayEvents = getDayEvents(weekdayOffset, dayNum);

                  return (
                    <div
                      key={dayNum}
                      style={{
                        minHeight: '80px',
                        background: isCurrentDay ? 'var(--bg-elevated)' : 'var(--bg-base)',
                        border: isCurrentDay ? '2px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        const target = new Date(currentDate);
                        target.setDate(dayNum);
                        setCurrentDate(target);
                        setViewMode('Day');
                      }}
                      title={`Click to open Day view for ${currentDate.toLocaleString('en-US', { month: 'short' })} ${dayNum}`}
                    >
                      <span style={{ fontSize: '11px', fontWeight: isCurrentDay ? 800 : 600, color: isCurrentDay ? 'var(--text-brand)' : 'var(--text-secondary)' }}>
                        {dayNum} {isCurrentDay && '• Today'}
                      </span>
                      {dayEvents.slice(0, 2).map((ev, ei) => (
                        <div
                          key={ei}
                          style={{
                            fontSize: '9px',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            background: ev.type === 'high-risk' ? 'var(--risk-high-bg)' : 'var(--brand-glow)',
                            color: ev.type === 'high-risk' ? 'var(--risk-high)' : 'var(--text-brand)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ev.label}
                        </div>
                      ))}
                      {dayEvents.length > 2 && (
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>+{dayEvents.length - 2} more</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="cal-detail-panel">
          <div className="detail-inspector-badge">
            <span className="status-dot active" />
            Active Inspector Focus
          </div>

          <div className="detail-section-label">SCHEDULED FOCUS & DEADLINE</div>
          <h2 className="detail-title" style={{ textDecoration: isDone ? 'line-through' : 'none', color: isDone ? 'var(--text-muted)' : undefined }}>
            {selectedEvent.title}
          </h2>
          <div className="detail-datetime">
            <Clock size={13} />
            <span>
              {currentDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • {scheduledTime}
            </span>
          </div>
          <div className="detail-time-remaining">
            {isDone ? 'Completed ✓' : `(in ~${bufferTime})`}
          </div>

          {/* Risk level */}
          <div
            className="detail-risk-box"
            style={{
              borderColor: isDone ? 'rgba(16,185,129,0.3)' : undefined,
              background: isDone ? 'rgba(16,185,129,0.06)' : undefined,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isDone ? (
                  <Check size={14} color="var(--risk-low)" />
                ) : (
                  <AlertTriangle size={14} color="var(--risk-high)" />
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: isDone ? 'var(--risk-low)' : 'var(--risk-high)' }}>
                  {isDone ? 'Slip Risk Neutralized' : 'Slip Risk Level'}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: isDone ? 'var(--risk-low)' : 'var(--risk-high)' }}>
                {isDone ? '0% — Safe' : `${selectedEvent.risk}% — Critical`}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
              {isDone
                ? 'Task completed ahead of cognitive threshold. No risk of delayed delivery.'
                : 'High probability of overdue delivery due to back-to-back meeting collision. No prep interval remaining.'}
            </p>
          </div>

          {actionNotice && (
            <div style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--brand-glow)', border: '1px solid var(--border-brand)', color: 'var(--text-brand)', fontSize: 11, fontWeight: 600 }}>
              {actionNotice}
            </div>
          )}

          {/* Meta */}
          <div className="detail-meta">
            {[
              { label: 'Related Task', value: selectedEvent.relatedTask || selectedEvent.title, link: true },
              { label: 'Proactive Alert', value: `${bufferTime} via Slack & Banner` },
              { label: 'Cognitive State', value: isDone ? '🟢 Focused / Completed' : '🟠 Fragmented Attention' },
            ].map((m, i) => (
              <div key={i} className="detail-meta-row">
                <span className="detail-meta-label">{m.label}</span>
                <span className={`detail-meta-value ${m.link ? 'link-value' : ''}`}>{m.value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="detail-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowRescheduleModal(true)}
              title="Reschedule task to a different time"
            >
              <RotateCcw size={12} />
              Reschedule
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowBufferModal(true)}
              title="Change proactive recall buffer lead time"
            >
              <Edit3 size={12} />
              Edit Buffer
            </button>
            <button
              className={`btn ${isDone ? 'btn-secondary' : 'btn-success'}`}
              onClick={handleMarkDone}
              title={isDone ? 'Mark as pending' : 'Mark task done'}
            >
              <Check size={12} />
              {isDone ? 'Done ✓' : 'Mark Done'}
            </button>
          </div>
        </div>
      </div>

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowRescheduleModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 14, width: 360, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Reschedule Deadline</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Select a new slot to avoid back-to-back meeting collisions:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {['12:15 PM', '01:30 PM', '03:00 PM', 'Tomorrow 10:00 AM'].map(t => (
                <button
                  key={t}
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '8px 10px', justifyContent: 'center' }}
                  onClick={() => handleReschedule(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, justifyContent: 'center' }} onClick={() => setShowRescheduleModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit Buffer Modal */}
      {showBufferModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowBufferModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 14, width: 360, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>Edit Proactive Recall Buffer</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Select how early ReMind AI should notify you before deadline:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {['15 mins', '30 mins', '45 mins', '75 mins'].map(b => (
                <button
                  key={b}
                  className={`btn ${bufferTime === b ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: 11, padding: '8px 4px', justifyContent: 'center' }}
                  onClick={() => handleUpdateBuffer(b)}
                >
                  {b}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11, justifyContent: 'center' }} onClick={() => setShowBufferModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
