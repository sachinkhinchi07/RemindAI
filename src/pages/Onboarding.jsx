import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, Flag, RefreshCw, Monitor, Archive, Shield,
  ChevronRight, Info, Clock, Moon, Lock, Database,
  CheckCircle2, Zap, Bell
} from 'lucide-react';
import './Onboarding.css';

const steps = [
  { num: 1, label: 'Memory Focus' },
  { num: 2, label: 'Routines & Timing' },
  { num: 3, label: 'Quiet Hours' },
  { num: 4, label: 'Data & Privacy' },
];

const memoryDomains = [
  {
    id: 'deadlines',
    icon: Flag,
    label: 'Work Deadlines & Retrospectives',
    desc: 'Sprint reviews, milestone buffers, commitments made in asynchronous threads.',
    defaultChecked: true,
  },
  {
    id: 'routines',
    icon: RefreshCw,
    label: 'Recurring Daily Routines & Habits',
    desc: 'Hydration, micro-breaks, desk mobility resets, and morning planning sequences.',
    defaultChecked: true,
  },
  {
    id: 'meetings',
    icon: Monitor,
    label: 'Pre-Meeting Preparation & Equipment',
    desc: 'Deck reviews, mic checks, context summaries 10 minutes prior to call start.',
    defaultChecked: true,
  },
  {
    id: 'errands',
    icon: Archive,
    label: 'Personal Errands & Admin',
    desc: 'Prescriptions, package returns, utilities, and tax document organization.',
    defaultChecked: false,
  },
  {
    id: 'focus',
    icon: Shield,
    label: 'Focus Time Protection',
    desc: 'Defends deep work blocks from calendar fragmentation, auto-declining low-priority conflicts.',
    defaultChecked: true,
    wide: true,
  },
];

const routineOptions = [
  { id: 'morning', icon: '☀️', label: 'Morning Check-in', sub: '8:00 – 9:00 AM' },
  { id: 'midday', icon: '🌤️', label: 'Midday Review', sub: '12:00 – 1:00 PM' },
  { id: 'evening', icon: '🌙', label: 'Evening Debrief', sub: '5:00 – 6:00 PM' },
  { id: 'adaptive', icon: '⚡', label: 'Adaptive (AI decides)', sub: 'Based on your patterns' },
];

const quietHourOptions = [
  { id: 'sleep', icon: '😴', label: 'Sleep Hours', sub: '10 PM – 7 AM', default: true },
  { id: 'focus', icon: '🎯', label: 'Deep Focus Blocks', sub: 'Detected automatically', default: true },
  { id: 'meetings', icon: '📅', label: 'During Meetings', sub: 'Auto-detect from calendar', default: false },
  { id: 'weekends', icon: '🌿', label: 'Weekends', sub: 'Saturday & Sunday', default: false },
];

const privacyOptions = [
  { id: 'local', icon: Lock, label: 'On-device local sandbox', desc: 'All data stays on device. No cloud sync.', default: true },
  { id: 'cloud', icon: Database, label: 'Cloud Sync (Encrypted)', desc: 'Sync across devices with end-to-end encryption.', default: false },
  { id: 'analytics', icon: Brain, label: 'Share anonymized patterns', desc: 'Help improve the AI model (opt-in).', default: false },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selections, setSelections] = useState({
    deadlines: true,
    routines: true,
    meetings: true,
    errands: false,
    focus: true,
  });
  const [routineTime, setRoutineTime] = useState('adaptive');
  const [quietHours, setQuietHours] = useState({ sleep: true, focus: true, meetings: false, weekends: false });
  const [privacy, setPrivacy] = useState({ local: true, cloud: false, analytics: false });
  const navigate = useNavigate();

  const toggleSelection = (id) => {
    setSelections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleContinue = () => {
    if (currentStep < 4) setCurrentStep(s => s + 1);
    else navigate('/dashboard');
  };

  const progress = (currentStep / 4) * 100;

  return (
    <div className="onboarding-page">
      {/* Header */}
      <header className="onboarding-header">
        <div className="onboarding-logo">
          <div className="logo-icon">
            <Brain size={18} strokeWidth={2.5} />
          </div>
          <span className="logo-name">ReMind AI</span>
        </div>
        <div className="onboarding-breadcrumb">
          <span className="ob-section">Personalization Onboarding</span>
          <div className="ob-mode-badge">
            <span className="ob-mode-dot" />
            Setup Mode
          </div>
        </div>
        <div className="onboarding-progress-info">
          <span className="ob-step-label">Setup Progress</span>
          <span className="ob-step-num">Step {currentStep} of 4</span>
        </div>
        <button className="btn btn-ghost ob-skip" onClick={() => navigate('/dashboard')}>Skip for now</button>
      </header>

      {/* Progress steps */}
      <div className="ob-steps-bar">
        <div className="ob-progress-track">
          <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="ob-step-labels">
          {steps.map(step => (
            <button
              key={step.num}
              className={`ob-step-label-item ${currentStep >= step.num ? 'done' : ''} ${currentStep === step.num ? 'current' : ''}`}
              onClick={() => setCurrentStep(step.num)}
            >
              <span className="ob-step-circle">{step.num}</span>
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="ob-content">
        <div className="ob-card">
          {/* Step 1: Memory Focus */}
          {currentStep === 1 && (
            <div className="ob-step animate-fade-in-up">
              <div className="ob-cognitive-badge">
                <Brain size={13} />
                Cognitive Mapping
              </div>
              <h2 className="ob-title">What would you like ReMind AI to help you remember?</h2>
              <p className="ob-sub">Select the core domains where mental fatigue usually strikes. We will calibrate proactive anticipations accordingly.</p>

              <div className="domain-grid">
                {memoryDomains.filter(d => !d.wide).map(domain => (
                  <label key={domain.id} className={`domain-card ${selections[domain.id] ? 'selected' : ''}`}>
                    <div className="domain-check">
                      <input
                        type="checkbox"
                        checked={!!selections[domain.id]}
                        onChange={() => toggleSelection(domain.id)}
                        className="hidden-check"
                      />
                      <div className={`check-box ${selections[domain.id] ? 'checked' : ''}`}>
                        {selections[domain.id] && <CheckCircle2 size={14} />}
                      </div>
                    </div>
                    <div className="domain-body">
                      <span className="domain-label">{domain.label}</span>
                      <span className="domain-desc">{domain.desc}</span>
                    </div>
                    <domain.icon size={18} className="domain-icon" />
                  </label>
                ))}
              </div>

              {/* Wide card */}
              {memoryDomains.filter(d => d.wide).map(domain => (
                <label key={domain.id} className={`domain-card domain-wide ${selections[domain.id] ? 'selected' : ''}`}>
                  <div className="domain-check">
                    <input
                      type="checkbox"
                      checked={!!selections[domain.id]}
                      onChange={() => toggleSelection(domain.id)}
                      className="hidden-check"
                    />
                    <div className={`check-box ${selections[domain.id] ? 'checked' : ''}`}>
                      {selections[domain.id] && <CheckCircle2 size={14} />}
                    </div>
                  </div>
                  <div className="domain-body">
                    <span className="domain-label">{domain.label}</span>
                    <span className="domain-desc">{domain.desc}</span>
                  </div>
                  <domain.icon size={18} className="domain-icon" />
                </label>
              ))}

              <div className="ob-info-note">
                <Info size={13} />
                <span>You can always activate or customize niche recall rules in the <strong>Settings</strong> tab.</span>
              </div>
            </div>
          )}

          {/* Step 2: Routines & Timing */}
          {currentStep === 2 && (
            <div className="ob-step animate-fade-in-up">
              <div className="ob-cognitive-badge">
                <Clock size={13} />
                Routine Configuration
              </div>
              <h2 className="ob-title">When should ReMind AI check in with you?</h2>
              <p className="ob-sub">Choose your preferred routine rhythm. The AI will adapt over time based on your actual usage patterns.</p>

              <div className="routine-grid">
                {routineOptions.map(opt => (
                  <label key={opt.id} className={`routine-option ${routineTime === opt.id ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="routine"
                      value={opt.id}
                      checked={routineTime === opt.id}
                      onChange={() => setRoutineTime(opt.id)}
                      className="hidden-check"
                    />
                    <span className="routine-icon">{opt.icon}</span>
                    <div className="routine-body">
                      <span className="routine-label">{opt.label}</span>
                      <span className="routine-sub">{opt.sub}</span>
                    </div>
                    <div className={`radio-indicator ${routineTime === opt.id ? 'checked' : ''}`} />
                  </label>
                ))}
              </div>

              <div className="ob-info-note">
                <Zap size={13} />
                <span>The AI adaptive mode learns from your behavior and adjusts check-in times automatically.</span>
              </div>
            </div>
          )}

          {/* Step 3: Quiet Hours */}
          {currentStep === 3 && (
            <div className="ob-step animate-fade-in-up">
              <div className="ob-cognitive-badge">
                <Moon size={13} />
                Focus Protection
              </div>
              <h2 className="ob-title">When should ReMind AI stay silent?</h2>
              <p className="ob-sub">Define quiet zones where notifications will be suppressed to protect your focus and personal time.</p>

              <div className="quiet-grid">
                {quietHourOptions.map(opt => (
                  <label key={opt.id} className={`domain-card ${quietHours[opt.id] ? 'selected' : ''}`}>
                    <div className="domain-check">
                      <input
                        type="checkbox"
                        checked={!!quietHours[opt.id]}
                        onChange={() => setQuietHours(prev => ({ ...prev, [opt.id]: !prev[opt.id] }))}
                        className="hidden-check"
                      />
                      <div className={`check-box ${quietHours[opt.id] ? 'checked' : ''}`}>
                        {quietHours[opt.id] && <CheckCircle2 size={14} />}
                      </div>
                    </div>
                    <span style={{ fontSize: 20 }}>{opt.icon}</span>
                    <div className="domain-body">
                      <span className="domain-label">{opt.label}</span>
                      <span className="domain-desc">{opt.sub}</span>
                    </div>
                  </label>
                ))}
              </div>

              <div className="ob-info-note">
                <Bell size={13} />
                <span>Critical high-risk items will still alert you during quiet hours unless you choose full DND.</span>
              </div>
            </div>
          )}

          {/* Step 4: Data & Privacy */}
          {currentStep === 4 && (
            <div className="ob-step animate-fade-in-up">
              <div className="ob-cognitive-badge">
                <Lock size={13} />
                Privacy Settings
              </div>
              <h2 className="ob-title">How should ReMind AI handle your data?</h2>
              <p className="ob-sub">Your privacy is paramount. Choose how your memory patterns are stored and processed.</p>

              <div className="privacy-list">
                {privacyOptions.map(opt => (
                  <label key={opt.id} className={`privacy-card ${privacy[opt.id] ? 'selected' : ''}`}>
                    <div className={`check-box ${privacy[opt.id] ? 'checked' : ''}`} style={{ flexShrink: 0 }}>
                      {privacy[opt.id] && <CheckCircle2 size={14} />}
                    </div>
                    <div className="privacy-icon">
                      <opt.icon size={16} />
                    </div>
                    <div className="privacy-body">
                      <span className="domain-label">{opt.label}</span>
                      <span className="domain-desc">{opt.desc}</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!privacy[opt.id]}
                      onChange={() => setPrivacy(prev => ({ ...prev, [opt.id]: !prev[opt.id] }))}
                      className="hidden-check"
                    />
                  </label>
                ))}
              </div>

              <div className="ob-info-note">
                <Shield size={13} />
                <span>ReMind AI is <strong>protected by On-Device Local Sandbox</strong> by default. You can change this anytime.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="ob-footer">
        <button className="btn btn-ghost ob-skip-footer" onClick={() => navigate('/dashboard')}>Skip for now</button>
        <button className="btn btn-primary ob-continue" onClick={handleContinue}>
          {currentStep < 4 ? 'Continue' : 'Launch ReMind AI'}
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Bottom note */}
      <div className="ob-bottom-note">
        ReMind AI Personalization Engine • Version 2.4.0-preview • Protected by On-Device Local Sandbox
      </div>
    </div>
  );
}
