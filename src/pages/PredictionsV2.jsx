import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, AlertTriangle, Clock, Brain, Sparkles,
  Shield, RefreshCw, ChevronDown, Eye, Zap, Filter,
  ArrowRight, CheckCircle2, Calendar, BarChart2,
  ToggleLeft, ToggleRight, Info, ExternalLink, Check, AlertCircle, Loader2
} from 'lucide-react';
import { createTask } from '../lib/db';
import { useTasks } from '../hooks/useTasks';
import { batchAssessTasksRisk } from '../lib/riskService';
import './PredictionsV2.css';

// Fallback demo data if no tasks exist in database
const fallbackFlaggedTasks = [
  {
    id: 'demo-1',
    name: 'Submit Q3 Sprint Retrospective & Deck',
    missIndex: 94,
    level: 'HIGH',
    deadline: 'Today, 11:30 AM',
    category: 'Work',
    sources: ['Google Slides', 'Jira'],
    factors: [
      { label: 'Deadline Proximity', weight: '+35 pts', bar: 70, color: 'var(--risk-high)' },
      { label: 'Priority Weight', weight: '+18 pts', bar: 36, color: 'var(--risk-high)' },
      { label: 'Preparation Requirements', weight: '+6 pts', bar: 12, color: 'var(--risk-medium)' },
    ],
    explanation: 'Task is due within hours, marked high priority, with multiple required materials.',
    dataSufficiency: 'sufficient',
  },
  {
    id: 'demo-2',
    name: 'Renew Cloudflare SSL Wildcard Certification',
    missIndex: 58,
    level: 'MEDIUM',
    deadline: 'Tomorrow, 9:00 AM',
    category: 'DevOps',
    sources: ['Linear', 'Calendar'],
    factors: [
      { label: 'Deadline Proximity', weight: '+18 pts', bar: 36, color: 'var(--risk-medium)' },
      { label: 'Priority Weight', weight: '+8 pts', bar: 16, color: 'var(--risk-medium)' },
    ],
    explanation: 'Task is due tomorrow with medium operational priority.',
    dataSufficiency: 'moderate',
  },
];

export default function PredictionsV2() {
  const { tasks: dbTasks, loading: tasksLoading, refetch: refetchTasks } = useTasks();

  const [assessedTasks, setAssessedTasks] = useState([]);
  const [loadingAssessments, setLoadingAssessments] = useState(true);
  const [assessmentError, setAssessmentError] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [showExplainability, setShowExplainability] = useState(true);
  const [activeTimeFilter, setActiveTimeFilter] = useState('All');
  const [intervenedTasks, setIntervenedTasks] = useState([]);
  const [isIntervening, setIsIntervening] = useState(false);

  // Evaluate risk for all active uncompleted tasks via FastAPI Risk Engine
  const evaluateTasksRisk = useCallback(async (tasksList) => {
    setLoadingAssessments(true);
    setAssessmentError(null);
    try {
      // Filter to uncompleted tasks
      const activeUncompleted = tasksList.filter(t => t.status !== 'done' && t.status !== 'completed');

      if (activeUncompleted.length === 0) {
        setAssessedTasks([]);
        setActiveTask(null);
        setLoadingAssessments(false);
        return;
      }

      // Compute simple user history metrics from tasks
      const completedCount = tasksList.filter(t => t.status === 'done' || t.status === 'completed').length;
      const overdueCount = activeUncompleted.filter(t => t.due_at && new Date(t.due_at) < new Date()).length;

      const batchResult = await batchAssessTasksRisk(activeUncompleted, {
        total_tasks_completed: completedCount,
        total_tasks_overdue: overdueCount,
        total_reminders_snoozed: 1,
        similar_tasks_postponed: 0,
        similar_tasks_missed: overdueCount,
      });

      // Map backend assessments to UI card structure
      const mapped = batchResult.assessments.map(a => {
        const rawTask = activeUncompleted.find(t => t.id === a.task_id) || {};
        return {
          id: a.task_id || rawTask.id,
          name: rawTask.title || 'Scheduled Task',
          missIndex: a.score,
          level: a.level,
          deadline: rawTask.due_at ? new Date(rawTask.due_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'No Deadline',
          category: (rawTask.tags && rawTask.tags[0]) || 'General',
          sources: rawTask.tags || ['#task'],
          factors: a.factors.map(f => ({
            label: f.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            weight: `+${f.impact} pts`,
            bar: Math.min(100, f.impact * 2.8),
            color: f.impact >= 20 ? 'var(--risk-high)' : f.impact >= 10 ? 'var(--risk-medium)' : 'var(--risk-low)',
            description: f.description,
          })),
          explanation: a.explanation,
          confidence: a.confidence,
          dataSufficiency: a.data_sufficiency,
          rawTask,
        };
      });

      setAssessedTasks(mapped);
      if (mapped.length > 0) {
        setActiveTask(mapped[0]);
      } else {
        setActiveTask(null);
      }
    } catch (err) {
      console.warn('Backend risk engine offline or error:', err);
      setAssessmentError(err.message);
      // Fallback to sample items for demonstration
      setAssessedTasks(fallbackFlaggedTasks);
      setActiveTask(fallbackFlaggedTasks[0]);
    } finally {
      setLoadingAssessments(false);
    }
  }, []);

  useEffect(() => {
    if (!tasksLoading) {
      evaluateTasksRisk(dbTasks);
    }
  }, [tasksLoading, dbTasks, evaluateTasksRisk]);

  const handleIntervene = async () => {
    if (!activeTask) return;
    setIsIntervening(true);
    try {
      await createTask({
        title: `Mitigation Prompt: ${activeTask.name}`,
        priority: 'high',
        status: 'pending',
        risk_score: activeTask.missIndex,
        risk_label: `${activeTask.missIndex} Risk • Intervened`,
        risk_reason: `Proactive intervention triggered from Explainability Engine (${activeTask.deadline})`,
        tags: ['#mitigation', `#${(activeTask.category || 'general').toLowerCase()}`],
      });
      setIntervenedTasks(prev => [...prev, activeTask.id]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsIntervening(false);
    }
  };

  // Metrics summary
  const displayList = assessedTasks;
  const highRiskTasks = displayList.filter(t => t.missIndex >= 60 || t.level === 'HIGH');
  const mediumRiskTasks = displayList.filter(t => (t.missIndex >= 30 && t.missIndex < 60) || t.level === 'MEDIUM');
  const lowRiskTasks = displayList.filter(t => t.missIndex < 30 || t.level === 'LOW');

  const totalCount = displayList.length;
  const highPct = totalCount ? Math.round((highRiskTasks.length / totalCount) * 100) : 0;
  const medPct = totalCount ? Math.round((mediumRiskTasks.length / totalCount) * 100) : 0;
  const lowPct = totalCount ? 100 - highPct - medPct : 0;

  const dynamicDistribution = [
    { label: 'High Risk', color: 'var(--risk-high)', pct: highPct, tasks: highRiskTasks.length, note: '— Immediate slip threat' },
    { label: 'Medium Risk', color: 'var(--risk-medium)', pct: medPct, tasks: mediumRiskTasks.length, note: '— Needs focus buffer' },
    { label: 'Low / Safe Risk', color: 'var(--risk-low)', pct: lowPct, tasks: lowRiskTasks.length, note: '— Safeguards intact' },
  ];

  return (
    <div className="pred-v2-page animate-fade-in-up">
      {/* Header */}
      <div className="pred-v2-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 className="pred-v2-title">Predictions & Forgetfulness Defense</h1>
            <div className="live-engine-badge">
              <span className="status-dot active" />
              Deterministic Risk Engine v1.0
            </div>
          </div>
          <p className="pred-v2-sub">Dynamic cognitive slip modeling & proactive risk mitigation</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ gap: 8 }}
          onClick={() => evaluateTasksRisk(dbTasks)}
          disabled={loadingAssessments}
        >
          <RefreshCw size={14} className={loadingAssessments ? 'spin-icon' : ''} />
          {loadingAssessments ? 'Recalculating...' : 'Refresh Risk Scan'}
        </button>
      </div>

      {/* Main prediction panel */}
      <div className="pred-v2-main-card">
        <div className="pred-v2-card-header">
          <h2 className="pred-v2-card-title">Forgetfulness & Cognitive Slip Predictions</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="ai-engine-badge">
              <Sparkles size={11} />
              ReMind Cognitive Heuristic Defense
            </div>
            <div className="badge badge-brand" style={{ fontSize: 11, gap: 6, display: 'inline-flex', alignItems: 'center', padding: '4px 8px' }}>
              <Shield size={12} />
              Explainable Heuristics Engine
            </div>
          </div>
        </div>

        <p className="pred-v2-desc">
          ReMind AI calculates real-time forgetfulness risk based on deadline proximity, priority level, preparation requirements, and previous postponement patterns.
        </p>

        {/* 3 key metrics */}
        <div className="pred-v2-metrics">
          <div className="pred-metric pred-metric-danger">
            <div className="pred-metric-label">HIGH-RISK TASKS <AlertTriangle size={13} /></div>
            <div className="pred-metric-value">{highRiskTasks.length} Tasks</div>
            <div className="badge badge-high" style={{ width: 'fit-content', marginBottom: 8 }}>Critical Priority</div>
            <div className="pred-metric-note">
              <Clock size={11} />
              Estimated risk score &ge; 60/100
            </div>
          </div>

          <div className="pred-metric pred-metric-warning">
            <div className="pred-metric-label">MEDIUM-RISK TASKS <Clock size={13} /></div>
            <div className="pred-metric-value">{mediumRiskTasks.length} Tasks</div>
            <div className="badge badge-medium" style={{ width: 'fit-content', marginBottom: 8 }}>Elevated Attention</div>
            <div className="pred-metric-note">
              <Calendar size={11} />
              Estimated risk score 30–59/100
            </div>
          </div>

          <div className="pred-metric pred-metric-success">
            <div className="pred-metric-label">SAFE / LOW RISK <Shield size={13} /></div>
            <div className="pred-metric-value">{lowRiskTasks.length} Tasks</div>
            <div className="badge badge-low" style={{ width: 'fit-content', marginBottom: 8 }}>Safe Zone</div>
            <div className="pred-metric-note">
              <TrendingUp size={11} />
              Estimated risk score &le; 29/100
            </div>
          </div>
        </div>
      </div>

      {/* Probability distribution */}
      <div className="pred-v2-distribution card-elevated">
        <div className="section-header" style={{ marginBottom: 12 }}>
          <div>
            <span className="section-title">
              <BarChart2 size={14} style={{ display: 'inline', marginRight: 6 }} />
              Active Task Load Risk Distribution ({totalCount} Tasks Evaluated)
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Transparent Deterministic Scoring Formula · Live Engine
          </span>
        </div>

        {/* Distribution bar */}
        <div className="dist-bar">
          {dynamicDistribution.map((r, i) => (
            <div
              key={i}
              className="dist-bar-segment"
              style={{ flex: Math.max(5, r.pct), background: r.color, opacity: 0.85 }}
              title={`${r.label}: ${r.pct}% (${r.tasks} tasks)`}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="dist-legend">
          {dynamicDistribution.map((r, i) => (
            <div key={i} className="dist-legend-item">
              <span className="dist-dot" style={{ background: r.color }} />
              <strong style={{ color: r.color }}>{r.label}</strong>
              <span className="dist-detail">({r.tasks} tasks · {r.pct}%) {r.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged tasks + explainability panel */}
      <div className="pred-v2-split">
        {/* Left: Flagged tasks */}
        <div className="pred-v2-flagged card-elevated">
          <div className="section-header" style={{ marginBottom: 6 }}>
            <div>
              <h3 className="section-title">Evaluated Tasks & Slip Indices</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-brand">{displayList.length} Tasks Analyzed</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Click task to inspect factor breakdown</span>
            </div>
          </div>

          {loadingAssessments ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <Loader2 size={28} className="spin-icon" style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 13 }}>Evaluating task risk via Cognitive Defense Engine...</p>
            </div>
          ) : displayList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>
              <CheckCircle2 size={32} opacity={0.4} style={{ marginBottom: 8 }} />
              <h4 style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>No active tasks to assess</h4>
              <p style={{ fontSize: 12 }}>Create a task to see real-time forgetfulness risk estimates.</p>
            </div>
          ) : (
            <div className="flagged-list">
              {displayList.map(task => {
                const isHigh = task.missIndex >= 60 || task.level === 'HIGH';
                const isMed = (task.missIndex >= 30 && task.missIndex < 60) || task.level === 'MEDIUM';
                const badgeColor = isHigh ? 'var(--risk-high)' : isMed ? 'var(--risk-medium)' : 'var(--risk-low)';
                const badgeBg = isHigh ? 'var(--risk-high-bg)' : isMed ? 'var(--risk-medium-bg)' : 'rgba(16, 185, 129, 0.15)';

                return (
                  <div
                    key={task.id}
                    className={`flagged-task ${activeTask?.id === task.id ? 'flagged-active' : ''}`}
                    onClick={() => setActiveTask(task)}
                  >
                    <div className="flagged-task-top">
                      <div className="flagged-task-header">
                        <AlertTriangle size={14} color={badgeColor} />
                        <span className="flagged-task-name">{task.name}</span>
                        {activeTask?.id === task.id && (
                          <div className="active-selection-badge">
                            Selected <ArrowRight size={11} />
                          </div>
                        )}
                      </div>
                      <div className="miss-index-badge" style={{ background: badgeBg, color: badgeColor }}>
                        {task.missIndex}/100 Risk ({task.level})
                      </div>
                    </div>
                    <div className="flagged-task-meta">
                      <span><Clock size={10} /> Deadline: {task.deadline}</span>
                      <span> • Category: {task.category}</span>
                    </div>
                    {task.sources.length > 0 && (
                      <div className="flagged-sources">
                        {task.sources.map((s, i) => <span key={i} className="tag">{s}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Explainability */}
        {showExplainability && activeTask && (
          <div className="pred-v2-explain card-elevated">
            <div className="explain-header">
              <div>
                <div className="label" style={{ marginBottom: 4 }}>DETERMINISTIC EXPLAINABILITY BREAKDOWN</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>⚡ Real-time Scoring Factors</div>
              </div>
              <span className={`badge badge-${activeTask.level.toLowerCase()}`}>
                {activeTask.level} RISK · {activeTask.missIndex}/100
              </span>
            </div>

            <h3 className="explain-task-name">{activeTask.name}</h3>

            <div className="explain-likelihood">
              <span>Forgetfulness Risk Score:</span>
              <span className="likelihood-val">{activeTask.missIndex} / 100</span>
              <span className="likelihood-var">Status: {activeTask.level}</span>
            </div>

            {/* Data sufficiency banner */}
            {activeTask.dataSufficiency === 'limited' && (
              <div style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 11,
                color: 'var(--risk-medium)',
                marginBottom: 14,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>Limited User History:</strong> This estimate is based primarily on deadline proximity and task priority. ReMind needs more task history to fully personalize risk.
                </span>
              </div>
            )}

            <div className="divider" />

            <div className="label" style={{ marginBottom: 10 }}>
              Contributing Factor Breakdown <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>Impact Score</span>
            </div>

            {activeTask.factors && activeTask.factors.map((f, i) => (
              <div key={i} className="factor-item" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{f.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: f.color }}>{f.weight}</span>
                </div>
                {f.description && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.3 }}>
                    {f.description}
                  </p>
                )}
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${f.bar}%`, background: f.color }} />
                </div>
              </div>
            ))}

            {/* Synthesized explanation box */}
            <div style={{
              background: 'var(--bg-card-subtle, rgba(255,255,255,0.03))',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              marginTop: 10,
              marginBottom: 14,
            }}>
              <strong>Risk Rationale:</strong> {activeTask.explanation}
            </div>

            <div className="divider" />

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, fontSize: 12, justifyContent: 'center' }}
                onClick={handleIntervene}
                disabled={isIntervening || intervenedTasks.includes(activeTask.id)}
              >
                {intervenedTasks.includes(activeTask.id) ? (
                  <>
                    <Check size={13} /> Intervened & Saved
                  </>
                ) : isIntervening ? (
                  'Saving...'
                ) : (
                  <>
                    <Zap size={13} /> Intervene Now
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
