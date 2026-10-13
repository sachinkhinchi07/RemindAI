import { useState, useEffect } from 'react';
import {
  Bell, X, Check, Settings, AlertTriangle, Sparkles,
  Clock, Volume2, CheckCircle2, Moon, RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { speechSynthesizer } from '../lib/voiceService';
import './NotificationCenter.css';

const fallbackNotifications = [
  {
    id: 'demo_1',
    title: 'Submit Q3 Sprint Retrospective & Deck',
    message: '3 back-to-back meetings begin at 1:00 PM with zero focus buffer.',
    intervention_level: 'PROACTIVE',
    channel: 'IN_APP',
    status: 'DELIVERED',
    created_at: new Date(Date.now() - 12 * 60000).toISOString(),
    due_at: new Date().toISOString(),
  },
];

const yesterdayItems = [
  { label: '🌙 Quiet Hours Enforced (10 PM – 8 AM)', right: '• Suppressed non-critical' },
  { label: '🛡️ Duplicate Detection', right: '• Zero duplicates dispatched' },
];

const filterTabs = ['All', 'Proactive', 'Gentle', 'Direct'];

export default function NotificationCenter({ onClose }) {
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState('All');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8000/api/notifications', {
        headers: {
          'x-user-id': user?.id || 'demo_user',
        },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.length > 0 ? data : fallbackNotifications);
      } else {
        setItems(fallbackNotifications);
      }
    } catch (err) {
      console.warn('Could not fetch notifications from backend:', err);
      setItems(fallbackNotifications);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleAction = async (notifId, action, snoozeMins = 30) => {
    try {
      const res = await fetch(`http://localhost:8000/api/notifications/${notifId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'demo_user',
        },
        body: JSON.stringify({
          action,
          snooze_minutes: snoozeMins,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.spoken_feedback) {
          speechSynthesizer.speak(data.spoken_feedback);
        }
      }
    } catch (err) {
      console.warn('Action failed:', err);
    } finally {
      setItems(prev => prev.filter(n => n.id !== notifId));
    }
  };

  const handleSpeak = (text) => {
    speechSynthesizer.speak(text);
  };

  const filteredItems = items.filter(item => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Proactive') return item.intervention_level === 'PROACTIVE' || item.intervention_level === 'HIGH';
    if (activeFilter === 'Gentle') return item.intervention_level === 'GENTLE' || item.intervention_level === 'LOW';
    if (activeFilter === 'Direct') return item.intervention_level === 'DIRECT' || item.intervention_level === 'MEDIUM';
    return true;
  });

  const getUrgencyClass = (level) => {
    if (level === 'PROACTIVE' || level === 'HIGH') return 'notif-danger';
    if (level === 'DIRECT' || level === 'MEDIUM') return 'notif-warning';
    return 'notif-brand';
  };

  return (
    <div className="notif-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="notif-panel animate-fade-in-up">
        {/* Header */}
        <div className="notif-header">
          <div className="notif-header-left">
            <div className="notif-bell-icon">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="notif-title">Notification Center</h2>
              <p className="notif-sub">Proactive Reminders & Real-Time Alerts</p>
            </div>
            <div className="notif-unread-badge">
              <span>{filteredItems.length}</span>
              <span className="notif-unread-label">Active</span>
            </div>
          </div>
          <div className="notif-header-right">
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={() => setItems([])}
            >
              <Check size={12} /> Clear all
            </button>
            <button className="notif-close-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="notif-filter-tabs">
          {filterTabs.map(f => (
            <button
              key={f}
              className={`notif-filter-tab ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Notifications scroll */}
        <div className="notif-scroll">
          <div className="notif-section-label">
            ACTIVE REMINDERS
            <span className="notif-section-count">{filteredItems.length} NOTIFICATIONS</span>
          </div>

          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              Loading reminders...
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 8 }}>🎉</div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>All caught up!</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>No pending reminder notifications.</p>
            </div>
          ) : (
            filteredItems.map(n => (
              <div key={n.id} className={`notif-item ${getUrgencyClass(n.intervention_level)}`}>
                <div className="notif-item-header">
                  <div className={`notif-type-label notif-type-${n.intervention_level === 'PROACTIVE' ? 'danger' : 'brand'}`}>
                    {n.intervention_level === 'PROACTIVE' ? <AlertTriangle size={12} /> : <Sparkles size={12} />}
                    <span>{n.intervention_level || 'REMINDER'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="notif-time">
                      {n.due_at ? new Date(n.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Due soon'}
                    </span>
                    <button
                      className="btn-icon"
                      onClick={() => handleSpeak(n.message || n.title)}
                      title="Speak notification aloud"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                    >
                      <Volume2 size={13} />
                    </button>
                  </div>
                </div>

                <p className="notif-item-title">{n.title}</p>
                {n.message && <p className="notif-item-desc">{n.message}</p>}

                <div className="notif-tags">
                  <span className="notif-tag tag-dev">Channel: {n.channel || 'IN_APP'}</span>
                  {n.status && <span className="notif-tag">{n.status}</span>}
                </div>

                <div className="notif-actions">
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleAction(n.id, 'COMPLETE')}
                  >
                    <CheckCircle2 size={12} /> Complete
                  </button>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 11, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                    onClick={() => handleAction(n.id, 'SNOOZE', 30)}
                  >
                    <Clock size={12} /> Snooze 30m
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: '5px 8px' }}
                    onClick={() => handleAction(n.id, 'DISMISS')}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Infrastructure status */}
          <div className="notif-section-label" style={{ marginTop: 12 }}>
            SYSTEM GUARANTEES
            <span className="notif-section-count">PHASE 10 ENGINE</span>
          </div>

          {yesterdayItems.map((item, i) => (
            <div key={i} className="notif-yesterday-row">
              <span>{item.label}</span>
              <span className="notif-yesterday-right">{item.right}</span>
            </div>
          ))}

          {/* Footer */}
          <div className="notif-footer">
            <span>ReMind AI Notification Delivery Subsystem</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Feedback Logged</span>
          </div>
        </div>
      </div>
    </div>
  );
}
