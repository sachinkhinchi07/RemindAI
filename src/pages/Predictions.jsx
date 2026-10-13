import { useState } from 'react';
import {
  TrendingUp, AlertTriangle, Clock, Brain, Sparkles,
  Filter, ArrowUpRight, ChevronDown, Eye, BarChart2,
  Zap, RefreshCw, Target, Activity
} from 'lucide-react';
import './Predictions.css';

const predictions = [
  {
    id: 1,
    task: 'Submit Q3 Sprint Retrospective',
    dueTime: 'Today, 11:30 AM',
    riskPct: 94,
    riskLevel: 'Critical',
    riskClass: 'high',
    category: 'Work',
    trend: [60, 65, 72, 78, 85, 91, 94],
    reason: 'Back-to-back meeting collision detected. Historical pattern: missed 3/4 times under this condition.',
    triggers: ['3+ consecutive meetings', 'No prep interval', 'Monday carry-over'],
  },
  {
    id: 2,
    task: 'Renew Cloudflare SSL Certification',
    dueTime: 'Tomorrow, 9:00 AM',
    riskPct: 89,
    riskLevel: 'High',
    riskClass: 'high',
    category: 'DevOps',
    trend: [20, 30, 45, 60, 72, 82, 89],
    reason: 'Last renewal was 11 months ago. No checklist initiated. Certificate expires in 72 hours.',
    triggers: ['No calendar entry', 'No task created', 'Certificate expiry proximity'],
  },
  {
    id: 3,
    task: 'Send weekly 1-on-1 feedback to Design Lead',
    dueTime: 'Friday, 4:00 PM',
    riskPct: 67,
    riskLevel: 'Medium',
    riskClass: 'medium',
    category: 'Management',
    trend: [40, 45, 50, 55, 60, 64, 67],
    reason: 'Routine drift: +35m slippage recorded 2 consecutive weeks. Usually deprioritized on busy Fridays.',
    triggers: ['Routine drift', 'Late-week fatigue', 'Calendar density >85%'],
  },
  {
    id: 4,
    task: 'Hydration reminder — morning sequence',
    dueTime: 'Daily, 8:30 AM',
    riskPct: 45,
    riskLevel: 'Low',
    riskClass: 'low',
    category: 'Health',
    trend: [65, 55, 50, 48, 46, 45, 45],
    reason: 'Compliance dropped from 90% to 45% over 7 days. Monday mornings show highest skip rate.',
    triggers: ['Morning meetings starting before 9 AM', 'High cognitive load'],
  },
];

const modelMetrics = [
  { label: 'Prediction Accuracy', value: '87.3%', sub: '+2.1% vs last week', color: 'var(--brand-primary)' },
  { label: 'Tasks Predicted', value: '142', sub: 'Last 30 days', color: 'var(--text-brand)' },
  { label: 'False Positives', value: '4.2%', sub: 'Well within threshold', color: 'var(--risk-low)' },
  { label: 'Model Version', value: 'v2.4', sub: 'Scikit-learn • Calibrated', color: 'var(--risk-medium)' },
];

function MiniChart({ trend, riskClass }) {
  const max = Math.max(...trend);
  const min = Math.min(...trend);
  const range = max - min || 1;
  const h = 32;
  const w = 80;
  const points = trend.map((v, i) => {
    const x = (i / (trend.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const color = riskClass === 'high' ? '#EF4444' : riskClass === 'medium' ? '#F59E0B' : '#10B981';

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <circle
        cx={w}
        cy={h - ((trend[trend.length - 1] - min) / range) * h}
        r={3}
        fill={color}
      />
    </svg>
  );
}

export default function Predictions() {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="predictions-page animate-fade-in-up">
      <div className="predictions-header">
        <div>
          <h1 className="pred-title">Predictions Engine</h1>
          <p className="pred-sub">ML-powered forgetfulness forecasting — ranked by algorithmic forgetting curves</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary"><Filter size={13} /> Filter</button>
          <button className="btn btn-secondary"><RefreshCw size={13} /> Recalibrate</button>
          <button className="btn btn-primary"><Sparkles size={13} /> Run Analysis</button>
        </div>
      </div>

      {/* Model metrics */}
      <div className="model-metrics-grid">
        {modelMetrics.map((m, i) => (
          <div key={i} className="model-metric-card">
            <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
            <div className="metric-label">{m.label}</div>
            <div className="metric-sub">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Predictions list */}
      <div className="predictions-list">
        <div className="pred-list-header">
          <h2 className="section-title">At-Risk Predictions</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="label">SORTED BY RISK</span>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}>
              <ChevronDown size={13} />
            </button>
          </div>
        </div>

        {predictions.map((pred) => (
          <div key={pred.id} className={`prediction-card pred-${pred.riskClass}`}>
            <div className="pred-main" onClick={() => setExpanded(expanded === pred.id ? null : pred.id)}>
              <div className="pred-risk-indicator">
                <div
                  className="risk-circle"
                  style={{
                    background: `conic-gradient(${pred.riskClass === 'high' ? '#EF4444' : pred.riskClass === 'medium' ? '#F59E0B' : '#10B981'} ${pred.riskPct}%, var(--bg-hover) 0)`,
                  }}
                >
                  <div className="risk-circle-inner">
                    <span className="risk-pct">{pred.riskPct}%</span>
                  </div>
                </div>
              </div>

              <div className="pred-body">
                <div className="pred-top">
                  <span className={`badge badge-${pred.riskClass}`}>{pred.riskLevel} Risk</span>
                  <span className="tag">{pred.category}</span>
                </div>
                <h3 className="pred-task-name">{pred.task}</h3>
                <div className="pred-meta">
                  <span><Clock size={11} /> {pred.dueTime}</span>
                </div>
              </div>

              <div className="pred-chart">
                <MiniChart trend={pred.trend} riskClass={pred.riskClass} />
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>7-day trend</span>
              </div>

              <div className="pred-actions">
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 12px' }}>
                  <Zap size={12} /> Intervene
                </button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '6px 8px' }}>
                  <Eye size={12} />
                </button>
              </div>
            </div>

            {expanded === pred.id && (
              <div className="pred-expanded animate-fade-in">
                <div className="pred-reason">
                  <Brain size={13} />
                  <div>
                    <strong>AI Reason:</strong> {pred.reason}
                  </div>
                </div>
                <div className="pred-triggers">
                  <span className="label">RISK TRIGGERS</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {pred.triggers.map((t, i) => (
                      <span key={i} className="trigger-tag">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
