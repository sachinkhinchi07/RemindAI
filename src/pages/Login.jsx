import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Shield, Zap, Eye, EyeOff, ChevronRight,
  Check, Lock, Cpu, Activity, AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const features = [
  {
    icon: Cpu,
    title: 'Ambient Memory Sifting',
    desc: 'Detects cross-app context drift and prepares instant situational briefs.',
  },
  {
    icon: Shield,
    title: 'Hardware Vault Isolation',
    desc: 'Client-side cryptographic salt guarantees absolute cognitive sovereignty.',
  },
  {
    icon: Activity,
    title: 'Cognitive Load Predictions',
    desc: 'Real-time friction metrics prevent mental exhaustion before focus breaks.',
  },
];

export default function Login() {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [trust, setTrust] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signInWithEmail(email, password);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      navigate('/dashboard');
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signUpWithEmail(email, password, fullName);
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      // Supabase sends a confirmation email by default
      setError('✅ Check your email for a confirmation link!');
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setLoading(false);
      setError(error.message);
    }
    // On success, Supabase redirects to /auth/callback automatically
  };

  return (
    <div className="login-page">
      {/* Top bar */}
      <header className="login-topbar">
        <div className="login-logo">
          <div className="login-logo-icon">
            <Brain size={18} strokeWidth={2.5} />
          </div>
          <span className="login-logo-name">ReMind AI</span>
        </div>
        <div className="login-topbar-center">
          <Shield size={13} color="#4F46E5" />
          <span>Cognitive Defense</span>
          <div className="topbar-mode-dot" />
        </div>
        <div className="login-topbar-right">
          <span className="login-topbar-label">Security Protocol</span>
          <span className="login-topbar-sep">•</span>
          <span className="login-topbar-version">v2.4 Production Sandbox</span>
        </div>
      </header>

      {/* Main split */}
      <div className="login-split">
        {/* Left panel */}
        <div className="login-left">
          <div className="login-left-inner">
            <div className="login-badge">
              <Shield size={13} />
              Zero-Knowledge Neural Buffer
            </div>

            <h1 className="login-hero-title">
              Proactive memory recall for high-velocity minds.
            </h1>
            <p className="login-hero-sub">
              ReMind AI continuously organizes workstreams, context-switches, and decision logs with autonomous encryption.
            </p>

            <div className="login-features">
              {features.map((f, i) => (
                <div key={i} className="login-feature">
                  <div className="login-feature-icon">
                    <f.icon size={15} />
                  </div>
                  <div>
                    <div className="login-feature-title">{f.title}</div>
                    <div className="login-feature-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="login-nodes-status">
              <span className="status-dot active" />
              <span>All 4 Defense Nodes Operational</span>
              <span className="nodes-sla">99.98% Latency SLA</span>
            </div>
          </div>
        </div>

        {/* Right panel: Form */}
        <div className="login-right">
          <div className="login-form-card">
            {/* Tabs */}
            <div className="login-tabs">
              <button
                className={`login-tab ${tab === 'login' ? 'active' : ''}`}
                onClick={() => setTab('login')}
                id="login-tab"
              >
                Log In
              </button>
              <button
                className={`login-tab ${tab === 'signup' ? 'active' : ''}`}
                onClick={() => setTab('signup')}
                id="signup-tab"
              >
                Sign Up
              </button>
            </div>

            <div className="login-form-body">
              <h2 className="login-form-title">
                {tab === 'login' ? 'Sign in to your memory stream' : 'Create your cognitive vault'}
              </h2>
              <p className="login-form-sub">
                {tab === 'login'
                  ? 'Enter your cognitive vault credentials to resume active sessions.'
                  : 'Start your proactive memory assistant journey today.'}
              </p>

              {/* Google */}
              <button className="google-btn" onClick={handleGoogle} id="google-signin-btn">
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
                </svg>
                 Continue with Google
                <span className="google-sim-label">◎ via Supabase OAuth</span>
              </button>

              <div className="login-divider">
                <span>Or continue with email</span>
              </div>

              {/* Error / success message */}
              {error && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: error.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${error.startsWith('✅') ? '#10B981' : '#EF4444'}`,
                  borderRadius: 8, padding: '10px 12px', fontSize: 12,
                  color: error.startsWith('✅') ? '#10B981' : '#EF4444', marginBottom: 12,
                }}>
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <form onSubmit={tab === 'login' ? handleSignIn : handleSignUp} className="login-form">
                {/* Full name — signup only */}
                {tab === 'signup' && (
                  <div className="form-field">
                    <div className="field-label-row">
                      <label htmlFor="full-name">Full Name</label>
                    </div>
                    <div className="field-input-wrap">
                      <input
                        id="full-name"
                        type="text"
                        className="login-input"
                        placeholder="Alex Mercer"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="work-email">Work Email</label>
                  </div>
                  <div className="field-input-wrap">
                    <input
                      id="work-email"
                      type="email"
                      className="login-input"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                    <div className="field-icon">✉</div>
                  </div>
                  <span className="field-hint">Single sign-on or standard workspace credentials recognized.</span>
                </div>

                <div className="form-field">
                  <div className="field-label-row">
                    <label htmlFor="password">Password</label>
                    {tab === 'login' && (
                      <button type="button" className="field-link">Forgot password?</button>
                    )}
                  </div>
                  <div className="field-input-wrap">
                    <input
                      id="password"
                      type={showPwd ? 'text' : 'password'}
                      className="login-input"
                      placeholder={tab === 'signup' ? 'Min. 6 characters' : '••••••••••••'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                      required
                    />
                    <button
                      type="button"
                      className="field-icon clickable"
                      onClick={() => setShowPwd(!showPwd)}
                      aria-label="Toggle password visibility"
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="login-trust-row">
                  <label className="trust-check">
                    <input
                      type="checkbox"
                      checked={trust}
                      onChange={(e) => setTrust(e.target.checked)}
                      id="trust-device"
                    />
                    <div className={`check-box ${trust ? 'checked' : ''}`} style={{ flexShrink: 0 }}>
                      {trust && <Check size={11} />}
                    </div>
                    Trust this device for 30 days
                  </label>
                  <div className="tls-badge">
                    <Lock size={11} />
                    256-bit TLS
                  </div>
                </div>

                <button
                  type="submit"
                  className="login-submit-btn"
                  disabled={loading}
                  id="signin-submit-btn"
                >
                  {loading ? (
                    <span className="login-loading">
                      <span className="login-spinner" />
                      Authenticating...
                    </span>
                  ) : (
                    <>
                      {tab === 'login' ? 'Sign In to Workspace' : 'Create Account'}
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </form>

              <p className="login-switch">
                {tab === 'login' ? (
                  <>Don't have an account? <button className="field-link" onClick={() => { setTab('signup'); setError(''); }}>Sign up</button></>
                ) : (
                  <>Already have an account? <button className="field-link" onClick={() => { setTab('login'); setError(''); }}>Log in</button></>
                )}
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="login-footer">
        <div className="login-footer-left">
          <Shield size={13} color="#6366F1" />
          <span>Frontend prototype demonstration: No real credentials or authentication data are stored or processed.</span>
        </div>
        <div className="login-footer-links">
          <a href="#">Terms of Service</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Trust Center</a>
        </div>
      </footer>
      <div className="login-copyright">
        © 2025 ReMind AI Inc. Architected for secure cognitive task distribution.
      </div>
    </div>
  );
}
