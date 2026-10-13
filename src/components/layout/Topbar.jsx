import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, Plus, Bell, Command, Brain, HelpCircle, Volume2, X, CheckCircle2, Clock
} from 'lucide-react';
import NotificationCenter from '../NotificationCenter';
import CreateTaskModal from '../CreateTaskModal';
import ProfileModal from '../ProfileModal';
import { playAlarmChime, speakAlarmUtterance } from '../TaskAlarmManager';
import { createTask, getTasks } from '../../lib/db';
import { useAuth } from '../../context/AuthContext';
import './Topbar.css';

const pageTitles = {
  '/dashboard': { title: 'AI Memory Assistant', sub: 'Proactive cognitive recall & task defense' },
  '/tasks': { title: 'My Tasks', sub: 'Task Intelligence & Management' },
  '/create-task': { title: 'Create New Task', sub: 'AI routine & memory extraction' },
  '/ai-assistant': { title: 'AI Memory Assistant', sub: 'Proactive cognitive recall & task defense' },
  '/predictions': { title: 'Predictions & Forgetfulness Defense', sub: 'Predictive cognitive slip modeling & proactive risk mitigation' },
  '/reminders': { title: 'Reminders & Predictive Focus', sub: 'Cognitive Workspace' },
  '/calendar': { title: 'Calendar & Routines', sub: 'Chronological schedule & cognitive routine tracking' },
  '/settings': { title: 'Settings', sub: 'Configure your memory assistant' },
};

export default function Topbar() {
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const searchInputRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const page = pageTitles[location.pathname] || pageTitles['/dashboard'];

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setSearchFocused(false);
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch all tasks for instant live memory search
  useEffect(() => {
    async function fetchSearchPool() {
      try {
        const { data } = await getTasks();
        if (data && Array.isArray(data)) {
          setAllTasks(data);
        }
      } catch (err) {
        console.warn('Could not load task pool for search:', err);
      }
    }
    fetchSearchPool();
  }, [user, location.pathname]);

  // Live filter as user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase().trim();
    const matches = allTasks.filter(t => 
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.risk_reason && t.risk_reason.toLowerCase().includes(q)) ||
      (Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(q)))
    ).slice(0, 5);

    // Also include standard app navigational routes if query matches
    const navShortcuts = [
      { id: 'nav-dashboard', title: 'Dashboard', sub: 'Overview & cognitive slip radar', route: '/dashboard' },
      { id: 'nav-tasks', title: 'My Tasks', sub: 'Task intelligence & management', route: '/tasks' },
      { id: 'nav-reminders', title: 'Reminders & Schedules', sub: 'Proactive cues & quiet hours', route: '/reminders' },
      { id: 'nav-calendar', title: 'Calendar & Routines', sub: 'Schedule & cognitive buffers', route: '/calendar' },
      { id: 'nav-assistant', title: 'AI Assistant', sub: 'Cognitive defense co-pilot', route: '/ai-assistant' },
      { id: 'nav-settings', title: 'Settings', sub: 'Preferences & integrations', route: '/settings' },
    ].filter(n => n.title.toLowerCase().includes(q) || n.sub.toLowerCase().includes(q));

    setSearchResults({ tasks: matches, nav: navShortcuts });
  }, [searchQuery, allTasks]);

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleQuickSave = async (data) => {
    let safeDueDate = null;
    if (data.due) {
      const parsed = new Date(data.due);
      if (!isNaN(parsed.getTime())) safeDueDate = parsed.toISOString();
    }

    await createTask({
      title: data.title || 'Quick Scheduled Task',
      tags: ['#quick-add'],
      due_at: safeDueDate,
      priority: 'high',
      status: 'pending',
      risk_score: 30,
      risk_label: 'Low Slip Risk (30%)',
      risk_reason: 'Captured via Quick Add button',
    });

    setShowQuickAdd(false);
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <div className="topbar-page-info">
            <div className="topbar-icon">
              <Brain size={16} strokeWidth={2} />
            </div>
            <div>
              <h1 className="topbar-title">{page.title}</h1>
              <p className="topbar-sub">{page.sub}</p>
            </div>
          </div>
        </div>

        <div className="topbar-center" style={{ position: 'relative' }}>
          <div className={`search-bar ${searchFocused ? 'focused' : ''}`}>
            <Search size={14} className="search-icon" />
            <input
              ref={searchInputRef}
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, routines, pages... (Cmd+K)"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                // Short delay to allow clicking on results
                setTimeout(() => setSearchFocused(false), 220);
              }}
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
              >
                <X size={12} />
              </button>
            ) : (
              <div className="search-shortcut">
                <Command size={10} />
                <span>K</span>
              </div>
            )}
          </div>

          {/* Live Search Results Dropdown */}
          {searchFocused && searchQuery.trim() && (
            <div
              className="search-results-dropdown"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                padding: '8px',
                boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
                zIndex: 1000,
                maxHeight: 340,
                overflowY: 'auto',
              }}
            >
              {searchResults.nav?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', padding: '4px 8px', display: 'block' }}>
                    PAGES & VIEWS
                  </span>
                  {searchResults.nav.map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        navigate(n.route);
                        setSearchFocused(false);
                        setSearchQuery('');
                      }}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        transition: 'background 0.15s ease',
                      }}
                      className="search-item-hover"
                    >
                      <div>
                        <strong style={{ color: 'var(--text-primary)', display: 'block' }}>{n.title}</strong>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{n.sub}</span>
                      </div>
                      <span className="badge badge-brand" style={{ fontSize: 9 }}>Go to page</span>
                    </div>
                  ))}
                </div>
              )}

              {searchResults.tasks?.length > 0 && (
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', padding: '4px 8px', display: 'block' }}>
                    MATCHING TASKS & DEADLINES
                  </span>
                  {searchResults.tasks.map(t => (
                    <div
                      key={t.id}
                      onClick={() => {
                        navigate('/tasks');
                        setSearchFocused(false);
                        setSearchQuery('');
                      }}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        transition: 'background 0.15s ease',
                      }}
                      className="search-item-hover"
                    >
                      <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                        <strong style={{ color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.title}
                        </strong>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          Priority: {t.priority || 'Medium'} • Status: {t.status || 'Pending'}
                        </span>
                      </div>
                      {t.risk_score && (
                        <span
                          className={`badge ${t.risk_score >= 60 ? 'badge-high' : t.risk_score >= 30 ? 'badge-medium' : 'badge-low'}`}
                          style={{ fontSize: 9, flexShrink: 0 }}
                        >
                          {t.risk_score}% Risk
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {(!searchResults.tasks || searchResults.tasks.length === 0) &&
               (!searchResults.nav || searchResults.nav.length === 0) && (
                <div style={{ padding: '14px 10px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
                  No matching tasks or memories found for "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>

        <div className="topbar-right">
          <button
            id="quick-add-btn"
            className="btn btn-primary quick-add"
            onClick={() => setShowQuickAdd(true)}
          >
            <Plus size={15} strokeWidth={2.5} />
            Quick Add
          </button>
          <button
            className="topbar-icon-btn"
            id="notifications-btn"
            aria-label="Notifications"
            onClick={() => setShowNotifs(true)}
          >
            <Bell size={16} />
            <span className="notif-badge">3</span>
          </button>
          <button
            className="topbar-icon-btn"
            id="test-alarm-btn"
            aria-label="Test Loud Alarm"
            title="Test Loud Alarm Sound 🔊"
            onClick={() => {
              playAlarmChime();
              speakAlarmUtterance('Test project task');
            }}
          >
            <Volume2 size={16} color="var(--risk-high, #ef4444)" />
          </button>
          <button className="topbar-icon-btn" aria-label="Help">
            <HelpCircle size={16} />
          </button>
          <div
            className="topbar-avatar"
            onClick={() => setShowProfile(true)}
            style={{ cursor: 'pointer' }}
            title="View Profile Credentials"
            role="button"
          >
            <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials}</div>
          </div>
        </div>
      </header>

      {/* Notification Center overlay */}
      {showNotifs && (
        <NotificationCenter onClose={() => setShowNotifs(false)} />
      )}

      {/* Create Task / Quick Add overlay */}
      {showQuickAdd && (
        <CreateTaskModal
          isOpen={true}
          onClose={() => setShowQuickAdd(false)}
          onSave={handleQuickSave}
        />
      )}

      {/* Profile & Credentials Modal */}
      {showProfile && (
        <ProfileModal
          isOpen={true}
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}

