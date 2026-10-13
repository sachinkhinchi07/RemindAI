import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Brain, ArrowRight, LogIn, Check, Lock, Zap,
  Target, AlertTriangle, Sparkles, Calendar,
  BarChart2, Clock, Moon, Shield, Radio, CheckCircle2
} from 'lucide-react';
import './Landing.css';

const previewScenarios = {
  slip: {
    badge: '94% Slip Probability',
    badgeClass: 'danger',
    due: 'Due Today, 5:00 PM',
    title: 'Submit Q3 Sprint Retrospective & Deck',
    friction: '4 consecutive client syncs scheduled between 1:00 PM – 4:30 PM with 0 minutes buffer. Focused context switching debt exceeds threshold.',
    intervention: 'Suggested alert set for 11:15 AM (45m prep buffer)',
    syncNote: 'Syncs with Google Calendar & Slack',
  },
  routines: {
    badge: '81% Routine Disruption',
    badgeClass: 'warning',
    due: 'Tomorrow, 8:30 AM',
    title: 'Morning Gym & Deep Work Planning',
    friction: 'Late flight arrival tonight detected at 11:45 PM. Cortisol & circadian recovery requires shifting morning routine by 60 mins.',
    intervention: 'Autonomous routine adjustment: Alarm deferred to 7:45 AM',
    syncNote: 'Syncs with Apple Health & Whoop',
  },
  quiet: {
    badge: 'Quiet Hours Active',
    badgeClass: 'calm',
    due: 'Tonight, 10:00 PM - 7:00 AM',
    title: 'Executive Standup Deck Preparation',
    friction: 'Detected non-critical email ping from product stakeholder. Heuristic engine suppressed notification to protect sleep debt.',
    intervention: 'Queued for 7:15 AM cognitive buffer window',
    syncNote: 'Syncs with Slack Do Not Disturb & Outlook',
  },
};

export default function Landing() {
  const [activeTab, setActiveTab] = useState('slip'); // 'slip' | 'routines' | 'quiet'
  const [interventionState, setInterventionState] = useState('pending'); // 'pending' | 'accepted' | 'dismissed'
  const navigate = useNavigate();

  const currentScenario = previewScenarios[activeTab];

  return (
    <div className="landing-page">
      {/* Top Navbar */}
      <header className="landing-nav">
        <div className="landing-nav-container">
          <Link to="/" className="landing-brand">
            <div className="brand-logo-icon">
              <Brain size={20} strokeWidth={2.5} />
            </div>
            <span className="brand-name">ReMind AI</span>
          </Link>

          <div className="landing-nav-actions">
            <Link to="/login" className="nav-sign-in">
              Sign In
            </Link>
            <Link to="/dashboard" className="btn-get-started">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="landing-hero-container">
        {/* Next-Gen Pill */}
        <div className="hero-pill-badge">
          <span className="hero-pill-dot" />
          <span>Next-Gen Proactive Slip Detection</span>
        </div>

        {/* Hero Headlines */}
        <h1 className="hero-title">
          Remember what matters, before you forget.
        </h1>

        <p className="hero-subtitle">
          Personalized, proactive cognitive reminders that anticipate slip risks
          and schedule friction before deadlines break your workflow.
        </p>

        {/* Hero CTA Buttons */}
        <div className="hero-cta-group">
          <Link to="/dashboard" className="btn-hero-primary">
            <span>Get Started — Free Trial</span>
            <ArrowRight size={16} />
          </Link>
          <Link to="/login" className="btn-hero-secondary">
            <LogIn size={15} />
            <span>Log In to Workspace</span>
          </Link>
        </div>

        {/* Trust & Guarantee Badges */}
        <div className="hero-guarantees">
          <div className="guarantee-item">
            <Check size={14} className="guarantee-icon" />
            <span>No credit card required</span>
          </div>
          <span className="bullet-sep">•</span>
          <div className="guarantee-item">
            <Lock size={13} className="guarantee-icon" />
            <span>Privacy-first local engine</span>
          </div>
          <span className="bullet-sep">•</span>
          <div className="guarantee-item">
            <Zap size={14} className="guarantee-icon" />
            <span>Zero configuration setup</span>
          </div>
        </div>

        {/* Interactive Showcase Card */}
        <div className="hero-mockup-wrapper">
          <div className={`hero-card-showcase ${activeTab}`}>
            {/* Red left accent bar is built-in */}
            <div className="mockup-header-row">
              <div className="mockup-header-left">
                <div className="radar-icon-box">
                  <Radio size={16} className="radar-icon" />
                </div>
                <span className="mockup-header-label">Predicted Slip Risk</span>
                <span className={`slip-badge ${currentScenario.badgeClass}`}>
                  <span className="slip-badge-dot" />
                  {currentScenario.badge}
                </span>
              </div>
              <div className="mockup-header-right">
                <span className="due-timestamp">{currentScenario.due}</span>
              </div>
            </div>

            {/* Task Title */}
            <h3 className="mockup-task-title">{currentScenario.title}</h3>

            {/* Cognitive Friction Detected Box */}
            <div className="friction-alert-box">
              <div className="friction-pin-icon">
                <Target size={15} />
              </div>
              <p className="friction-alert-text">
                <strong>Cognitive friction detected:</strong> {currentScenario.friction}
              </p>
            </div>

            {/* Proactive Intervention Banner */}
            <div className="proactive-intervention-card">
              <div className="intervention-left">
                <div className="sparkle-icon-square">
                  <Sparkles size={16} />
                </div>
                <div>
                  <h4 className="intervention-title">Proactive Intervention</h4>
                  <p className="intervention-desc">{currentScenario.intervention}</p>
                </div>
              </div>
              <div className="intervention-actions">
                {interventionState === 'accepted' ? (
                  <span className="intervention-accepted-status">
                    <CheckCircle2 size={14} /> Accepted
                  </span>
                ) : interventionState === 'dismissed' ? (
                  <span className="intervention-dismissed-status">Dismissed</span>
                ) : (
                  <>
                    <button
                      className="btn-intervention-accept"
                      onClick={() => setInterventionState('accepted')}
                    >
                      Accept
                    </button>
                    <button
                      className="btn-intervention-dismiss"
                      onClick={() => setInterventionState('dismissed')}
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Card Footer */}
            <div className="mockup-footer-row">
              <div className="footer-sync-note">
                <BarChart2 size={13} className="sync-icon" />
                <span>{currentScenario.syncNote}</span>
              </div>
              <div className="footer-status-pill">
                <span>Autonomous Recall Active</span>
              </div>
            </div>
          </div>

          {/* Interactive Feature Pill Selectors */}
          <div className="feature-pills-row">
            <button
              className={`feature-pill-btn ${activeTab === 'slip' ? 'active' : ''}`}
              onClick={() => { setActiveTab('slip'); setInterventionState('pending'); }}
            >
              <BarChart2 size={14} />
              <span>Predictive Slip Modeling</span>
            </button>
            <button
              className={`feature-pill-btn ${activeTab === 'routines' ? 'active' : ''}`}
              onClick={() => { setActiveTab('routines'); setInterventionState('pending'); }}
            >
              <Clock size={14} />
              <span>Friction-Free Routines</span>
            </button>
            <button
              className={`feature-pill-btn ${activeTab === 'quiet' ? 'active' : ''}`}
              onClick={() => { setActiveTab('quiet'); setInterventionState('pending'); }}
            >
              <Moon size={14} />
              <span>Adaptive Quiet Hours</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-container">
          <div className="footer-left">
            <span className="footer-brand-tag">ReMind AI</span>
            <span className="bullet-sep">•</span>
            <span className="prototype-mode-badge">
              <span className="mode-dot" />
              Prototype Preview Mode
            </span>
          </div>

          <div className="footer-links">
            <a href="#privacy">Privacy Policy</a>
            <a href="#terms">Terms of Service</a>
            <span className="soc2-badge">
              <Shield size={13} />
              SOC2 Compliant Architecture
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
