import { useState } from 'react';
import {
  User, Mail, Key, Shield, Clock, LogOut, Settings,
  Check, Copy, X, CheckCircle2, Lock, Globe
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './ProfileModal.css';

export default function ProfileModal({ isOpen = true, onClose }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [copiedUid, setCopiedUid] = useState(false);

  if (!isOpen) return null;

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sachin';
  const email = user?.email || 'sachin.khinchi1999@gmail.com';
  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const userId = user?.id || 'usr_63a4b917c2f8';
  const role = user?.user_metadata?.role || 'Knowledge Architect';
  const provider = user?.app_metadata?.provider || 'supabase_auth';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const createdAt = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'Oct 2024';
  const lastSignIn = user?.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : 'Active Now';

  const handleCopyUid = () => {
    navigator.clipboard.writeText(userId);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const handleGoToSettings = () => {
    if (onClose) onClose();
    navigate('/settings');
  };

  const handleSignOut = async () => {
    if (onClose) onClose();
    await signOut();
  };

  return (
    <div className="profile-modal-backdrop" onClick={onClose}>
      <div className="profile-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="profile-modal-header">
          <div className="profile-header-title">
            <Shield size={16} color="var(--brand-primary, #6366f1)" />
            <span>User Credentials & Identity</span>
          </div>
          <button className="profile-btn-close" onClick={onClose} aria-label="Close credentials dialog">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="profile-modal-body">
          {/* Identity Hero */}
          <div className="profile-identity-hero">
            {localStorage.getItem('remind_ai_avatar') ? (
              <img
                src={localStorage.getItem('remind_ai_avatar')}
                alt={displayName}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid var(--brand-primary, #6366f1)',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div className="profile-large-avatar">{initials}</div>
            )}
            <div className="profile-hero-meta">
              <h3 className="profile-hero-name">{displayName}</h3>
              <p className="profile-hero-email">{email}</p>
              <div className="profile-badge-row">
                <span className="badge badge-brand" style={{ fontSize: 10, padding: '2px 7px' }}>{role}</span>
                <span className="badge badge-low" style={{ fontSize: 10, padding: '2px 7px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={10} /> Verified
                </span>
              </div>
            </div>
          </div>

          {/* Credentials & Auth Details */}
          <div>
            <div className="credentials-section-title">
              <Key size={13} />
              <span>Authentication Credentials</span>
            </div>
            <div className="credentials-list">
              <div className="credential-row">
                <span className="credential-label">
                  <Key size={13} /> User ID (UUID)
                </span>
                <div className="credential-value mono">
                  <span title={userId}>
                    {userId.length > 18 ? `${userId.slice(0, 10)}...${userId.slice(-6)}` : userId}
                  </span>
                  <button className="btn-copy-uid" onClick={handleCopyUid} title="Copy User ID">
                    {copiedUid ? <Check size={11} /> : <Copy size={11} />}
                    {copiedUid ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="credential-row">
                <span className="credential-label">
                  <Mail size={13} /> Account Email
                </span>
                <span className="credential-value">{email}</span>
              </div>

              <div className="credential-row">
                <span className="credential-label">
                  <Lock size={13} /> Auth Provider
                </span>
                <span className="credential-value">
                  <span className="status-dot active" style={{ width: 6, height: 6 }} />
                  {provider === 'email' || provider === 'supabase_auth' ? 'Supabase JWT Session' : provider}
                </span>
              </div>

              <div className="credential-row">
                <span className="credential-label">
                  <Clock size={13} /> Session Status
                </span>
                <span className="credential-value" style={{ color: 'var(--risk-low, #10b981)' }}>
                  Active • Signed in {lastSignIn}
                </span>
              </div>

              <div className="credential-row">
                <span className="credential-label">
                  <Globe size={13} /> Timezone Rhythm
                </span>
                <span className="credential-value">{timezone}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="profile-modal-footer">
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '7px 12px', gap: 6 }}
            onClick={handleGoToSettings}
          >
            <Settings size={13} /> Workspace Settings
          </button>
          <button
            className="btn btn-danger"
            style={{
              fontSize: 12,
              padding: '7px 14px',
              gap: 6,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center'
            }}
            onClick={handleSignOut}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
