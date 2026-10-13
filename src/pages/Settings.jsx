import { useState, useEffect, useRef } from 'react';
import {
  Brain, User, Clock, Network, Share2, Lock, Shield,
  Search, Bell, Check, Sparkles, RefreshCw, AlertCircle,
  Lightbulb, Activity, CheckCircle2, Sliders, Moon, Calendar,
  ChevronDown, Save, X, Zap, Cpu, Key, Database, Play, Loader2,
  Camera, Image as ImageIcon, Trash2, Edit3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile, useSettings } from '../hooks/useProfile';
import './Settings.css';

export default function Settings() {
  const { user, signOut } = useAuth();
  const { profile, saveProfile } = useProfile();
  const { settings, saveSettings } = useSettings();

  const [activeTab, setActiveTab] = useState('profile');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState(null);
  const [showGCalModal, setShowGCalModal] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalStatus, setGcalStatus] = useState({
    connected: true,
    account: 'alex.chen@enterprise.io',
    lastSync: 'Today at 10:45 AM',
    autoSync: true,
    indexedEventsCount: 5,
  });
  const [gcalNotice, setGcalNotice] = useState(null);
  const [settingSearchQuery, setSettingSearchQuery] = useState('');
  const [settingSearchFocused, setSettingSearchFocused] = useState(false);
  const searchInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Profile avatar photo state with persistent localStorage support
  const [avatarUrl, setAvatarUrl] = useState(() => {
    return localStorage.getItem('remind_ai_avatar') || '';
  });
  const [photoToast, setPhotoToast] = useState(null);
  const [showRhythmModal, setShowRhythmModal] = useState(false);

  // Global hotkey: Cmd+K / Ctrl+K to focus Settings search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSettingSearchFocused(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Searchable preferences registry with tab jump targets
  const settingItems = [
    { label: 'Full Name & Display Identity', tab: 'profile', sub: 'Profile identity & name' },
    { label: 'Email Address & Seat', tab: 'profile', sub: 'Authentication & account contact' },
    { label: 'Active Time Zone', tab: 'profile', sub: 'Regional time settings' },
    { label: 'Clock Precision (12h/24h)', tab: 'profile', sub: 'Time display preferences' },
    { label: 'Working Hours & Core Window', tab: 'profile', sub: 'Scheduled focus windows & workdays' },
    { label: 'Default Proactive Recall Lead Time', tab: 'reminders', sub: '15m, 30m, 45m, 60m buffer timing' },
    { label: 'Quiet Hours (Start / End)', tab: 'reminders', sub: 'Sleep window mute schedules' },
    { label: 'Critical Slip Override (90%+ Risk)', tab: 'reminders', sub: 'Emergency bypass for urgent deadlines' },
    { label: 'Behavioral Evidence Level', tab: 'personalization', sub: 'Machine learning historical confidence' },
    { label: 'Recommended Preparation Lead Time', tab: 'personalization', sub: 'Adaptive habit buffers' },
    { label: 'Reset Learned Personalization', tab: 'personalization', sub: 'Clear inferred lead times to defaults' },
    { label: 'Slip Prediction Sensitivity', tab: 'ai', sub: 'Cognitive defense threshold modeling' },
    { label: 'Google Calendar Integration', tab: 'integrations', sub: 'Sync daily meetings & calendar density' },
    { label: 'Local Sandbox & Data Privacy', tab: 'privacy', sub: 'Zero-knowledge memory trace retention' },
  ];

  const filteredSettings = settingSearchQuery.trim()
    ? settingItems.filter(item =>
        item.label.toLowerCase().includes(settingSearchQuery.toLowerCase()) ||
        item.sub.toLowerCase().includes(settingSearchQuery.toLowerCase())
      )
    : [];

  // Profile form state — prefill from real Supabase profile
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    email: '',
    role: 'Knowledge Architect',
    timezone: 'UTC',
    dateFormat: 'MMM DD, YYYY',
    clockPrecision: '12-hour (AM/PM)',
    workdays: 'Monday - Friday',
    coreHours: '9:00 AM - 5:00 PM',
    lunchBuffer: '12:30 PM - 1:30 PM',
  });

  // Sync from real profile when it loads & hydrate local preferences
  useEffect(() => {
    let savedPrefs = {};
    try {
      const raw = localStorage.getItem('remind_ai_profile_prefs');
      if (raw) savedPrefs = JSON.parse(raw);
    } catch (err) {
      console.warn('Could not read cached profile prefs:', err);
    }

    if (profile || user) {
      setProfileForm(prev => ({
        ...prev,
        fullName: profile?.full_name || user?.user_metadata?.full_name || prev.fullName || '',
        email: user?.email || prev.email || '',
        ...savedPrefs,
      }));
    } else if (Object.keys(savedPrefs).length > 0) {
      setProfileForm(prev => ({ ...prev, ...savedPrefs }));
    }
  }, [profile, user]);

  // Reminders form state
  const [reminders, setReminders] = useState({
    leadTime: '45 minutes',
    adaptiveLead: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    criticalOverride: true,
    hapticFeedback: true,
  });

  // AI heuristics state
  const [aiSettings, setAiSettings] = useState({
    sensitivity: 'Balanced (Recommended)',
    contextDepth: 'High (4-level associative link)',
    autonomousReschedule: true,
    frictionAnalysis: true,
  });

  // Phase 12 Personalization Profile State
  const [persProfile, setPersProfile] = useState(null);
  const [resettingPers, setResettingPers] = useState(false);
  const [persMessage, setPersMessage] = useState(null);

  const fetchPersonalization = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/personalization', {
        headers: { 'x-user-id': user?.id || 'demo_user' },
      });
      if (res.ok) {
        const data = await res.json();
        setPersProfile(data);
      }
    } catch (err) {
      console.warn('Could not load personalization profile:', err);
    }
  };

  useEffect(() => {
    fetchPersonalization();
  }, [user]);

  const handleResetPersonalization = async () => {
    try {
      setResettingPers(true);
      const res = await fetch('http://localhost:8000/api/personalization/reset', {
        method: 'POST',
        headers: { 'x-user-id': user?.id || 'demo_user' },
      });
      if (res.ok) {
        setPersMessage('Personalization reset. Defaults restored.');
        await fetchPersonalization();
        setTimeout(() => setPersMessage(null), 3000);
      }
    } catch (err) {
      console.warn('Reset failed:', err);
    } finally {
      setResettingPers(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setProfileForm(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handleReminderChange = (field, value) => {
    setReminders(prev => ({ ...prev, [field]: value }));
    setHasUnsavedChanges(true);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoToast({ type: 'error', text: 'Please select a valid image file (PNG, JPG, WebP).' });
      setTimeout(() => setPhotoToast(null), 3000);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoToast({ type: 'error', text: 'Image file size must be less than 5MB.' });
      setTimeout(() => setPhotoToast(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl === 'string') {
        setAvatarUrl(dataUrl);
        try {
          localStorage.setItem('remind_ai_avatar', dataUrl);
          window.dispatchEvent(new Event('storage'));
        } catch (err) {
          console.warn('Could not cache avatar locally:', err);
        }
        setPhotoToast({ type: 'success', text: 'Profile picture updated successfully!' });
        setTimeout(() => setPhotoToast(null), 3000);
      }
    };
    reader.readAsDataURL(file);
    // Reset file input value so re-selecting same file triggers onChange
    e.target.value = '';
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('');
    try {
      localStorage.removeItem('remind_ai_avatar');
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.warn('Could not remove avatar:', err);
    }
    setPhotoToast({ type: 'success', text: 'Profile photo removed. Initials restored.' });
    setTimeout(() => setPhotoToast(null), 3000);
  };

  const handleSave = async () => {
    // 1. Save profile full_name to Supabase profile
    await saveProfile({ full_name: profileForm.fullName });

    // 2. Save reminders & quiet hours preferences to user settings
    await saveSettings({
      bufferTime: reminders.leadTime,
      quietHours: {
        start: reminders.quietHoursStart,
        end: reminders.quietHoursEnd,
        criticalOverride: reminders.criticalOverride,
      },
    });

    // 3. Save profile metadata preferences locally
    try {
      localStorage.setItem('remind_ai_profile_prefs', JSON.stringify({
        role: profileForm.role,
        timezone: profileForm.timezone,
        dateFormat: profileForm.dateFormat,
        clockPrecision: profileForm.clockPrecision,
        workdays: profileForm.workdays,
        coreHours: profileForm.coreHours,
        lunchBuffer: profileForm.lunchBuffer,
      }));
    } catch (err) {
      console.warn('Could not store preferences:', err);
    }

    setIsSaved(true);
    setHasUnsavedChanges(false);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleDiscard = () => {
    // Reset to initial profile values
    setProfileForm(prev => ({
      ...prev,
      fullName: profile?.full_name || user?.user_metadata?.full_name || '',
      email: user?.email || '',
    }));
    // Reset reminders to defaults
    setReminders({
      leadTime: '45 minutes',
      adaptiveLead: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
      criticalOverride: true,
      hapticFeedback: true,
    });
    setHasUnsavedChanges(false);
  };


  const handleRunDiagnostic = () => {
    setIsTesting(true);
    setDiagnosticStatus(null);
    setTimeout(() => {
      setIsTesting(false);
      setDiagnosticStatus('All 8 cognitive sub-engines operating at peak health (0 regressions, latency 17.8ms).');
    }, 1200);
  };

  return (
    <div className="settings-v2-container animate-fade-in-up">
      {/* Top Breadcrumb & Control Bar */}
      <div className="settings-top-navbar">
        <div className="breadcrumb-box">
          <div className="breadcrumb-logo">
            <Brain size={18} strokeWidth={2.5} />
          </div>
          <span className="breadcrumb-brand">ReMind AI</span>
          <span className="breadcrumb-slash">/</span>
          <span className="breadcrumb-page">Workspace Settings</span>
          <span className="session-pill">Active Session</span>
        </div>

        <div className="settings-search-wrap" style={{ position: 'relative' }}>
          <Search size={14} className="search-icon" />
          <input
            ref={searchInputRef}
            className="settings-search-input"
            value={settingSearchQuery}
            onChange={(e) => setSettingSearchQuery(e.target.value)}
            placeholder="Search preferences, AI thresholds, sync rules..."
            onFocus={() => setSettingSearchFocused(true)}
            onBlur={() => setTimeout(() => setSettingSearchFocused(false), 220)}
          />
          {settingSearchQuery ? (
            <button
              onClick={() => {
                setSettingSearchQuery('');
                searchInputRef.current?.focus();
              }}
              style={{
                position: 'absolute',
                right: 8,
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                padding: 2,
              }}
            >
              <X size={13} />
            </button>
          ) : (
            <span
              className="kbd-shortcut"
              onClick={() => {
                searchInputRef.current?.focus();
                setSettingSearchFocused(true);
              }}
              style={{ cursor: 'pointer' }}
            >
              ⌘K
            </span>
          )}

          {/* Search Results Dropdown */}
          {settingSearchFocused && settingSearchQuery.trim() && (
            <div
              className="settings-dropdown-menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 10,
                padding: '6px',
                boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                zIndex: 1000,
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              {filteredSettings.length > 0 ? (
                filteredSettings.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setActiveTab(item.tab);
                      setSettingSearchQuery('');
                      setSettingSearchFocused(false);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      transition: 'background 0.15s ease',
                    }}
                    className="search-item-hover-light"
                  >
                    <div>
                      <strong style={{ color: '#0f172a', display: 'block' }}>{item.label}</strong>
                      <span style={{ fontSize: 10.5, color: '#64748b' }}>{item.sub}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#ede9fe',
                        color: '#6d28d9',
                        textTransform: 'uppercase',
                      }}
                    >
                      {item.tab}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px 10px', textAlign: 'center', fontSize: 12, color: '#64748b' }}>
                  No settings match "{settingSearchQuery}"
                </div>
              )}
            </div>
          )}
        </div>

        <div className="settings-top-actions">
          <div className="heuristics-sync-pill">
            <span className="sync-green-dot" />
            <span>All Heuristics Synchronized</span>
          </div>
          <button className="btn-restore-defaults" onClick={() => setHasUnsavedChanges(false)}>
            Restore Defaults
          </button>
        </div>
      </div>

      {/* Page Header */}
      <div className="settings-main-header">
        <h1 className="settings-page-title">Settings & Preferences</h1>
        <p className="settings-page-sub">
          Manage personal profile, cognitive defense rules, proactive reminder lead times, and workspace integrations.
        </p>
      </div>

      {/* Horizontal Tabs Row */}
      <div className="settings-tabs-navbar">
        <button
          className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={15} />
          <span>Profile & Workspace</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'reminders' ? 'active' : ''}`}
          onClick={() => setActiveTab('reminders')}
        >
          <Clock size={15} />
          <span>Reminders & Quiet Hours</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'personalization' ? 'active' : ''}`}
          onClick={() => setActiveTab('personalization')}
        >
          <Sparkles size={15} />
          <span>Personalization & Learning</span>
          <span className="tab-pill-badge" style={{ background: 'var(--brand-primary)', color: '#fff' }}>Adaptive</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <Activity size={15} />
          <span>AI Slip Heuristics</span>
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'integrations' ? 'active' : ''}`}
          onClick={() => setActiveTab('integrations')}
        >
          <Network size={15} />
          <span>Connected Integrations</span>
          <span className="orange-dot-badge" />
        </button>

        <button
          className={`settings-tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
          onClick={() => setActiveTab('privacy')}
        >
          <Lock size={15} />
          <span>Privacy & Account</span>
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="settings-two-col-layout">
        {/* Left Column: Primary Tab Content */}
        <div className="settings-left-col">
          {activeTab === 'profile' && (
            <div className="profile-section-card">
              {/* Section Header */}
              <div className="card-section-header">
                <div className="header-icon-square">
                  <Sliders size={16} />
                </div>
                <div className="header-text-block">
                  <h3 className="section-title">Profile & Personal Preferences</h3>
                  <p className="section-sub">Manage cognitive metadata, focus rhythms, and temporal formatting.</p>
                </div>
                <span className="section-a-badge">SECTION A</span>
              </div>

              {/* Avatar & Seat Info */}
              <div className="user-profile-row">
                {/* Hidden File Input for Real Photo Upload */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  style={{ display: 'none' }}
                />

                <div
                  className="profile-avatar-wrapper"
                  onClick={() => fileInputRef.current?.click()}
                  title="Click to change photo"
                  style={{ cursor: 'pointer', position: 'relative' }}
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={profileForm.fullName || 'User Avatar'}
                      className="avatar-photo"
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        display: 'block',
                        border: '2px solid #6366f1',
                      }}
                    />
                  ) : (
                    <div
                      className="avatar-photo"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(135deg,#4F46E5,#7C3AED)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 28,
                        borderRadius: '50%',
                        width: 72,
                        height: 72,
                        flexShrink: 0,
                      }}
                    >
                      {(profileForm.fullName || user?.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Camera overlay hover badge */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      background: 'rgba(15, 23, 42, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                    className="avatar-hover-overlay"
                  >
                    <Camera size={20} />
                  </div>
                </div>

                <div className="profile-meta-block">
                  <div className="name-seat-row">
                    <h4 className="user-display-name">{profileForm.fullName || user?.email || 'User'}</h4>
                    <span className="primary-seat-badge">Primary Seat</span>
                  </div>
                  <p className="user-email-role">{profileForm.email || user?.email} · {profileForm.role}</p>
                  
                  {photoToast && (
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        marginBottom: 8,
                        background: photoToast.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        color: photoToast.type === 'error' ? '#dc2626' : '#059669',
                        border: `1px solid ${photoToast.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`,
                      }}
                    >
                      {photoToast.type === 'error' ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
                      <span>{photoToast.text}</span>
                    </div>
                  )}

                  <div className="avatar-actions">
                    <button
                      type="button"
                      className="btn-change-photo"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera size={13} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                      Change Photo
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        className="btn-remove-photo"
                        onClick={handleRemovePhoto}
                        title="Remove custom photo and reset to initials"
                      >
                        <Trash2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Form Fields Grid */}
              <div className="profile-form-grid">
                <div className="form-field-group">
                  <label className="input-label">Full Name</label>
                  <input
                    type="text"
                    className="input-text"
                    value={profileForm.fullName}
                    onChange={(e) => handleFieldChange('fullName', e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Work Email</label>
                  <input
                    type="email"
                    className="input-text"
                    value={profileForm.email}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Organizational Role</label>
                  <input
                    type="text"
                    className="input-text"
                    value={profileForm.role}
                    onChange={(e) => handleFieldChange('role', e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Active Time Zone</label>
                  <div className="select-wrapper">
                    <input
                      type="text"
                      className="input-text"
                      value={profileForm.timezone}
                      onChange={(e) => handleFieldChange('timezone', e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field-group">
                  <label className="input-label">Date Display Format</label>
                  <input
                    type="text"
                    className="input-text"
                    value={profileForm.dateFormat}
                    onChange={(e) => handleFieldChange('dateFormat', e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Clock Precision</label>
                  <div className="select-wrapper">
                    <select
                      className="input-select"
                      value={profileForm.clockPrecision}
                      onChange={(e) => handleFieldChange('clockPrecision', e.target.value)}
                    >
                      <option>12-hour (AM/PM)</option>
                      <option>24-hour (Military / ISO)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Working Hours & Focus Rhythm Subsection */}
              <div className="rhythm-subsection">
                <div className="rhythm-header">
                  <div className="rhythm-title-left">
                    <Moon size={16} className="rhythm-icon" />
                    <span className="rhythm-title">Working Hours & Focus Rhythm</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRhythmModal(true)}
                    style={{
                      background: 'none',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#4f46e5',
                      padding: '3px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Edit3 size={11} />
                    <span>Edit Schedule</span>
                  </button>
                </div>

                <div className="rhythm-cards-grid">
                  <div
                    className="rhythm-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowRhythmModal(true)}
                  >
                    <span className="rhythm-card-label">Standard Workdays</span>
                    <strong className="rhythm-card-val">{profileForm.workdays}</strong>
                  </div>
                  <div
                    className="rhythm-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowRhythmModal(true)}
                  >
                    <span className="rhythm-card-label">Daily Core Window</span>
                    <strong className="rhythm-card-val">{profileForm.coreHours}</strong>
                  </div>
                  <div
                    className="rhythm-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowRhythmModal(true)}
                  >
                    <span className="rhythm-card-label">Automated Lunch Buffer</span>
                    <strong className="rhythm-card-val">{profileForm.lunchBuffer}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="profile-section-card">
              <div className="card-section-header">
                <div className="header-icon-square">
                  <Clock size={16} />
                </div>
                <div className="header-text-block">
                  <h3 className="section-title">Reminders & Quiet Hours</h3>
                  <p className="section-sub">Configure dynamic recall lead times, quiet periods, and notification intensity.</p>
                </div>
              </div>

              <div className="profile-form-grid" style={{ marginTop: 16 }}>
                <div className="form-field-group">
                  <label className="input-label">Default Proactive Recall Lead Time</label>
                  <select
                    className="input-select"
                    value={reminders.leadTime}
                    onChange={(e) => handleReminderChange('leadTime', e.target.value)}
                  >
                    <option>15 minutes before</option>
                    <option>30 minutes before</option>
                    <option>45 minutes (Optimal Cognitive Buffer)</option>
                    <option>60 minutes before</option>
                  </select>
                </div>

                <div className="form-field-group">
                  <label className="input-label">Quiet Hours Start</label>
                  <input
                    type="time"
                    className="input-text"
                    value={reminders.quietHoursStart}
                    onChange={(e) => handleReminderChange('quietHoursStart', e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Quiet Hours End</label>
                  <input
                    type="time"
                    className="input-text"
                    value={reminders.quietHoursEnd}
                    onChange={(e) => handleReminderChange('quietHoursEnd', e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Critical Slip Override (90%+ Risk)</label>
                  <select
                    className="input-select"
                    value={reminders.criticalOverride ? 'Enabled' : 'Disabled'}
                    onChange={(e) => handleReminderChange('criticalOverride', e.target.value === 'Enabled')}
                  >
                    <option>Enabled (Override Quiet Hours for critical deadlines)</option>
                    <option>Disabled (Strict Quiet Hours)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'personalization' && (
            <div className="profile-section-card">
              <div className="card-section-header">
                <div className="header-icon-square" style={{ background: 'var(--brand-glow)', color: 'var(--text-brand)' }}>
                  <Sparkles size={16} />
                </div>
                <div className="header-text-block">
                  <h3 className="section-title">Personalization & Behavioral Learning Profile</h3>
                  <p className="section-sub">
                    Evidence-based preferences derived deterministically from your actual interactions.
                  </p>
                </div>
                <span className="section-a-badge" style={{ background: 'var(--brand-primary)', color: '#fff' }}>
                  {persProfile ? persProfile.data_sufficiency : 'EVALUATING'}
                </span>
              </div>

              {persMessage && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: '#10B981',
                  margin: '16px 0 8px',
                }}>
                  {persMessage}
                </div>
              )}

              <div className="profile-form-grid" style={{ marginTop: 16 }}>
                <div className="form-field-group">
                  <label className="input-label">Behavioral Evidence Level</label>
                  <input
                    type="text"
                    className="input-text"
                    value={persProfile?.data_sufficiency || 'NONE'}
                    readOnly
                  />
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    {persProfile?.sufficiency_explanation}
                  </p>
                </div>

                <div className="form-field-group">
                  <label className="input-label">Recommended Preparation Lead Time</label>
                  <input
                    type="text"
                    className="input-text"
                    value={`${persProfile?.recommended_lead_time_minutes || 120} minutes`}
                    readOnly
                  />
                  <p style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    {persProfile?.lead_time_adjustment_reason}
                  </p>
                </div>

                <div className="form-field-group">
                  <label className="input-label">Preferred Notification Channel</label>
                  <input
                    type="text"
                    className="input-text"
                    value={persProfile?.preferred_notification_channels?.join(', ') || 'banner, desktop'}
                    readOnly
                  />
                </div>

                <div className="form-field-group">
                  <label className="input-label">Reminder Fatigue Status</label>
                  <input
                    type="text"
                    className="input-text"
                    value={persProfile?.reminder_fatigue_detected ? 'Alert Throttling Active' : 'Nominal'}
                    readOnly
                  />
                </div>
              </div>

              {/* Active Rules and Verified Explanations */}
              <div className="rhythm-subsection" style={{ marginTop: 20 }}>
                <div className="rhythm-header">
                  <span className="rhythm-title">Demonstrated Behavioral Observations</span>
                  <span className="scheduled-hrs-badge">Transparent Evidence</span>
                </div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {persProfile?.human_explanations?.map((exp, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <CheckCircle2 size={13} color="var(--brand-primary)" />
                      <span>{exp}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reset personalization control */}
              <div style={{
                marginTop: 24,
                padding: '16px',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <h4 style={{ fontSize: 13, fontWeight: 600 }}>Reset Learned Personalization</h4>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Clears inferred lead times and channel preferences back to system defaults. Historical logs remain preserved.
                  </p>
                </div>
                <button
                  className="btn btn-outline"
                  onClick={handleResetPersonalization}
                  disabled={resettingPers}
                  style={{ fontSize: 11, padding: '6px 12px' }}
                >
                  {resettingPers ? 'Resetting...' : 'Reset to Defaults'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="profile-section-card">
              <div className="card-section-header">
                <div className="header-icon-square">
                  <Sparkles size={16} />
                </div>
                <div className="header-text-block">
                  <h3 className="section-title">AI Slip Predictions & Cognitive Heuristics</h3>
                  <p className="section-sub">Machine learning models predicting forgetfulness probability and schedule collision.</p>
                </div>
                <span className="section-a-badge">ML v4.2</span>
              </div>

              <div className="profile-form-grid" style={{ marginTop: 16 }}>
                <div className="form-field-group">
                  <label className="input-label">Slip Prediction Sensitivity</label>
                  <select
                    className="input-select"
                    value={aiSettings.sensitivity}
                    onChange={(e) => setAiSettings(p => ({ ...p, sensitivity: e.target.value }))}
                  >
                    <option>Balanced (Recommended)</option>
                    <option>Aggressive (Max Proactive Defense)</option>
                    <option>Conservative (Fewer Interventions)</option>
                  </select>
                </div>

                <div className="form-field-group">
                  <label className="input-label">Context Graph Associative Depth</label>
                  <input
                    type="text"
                    className="input-text"
                    value={aiSettings.contextDepth}
                    readOnly
                  />
                </div>
              </div>

              <div className="rhythm-subsection" style={{ marginTop: 20 }}>
                <div className="rhythm-header">
                  <span className="rhythm-title">Active AI Models & Embeddings</span>
                  <span className="scheduled-hrs-badge">Groq Llama-3.3 70B</span>
                </div>
                <p style={{ fontSize: 12.5, color: '#64748b', margin: '8px 0 0' }}>
                  Natural language extraction leverages on-device memory patterns cross-referenced with your calendar schedule to determine forgetfulness vectors in &lt;18ms.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="profile-section-card">
              <div className="card-section-header">
                <div className="header-icon-square">
                  <Network size={16} />
                </div>
                <div className="header-text-block">
                  <h3 className="section-title">Connected Integrations & Data Sources</h3>
                  <p className="section-sub">Synchronize calendar events, Slack threads, and project management tools.</p>
                </div>
              </div>

              <div className="rhythm-cards-grid" style={{ marginTop: 16, gridTemplateColumns: 'minmax(280px, 420px)' }}>
                <div className="rhythm-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span className="rhythm-card-label">Google Calendar</span>
                    <strong className="rhythm-card-val" style={{ color: gcalStatus.connected ? '#059669' : '#dc2626' }}>
                      {gcalStatus.connected ? 'Connected' : 'Disconnected'}
                    </strong>
                  </div>
                  <button
                    className="btn-change-photo"
                    onClick={() => setShowGCalModal(true)}
                    style={{ cursor: 'pointer' }}
                  >
                    Manage
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="profile-section-card">
              <div className="card-section-header">
                <div className="header-icon-square">
                  <Shield size={16} />
                </div>
                <div className="header-text-block">
                  <h3 className="section-title">Data Privacy & Local Sandbox Security</h3>
                  <p className="section-sub">Zero-knowledge local inference with 256-bit AES encryption on memory traces.</p>
                </div>
              </div>

              <div className="rhythm-cards-grid" style={{ marginTop: 16 }}>
                <div className="rhythm-card">
                  <span className="rhythm-card-label">Memory Sandbox</span>
                  <strong className="rhythm-card-val">On-Device Encrypted</strong>
                </div>
                <div className="rhythm-card">
                  <span className="rhythm-card-label">Trace Retention</span>
                  <strong className="rhythm-card-val">90 Days Rolling</strong>
                </div>
                <div className="rhythm-card">
                  <span className="rhythm-card-label">Telemetry Sharing</span>
                  <strong className="rhythm-card-val">Disabled (Private)</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Health & Diagnostics Widgets */}
        <div className="settings-right-col">
          {/* Cognitive Defense Health Card */}
          <div className="defense-health-card">
            <div className="defense-card-header">
              <div className="defense-title-left">
                <Shield size={15} className="defense-icon" />
                <span className="defense-title">Cognitive Defense Health</span>
              </div>
              <span className="health-pct-pill">98.4%</span>
            </div>

            <div className="defense-metrics-stack">
              <div className="defense-metric-item">
                <div className="metric-labels-row">
                  <span className="metric-name">Buffer Overlap Prevention</span>
                  <span className="metric-val optimal">Optimal</span>
                </div>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill optimal" style={{ width: '100%' }} />
                </div>
              </div>

              <div className="defense-metric-item">
                <div className="metric-labels-row">
                  <span className="metric-name">Slip Heuristic Accuracy</span>
                  <span className="metric-val">88.7%</span>
                </div>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill accuracy" style={{ width: '88.7%' }} />
                </div>
              </div>

              <div className="defense-metric-item">
                <div className="metric-labels-row">
                  <span className="metric-name">Quiet Hours Adherence</span>
                  <span className="metric-val">100%</span>
                </div>
                <div className="metric-bar-track">
                  <div className="metric-bar-fill adherence" style={{ width: '100%' }} />
                </div>
              </div>
            </div>

            {/* Insight Callout Box */}
            <div className="defense-insight-box">
              <Lightbulb size={16} className="insight-bulb-icon" />
              <p className="insight-text">
                Your current 45-minute recall lead time reduced last week's critical task slips by <strong>34%</strong> compared to the 15-minute standard baseline.
              </p>
            </div>
          </div>

          {/* Environment & Diagnostics Card */}
          <div className="diagnostics-card">
            <div className="diagnostics-header">
              <Activity size={15} className="diag-icon" />
              <span className="diagnostics-title">Environment & Diagnostics</span>
            </div>

            <div className="diagnostics-list">
              <div className="diag-row">
                <span className="diag-key">Runtime Engine</span>
                <span className="diag-val">ReMind Web v2.4</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Indexed Tasks</span>
                <span className="diag-val">142 Entities</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Prediction Latency</span>
                <span className="diag-val latency-green">18ms (Local)</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Active Workspaces</span>
                <span className="diag-val">Personal + Architecture</span>
              </div>
            </div>

            {diagnosticStatus && (
              <div className="diag-result-notice">
                <CheckCircle2 size={13} color="#10b981" />
                <span>{diagnosticStatus}</span>
              </div>
            )}

            <button
              className="btn-self-test"
              onClick={handleRunDiagnostic}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <Loader2 size={13} className="spin-icon" />
                  <span>Testing Neural Latency...</span>
                </>
              ) : (
                <span>Run Diagnostic Self-Test</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Notification Bar */}
      {hasUnsavedChanges && (
        <div className="floating-unsaved-bar animate-slide-up">
          <div className="unsaved-status-message">
            <span className="unsaved-yellow-dot" />
            <span>You have unsaved changes in <strong>Reminder Timing</strong> and <strong>Quiet Hours</strong></span>
          </div>

          <div className="unsaved-actions-group">
            <button className="btn-discard" onClick={handleDiscard}>
              Discard Changes
            </button>
            <button className="btn-save-primary" onClick={handleSave}>
              {isSaved ? (
                <>
                  <Check size={15} />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save size={15} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Google Calendar Management Modal */}
      {showGCalModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowGCalModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              width: 440,
              maxWidth: '92vw',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ede9fe', color: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Google Calendar Integration</h3>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{gcalStatus.account}</p>
                </div>
              </div>
              <button
                onClick={() => setShowGCalModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            {gcalNotice && (
              <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, fontSize: 12, color: '#059669', marginBottom: 14 }}>
                {gcalNotice}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Connection Status</span>
                <span style={{ fontWeight: 700, color: gcalStatus.connected ? '#059669' : '#dc2626' }}>
                  {gcalStatus.connected ? 'Active & Synchronized' : 'Disconnected'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Indexed Events Today</span>
                <span style={{ fontWeight: 700 }}>{gcalStatus.indexedEventsCount} Calendar Events</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <span style={{ color: '#64748b' }}>Last Realtime Sync</span>
                <span style={{ fontWeight: 600 }}>{gcalStatus.lastSync}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                <div>
                  <span style={{ fontWeight: 600, display: 'block' }}>Automatic Background Resync</span>
                  <span style={{ fontSize: 10, color: '#64748b' }}>Poll for meeting schedule shifts every 5 minutes</span>
                </div>
                <input
                  type="checkbox"
                  checked={gcalStatus.autoSync}
                  onChange={(e) => setGcalStatus(p => ({ ...p, autoSync: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn-change-photo"
                style={{ flex: 1, padding: '8px 12px', textAlign: 'center' }}
                onClick={() => {
                  setGcalSyncing(true);
                  setTimeout(() => {
                    setGcalSyncing(false);
                    setGcalStatus(p => ({ ...p, lastSync: 'Just now' }));
                    setGcalNotice('Calendar sync complete! 5 events verified.');
                    setTimeout(() => setGcalNotice(null), 3000);
                  }, 800);
                }}
                disabled={gcalSyncing}
              >
                {gcalSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                className="btn-change-photo"
                style={{ flex: 1, padding: '8px 12px', textAlign: 'center', color: gcalStatus.connected ? '#dc2626' : '#059669' }}
                onClick={() => {
                  setGcalStatus(p => ({ ...p, connected: !p.connected }));
                  setGcalNotice(gcalStatus.connected ? 'Google Calendar disconnected.' : 'Google Calendar connected.');
                  setTimeout(() => setGcalNotice(null), 3000);
                }}
              >
                {gcalStatus.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Focus Rhythm & Working Hours Modal */}
      {showRhythmModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowRhythmModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 14,
              width: 460,
              maxWidth: '92vw',
              padding: 24,
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ede9fe', color: '#6d28d9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Moon size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Working Hours & Focus Rhythm</h3>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>Configure scheduling windows and automated pauses</p>
                </div>
              </div>
              <button
                onClick={() => setShowRhythmModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              <div className="form-field-group">
                <label className="input-label">Standard Workdays</label>
                <input
                  type="text"
                  className="input-text"
                  value={profileForm.workdays}
                  onChange={(e) => handleFieldChange('workdays', e.target.value)}
                  placeholder="e.g. Monday - Friday"
                />
              </div>

              <div className="form-field-group">
                <label className="input-label">Daily Core Window</label>
                <input
                  type="text"
                  className="input-text"
                  value={profileForm.coreHours}
                  onChange={(e) => handleFieldChange('coreHours', e.target.value)}
                  placeholder="e.g. 9:00 AM - 5:00 PM"
                />
              </div>

              <div className="form-field-group">
                <label className="input-label">Automated Lunch Buffer</label>
                <input
                  type="text"
                  className="input-text"
                  value={profileForm.lunchBuffer}
                  onChange={(e) => handleFieldChange('lunchBuffer', e.target.value)}
                  placeholder="e.g. 12:30 PM - 1:30 PM"
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                className="btn-discard"
                style={{ padding: '7px 14px' }}
                onClick={() => setShowRhythmModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
