import { useState, useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import {
  Brain, LayoutDashboard, CheckSquare, Sparkles,
  TrendingUp, Bell, Calendar, Settings, ChevronRight,
  Shield, Globe, LogOut
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ProfileModal from '../ProfileModal';
import './Sidebar.css';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'My Tasks' },
  { to: '/ai-assistant', icon: Sparkles, label: 'AI Assistant', dot: true },
  { to: '/predictions', icon: TrendingUp, label: 'Predictions' },
  { to: '/reminders', icon: Bell, label: 'Reminders' },
  { to: '/calendar', icon: Calendar, label: 'Calendar & Routines' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [customAvatar, setCustomAvatar] = useState(() => localStorage.getItem('remind_ai_avatar') || '');

  useEffect(() => {
    const syncAvatar = () => {
      setCustomAvatar(localStorage.getItem('remind_ai_avatar') || '');
    };
    window.addEventListener('storage', syncAvatar);
    return () => window.removeEventListener('storage', syncAvatar);
  }, []);

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Brain size={18} strokeWidth={2.5} />
        </div>
        <div className="logo-text">
          <span className="logo-name">ReMind AI</span>
          <span className="logo-tagline">Cognitive Engine v2.4</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {navItems.map(({ to, icon: Icon, label, badge, badgeType, dot }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `sidebar-item ${isActive ? 'active' : ''}`
            }
          >
            <div className="sidebar-item-icon">
              <Icon size={16} strokeWidth={2} />
            </div>
            <span className="sidebar-item-label">{label}</span>
            {badge && (
              <span className={`sidebar-badge ${badgeType === 'danger' ? 'danger' : ''}`}>
                {badge}
              </span>
            )}
            {dot && <span className="sidebar-dot" />}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="sidebar-bottom">
        {/* Cognitive Shield */}
        <div className="cognitive-shield">
          <div className="shield-header">
            <span className="shield-label"><Shield size={11} /> Cognitive Shield</span>
            <span className="shield-pct">88% Calm</span>
          </div>
          <div className="progress-bar" style={{ height: 5 }}>
            <div className="progress-fill" style={{ width: '88%', background: 'linear-gradient(90deg, #4F46E5, #10B981)' }} />
          </div>
        </div>
        {/* Cognitive sync status */}
        <div className="sync-status">
          <span className="status-dot active" />
          <div className="sync-info">
            <span className="sync-label">Database Connected</span>
            <span className="sync-pct" style={{ color: '#10B981' }}>Live</span>
          </div>
        </div>

        {/* User profile */}
        <div
          className="sidebar-user"
          onClick={() => setShowProfile(true)}
          style={{ cursor: 'pointer' }}
          title="Click to view credentials & session"
          role="button"
        >
          {customAvatar ? (
            <img
              src={customAvatar}
              alt={displayName}
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
                border: '1.5px solid var(--brand-primary, #6366f1)',
              }}
            />
          ) : (
            <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{initials}</div>
          )}
          <div className="user-info">
            <span className="user-name" title={displayName}>{displayName}</span>
            <span className="user-role" title={user?.email} style={{ fontSize: 10 }}>{user?.email || 'Logged in'}</span>
          </div>
          <button 
            className="user-more" 
            aria-label="Sign Out" 
            title="Sign Out"
            onClick={(e) => {
              e.stopPropagation();
              signOut();
            }}
            style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Profile & Credentials Modal */}
      {showProfile && (
        <ProfileModal
          isOpen={true}
          onClose={() => setShowProfile(false)}
        />
      )}
    </aside>
  );
}

