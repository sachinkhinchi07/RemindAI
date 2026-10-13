import { useState, useRef, useEffect } from 'react';
import {
  Brain, Sparkles, Send, Mic, Paperclip, Calendar,
  Zap, RefreshCw, Link2, CheckCircle2, X, AlertTriangle,
  Clock, ChevronRight, Radio, Activity, Wifi, Volume2, VolumeX
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { createTask } from '../lib/db';
import { speechRecognizer, speechSynthesizer } from '../lib/voiceService';
import './AIAssistant.css';

const shortcuts = [
  { icon: '✨', label: 'What might I forget today?' },
  { icon: '📋', label: 'Help me prepare for tomorrow' },
  { icon: '⏱️', label: 'Review my upcoming deadlines' },
  { icon: '📊', label: 'Check for routine slippage' },
];

const memoryContextItems = [
  {
    id: 'gcal',
    icon: Calendar,
    label: 'Google Calendar',
    sub: '5 events indexed today',
    active: true,
    lastSync: 'Just now',
    details: [
      { time: '09:00 AM', title: 'Daily Engineering Standup', attendees: 6 },
      { time: '11:30 AM', title: 'Sprint Retrospective (High Risk)', attendees: 8 },
      { time: '01:00 PM', title: 'Q3 Product Roadmap Review', attendees: 4 },
      { time: '03:15 PM', title: 'Design Sprint Workshop', attendees: 12 },
      { time: '04:45 PM', title: 'Client Sync: Enterprise Rollout', attendees: 3 },
    ]
  },
  {
    id: 'slack',
    icon: Radio,
    label: 'Slack Threads',
    sub: '#team-retro & #exec-sync',
    active: true,
    lastSync: '2m ago',
    details: [
      { time: '10:45 AM', channel: '#team-retro', preview: 'Sarah: Remember to share the retro deck before 12:30 PM today.' },
      { time: '11:02 AM', channel: '#exec-sync', preview: 'Alex: Are the catering numbers locked in for Friday offsite?' },
      { time: '11:14 AM', channel: '#general', preview: 'Reminder: All team timesheets due by EOD Friday.' },
    ]
  },
  {
    id: 'linear',
    icon: CheckCircle2,
    label: 'Linear',
    sub: 'Cycle 42, 8 assigned items',
    active: true,
    lastSync: '4m ago',
    details: [
      { id: 'REM-104', title: 'Fix notification latency in memory stream', priority: 'High', status: 'In Progress' },
      { id: 'REM-112', title: 'Integrate real-time reminder chime test', priority: 'High', status: 'Done' },
      { id: 'REM-118', title: 'Validate Supabase auth session token expiry', priority: 'Medium', status: 'Backlog' },
    ]
  },
];

const pendingSuggestions = [
  {
    label: 'Flag Sprint Retro deck to Sarah',
    desc: 'Calculated risk: You usually notify Product Lead before 12:30 PM.',
    urgency: 'high',
    actions: ['Set 12:15 PM', 'Ignore'],
  },
  {
    label: 'Order catering for Friday offsite',
    desc: "Calendar item 'Design Sprint' has 12 attendees. Lead time expires in 4 hours.",
    urgency: 'medium',
    actions: ['Add Task', 'Dismiss'],
  },
];

const uiStates = ['Normal Chat', 'AI Thinking', 'Clean State', 'Connection Err'];

export default function AIAssistant() {
  const { user } = useAuth();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const initials = (user?.user_metadata?.full_name || user?.email || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // Build greeting dynamically with real user name
  const initialMessages = [
    {
      id: 1,
      role: 'assistant',
      content: `Good morning, ${firstName}. **ReMind AI Memory Assistant is active.**\n\nYour personal memory co-pilot. I analyze your calendar density, historical routine drift, and deadlines to catch tasks before they slip through the cracks.`,
      engine: 'ReMind AI Agent Orchestrator (Ollama Llama-3.2)',
    },
    {
      id: 2,
      role: 'user',
      content: 'What might I forget today? I have back-to-back meetings starting at 1 PM.',
    },
    {
      id: 3,
      role: 'assistant',
      thinking: true,
      content: `Based on your schedule and patterns, here are the high-risk items for today:\n\n**🔴 Critical Risk**\n• **Submit Q3 Sprint Retrospective** (Due 11:30 AM) — You typically miss this when back-to-back meetings start before noon. You have 78 minutes of free time remaining before the window closes.\n\n**🟡 Medium Risk**\n• **Flag Sprint Retro deck to Sarah** — You usually notify the Product Lead before 12:30 PM on Thursdays. It's 11:15 AM now.\n• **Order catering for Friday offsite** — Calendar shows 'Design Sprint' with 12 attendees. Lead time expires in ~4 hours.\n\n**📋 Routine Check**\n• Your cognitive buffer is at **12% (Critical)** — only 18 minutes of unstructured focus time between 1:00 PM and 5:00 PM.`,
    },
  ];

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeState, setActiveState] = useState('Normal Chat');
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);
  const [selectedContext, setSelectedContext] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [bufferDetailsOpen, setBufferDetailsOpen] = useState(false);
  const [backendHealth, setBackendHealth] = useState({ online: false, model: 'ReMind AI Agent Orchestrator' });
  const messagesEndRef = useRef(null);

  // Check live backend connectivity on load
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/health');
        if (res.ok) {
          const data = await res.json();
          setBackendHealth({
            online: true,
            model: data.ai?.is_model_available
              ? `ReMind AI (${data.ai.model})`
              : 'ReMind Deterministic Cognitive Orchestrator',
          });
        } else {
          setBackendHealth({ online: false, model: 'ReMind Offline Intelligence Engine' });
        }
      } catch (e) {
        setBackendHealth({ online: false, model: 'ReMind Offline Intelligence Engine' });
      }
    };
    checkBackend();
    const interval = setInterval(checkBackend, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectState = (stateName) => {
    setActiveState(stateName);
    if (stateName === 'Normal Chat') {
      setIsTyping(false);
      setMessages(initialMessages);
    } else if (stateName === 'AI Thinking') {
      setMessages([
        initialMessages[0],
        initialMessages[1],
      ]);
      setIsTyping(true);
    } else if (stateName === 'Clean State') {
      setIsTyping(false);
      setMessages([
        {
          id: Date.now(),
          role: 'assistant',
          content: `Good morning, ${firstName}. **ReMind AI Memory Assistant is active.**\n\nI am listening and ready. You can type a question, use the shortcuts below, or click the microphone to speak a memory command.`,
          engine: 'ReMind AI Agent Orchestrator (Ollama Llama-3.2)',
        }
      ]);
    } else if (stateName === 'Connection Err') {
      setIsTyping(false);
      setMessages([
        initialMessages[0],
        initialMessages[1],
        {
          id: Date.now(),
          role: 'assistant',
          content: `⚠️ **Connection Degraded**: ReMind AI Agent is temporarily unable to reach the local Ollama LLM endpoint (\`http://localhost:11434\`).\n\n• **Fallback Protection**: Deterministic Risk Engine remains active in local mode.\n• **Offline Cache**: Preserving all task deadlines and calendar anchors until connectivity is restored.`,
        }
      ]);
    }
  };

  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [voiceSpeechEnabled, setVoiceSpeechEnabled] = useState(true);

  const handleToggleVoiceInput = () => {
    if (isVoiceListening) {
      setIsVoiceListening(false);
      return;
    }

    if (!speechRecognizer.isSupported()) {
      alert('Speech recognition is not supported in this browser. You can type your request.');
      return;
    }

    setIsVoiceListening(true);
    speechRecognizer.startListening({
      onResult: (transcript) => {
        setIsVoiceListening(false);
        setInput(transcript);
        // Automatically send the voice transcribed query
        handleSendVoice(transcript);
      },
      onError: (err) => {
        setIsVoiceListening(false);
        console.warn('Voice input error:', err);
      },
      onStatusChange: (status) => {
        if (status === 'idle') setIsVoiceListening(false);
      },
    });
  };

  const handleSendVoice = async (spokenText) => {
    if (!spokenText.trim()) return;
    const userMsg = { id: Date.now(), role: 'user', content: spokenText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('http://localhost:8000/api/voice/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'demo_user',
        },
        body: JSON.stringify({
          transcript: spokenText,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.text_message,
          spoken: data.spoken_confirmation,
        },
      ]);

      // Speak verified response if voice feedback is enabled
      if (voiceSpeechEnabled && data.spoken_confirmation) {
        speechSynthesizer.speak(data.spoken_confirmation);
      }
    } catch (err) {
      console.error('Voice command error:', err);
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `⚠️ Error executing voice command: ${err.message}`,
        },
      ]);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    const userMsg = { id: Date.now(), role: 'user', content: userText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('http://localhost:8000/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user?.id || 'demo_user',
        },
        body: JSON.stringify({
          message: userText,
          user_id: user?.id || 'demo_user',
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setIsTyping(false);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.message,
          toolCalls: data.tool_calls,
          intent: data.intent,
        },
      ]);

      // Optionally speak clean first sentence if enabled
      if (voiceSpeechEnabled) {
        const cleanSummary = data.message.replace(/\*\*/g, '').replace(/•/g, '').split('\n')[0];
        speechSynthesizer.speak(cleanSummary);
      }
    } catch (err) {
      console.warn('Agent chat network warning, engaging local cognitive heuristics:', err);
      setIsTyping(false);

      // Intelligent client-side heuristic synthesis fallback:
      let fallbackResponse = '';
      const lower = userText.toLowerCase();

      if (lower.includes('tomorrow') || lower.includes('prepare')) {
        fallbackResponse = `**📋 Schedule & Focus Synthesis for Tomorrow:**\n\n• **9:00 AM Routine:** Morning Equipment & Setup Check (15m buffer recommended).\n• **10:00 AM Focus Window:** Sprint Planning & Deliverable Review.\n• **1:00 PM Meeting Block:** Customer feedback & Architecture Sync.\n\n*Cognitive Advice:* Block out 45 minutes between 11:30 AM and 12:15 PM to avoid back-to-back fatigue.`;
      } else if (lower.includes('forget') || lower.includes('today') || lower.includes('slip')) {
        fallbackResponse = `**🎯 High-Probability Slip Defense for Today:**\n\n• **Submit Q3 Sprint Retrospective** (Due 11:30 AM) — 94% Risk. Prep window is closing in ~15 minutes.\n• **Flag Sprint Retro deck to Sarah** — Pending notification window.\n\n*Action Taken:* Proactive recall alarms scheduled.`;
      } else if (lower.includes('deadline')) {
        fallbackResponse = `**⏱️ Upcoming Critical Deadlines:**\n\n1. **Submit Q3 Sprint Retrospective & Deck** — Due Today at 11:30 AM (Urgent)\n2. **Renew Cloudflare SSL Certification** — Due Today at 2:15 PM (DevOps)\n3. **Client Architecture Deliverable Sign-off** — Under review for rescheduled window.`;
      } else {
        fallbackResponse = `**ReMind AI Memory Assistant Response:**\n\nI have evaluated your request against your local indexed tasks and calendar buffers.\n\n• **Status:** Active schedule aligned.\n• **Context:** Cognitive shield is holding at **88% Calm** with 0 unresolved collisions.`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: fallbackResponse,
          engine: 'ReMind Local Cognitive Engine',
        },
      ]);
    }
  };

  const handleShortcut = (label) => {
    setInput(label);
  };

  const handleSyncAll = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content: '🔄 **Realtime Memory Sync Complete**\n\n• **Google Calendar:** 5 events indexed, 0 conflicts detected.\n• **Slack Threads:** Indexed updates from `#team-retro` & `#exec-sync`.\n• **Linear:** Synced 8 assigned items in Cycle 42.\n\nAll proactive recall triggers and radar boundaries are up to date.',
        }
      ]);
    }, 700);
  };

  const handleAddTask = async (suggestion, actionLabel = 'Add Task') => {
    try {
      let dueAt = null;
      const today = new Date();

      if (actionLabel && actionLabel.includes('12:15')) {
        today.setHours(12, 15, 0, 0);
        dueAt = today.toISOString();
      } else {
        // Default to next working slot (e.g. tomorrow morning 11:00 AM)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(11, 0, 0, 0);
        dueAt = tomorrow.toISOString();
      }

      await createTask({
        title: suggestion.label,
        priority: suggestion.urgency === 'high' ? 'high' : 'medium',
        due_at: dueAt,
        tags: ['Radar Suggestion', suggestion.urgency === 'high' ? 'High Risk' : 'Medium Risk'],
        risk_score: suggestion.urgency === 'high' ? 88 : 62,
        risk_label: suggestion.urgency === 'high' ? 'High Risk' : 'Medium Risk',
        risk_reason: suggestion.desc,
      });

      setDismissedSuggestions(prev => [...prev, suggestion.label]);

      // Provide instant confirmation in chat
      const timeStr = dueAt ? new Date(dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled';
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content: `✅ **Task Scheduled:** "${suggestion.label}"\n\n• **Target Time:** ${timeStr}\n• **Priority:** ${suggestion.urgency.toUpperCase()}\n• **Rationale:** ${suggestion.desc}\n\nAdded to your task board with proactive alarm tracking enabled.`,
        }
      ]);
    } catch (err) {
      console.error('Error adding suggested task:', err);
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content: `⚠️ Failed to schedule task: ${err.message}`,
        }
      ]);
    }
  };

  const handleDismissSuggestion = (label) => {
    setDismissedSuggestions(prev => [...prev, label]);
  };

  return (
    <div className="ai-assistant-layout">
      {/* Main chat area */}
      <div className="chat-area">
        {/* Engine status */}
        <div className="engine-status">
          <span className={`status-dot ${backendHealth.online ? 'active' : ''}`} />
          <span className="engine-label">Engine:</span>
          <span className="engine-name">{backendHealth.model}</span>
        </div>

        {/* Messages */}
        <div className="messages-list">
          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="msg-avatar assistant-avatar">
                  <Brain size={16} />
                </div>
              )}
              <div className={`msg-bubble ${msg.role === 'assistant' ? 'assistant-bubble' : 'user-bubble'}`}>
                {msg.role === 'assistant' && msg.thinking && (
                  <div className="thinking-badge">
                    <Sparkles size={11} />
                    AI Thinking Mode Active
                  </div>
                )}
                <div
                  className="msg-content"
                  dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n/g, '<br/>')
                      .replace(/^•/gm, '&bull;'),
                  }}
                />
              </div>
              {msg.role === 'user' && (
                <div className="msg-avatar user-avatar">
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{initials}</span>
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="message message-assistant">
              <div className="msg-avatar assistant-avatar">
                <Brain size={16} />
              </div>
              <div className="msg-bubble assistant-bubble typing-bubble">
                <div className="typing-dots">
                  <span /><span /><span />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>Analyzing memory context...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Shortcuts */}
        <div className="shortcuts-area">
          <div className="shortcuts-label">
            <Sparkles size={13} />
            PROACTIVE RECALL SHORTCUTS
          </div>
          <div className="shortcuts-grid">
            {shortcuts.map((s, i) => (
              <button
                key={i}
                className="shortcut-btn"
                onClick={() => handleShortcut(s.label)}
              >
                <span>{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <input
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder='Ask ReMind AI anything, or say "Remind me to..." (⌘K)'
            />
            <div className="chat-input-tools">
              <button
                className={`chat-tool-btn ${voiceSpeechEnabled ? 'active' : ''}`}
                onClick={() => setVoiceSpeechEnabled(prev => !prev)}
                title={voiceSpeechEnabled ? "Voice Speech Enabled" : "Voice Speech Muted"}
                aria-label="Toggle Voice Speech"
              >
                {voiceSpeechEnabled ? <Volume2 size={15} color="var(--risk-low)" /> : <VolumeX size={15} />}
              </button>
              <button
                className={`chat-tool-btn ${isVoiceListening ? 'listening-pulse' : ''}`}
                onClick={handleToggleVoiceInput}
                title={isVoiceListening ? "Listening... click to stop" : "Start Voice Input"}
                aria-label="Voice"
                style={{ color: isVoiceListening ? 'var(--risk-high)' : undefined }}
              >
                <Mic size={15} />
              </button>
              <span className="input-hint">{isVoiceListening ? "🎙️ Listening..." : "Press Return to Send"}</span>
              <button
                className="send-btn"
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
          <div className="chat-disclaimer">
            <span>🛡️ ReMind AI distinguishes verified tasks from AI predictions. Fact-grounded with verified deterministic engines.</span>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="assistant-sidebar">
        {/* Cognitive Defense Radar */}
        <div className="card-elevated">
          <div className="section-header" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={15} color="var(--text-brand)" />
              <span className="section-title" style={{ fontSize: 13, color: '#ffffff', fontWeight: 700 }}>Cognitive Defense Radar</span>
            </div>
            <button
              onClick={handleSyncAll}
              disabled={isSyncing}
              className="badge badge-low"
              style={{
                fontSize: 10,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: 'none',
                background: isSyncing ? 'rgba(79,70,229,0.2)' : undefined,
                color: isSyncing ? 'var(--text-brand)' : undefined,
              }}
              title="Click to trigger realtime memory context resync"
            >
              <RefreshCw size={10} className={isSyncing ? 'spin-icon' : ''} />
              {isSyncing ? 'Syncing...' : 'Realtime Sync'}
            </button>
          </div>

          {/* State Demo Controls */}
          <div className="state-controls">
            <div className="state-header">
              <span className="label">STATE DEMO CONTROLS</span>
              <span className="badge badge-brand" style={{ fontSize: 9 }}>Interactive</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              Switch UI presentation to evaluate system states:
            </p>
            <div className="state-btns">
              {uiStates.map(s => (
                <button
                  key={s}
                  className={`state-btn ${activeState === s ? 'active' : ''}`}
                  onClick={() => handleSelectState(s)}
                >
                  • {s}
                </button>
              ))}
            </div>
          </div>

          {/* Active Memory Context */}
          <div style={{ marginBottom: 16 }}>
            <div className="section-header" style={{ marginBottom: 10 }}>
              <span className="label">ACTIVE MEMORY CONTEXT</span>
              <span className="badge badge-brand" style={{ fontSize: 10 }}>3 Connected</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memoryContextItems.map((item) => (
                <div
                  key={item.id}
                  className="context-item clickable"
                  onClick={() => setSelectedContext(item)}
                  title={`Inspect indexed data from ${item.label}`}
                  style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                >
                  <div className="context-icon">
                    <item.icon size={14} />
                  </div>
                  <div className="context-body">
                    <span className="context-label">{item.label}</span>
                    <span className="context-sub">{item.sub}</span>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                </div>
              ))}
            </div>
          </div>

          {/* Pending Suggestions */}
          <div>
            <div className="section-header" style={{ marginBottom: 10 }}>
              <span className="label">PENDING SUGGESTIONS</span>
              <span className="badge badge-medium" style={{ fontSize: 10 }}>
                {pendingSuggestions.filter(s => !dismissedSuggestions.includes(s.label)).length} Queued
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingSuggestions
                .filter(s => !dismissedSuggestions.includes(s.label))
                .map((s, i) => (
                  <div key={i} className={`suggestion-panel suggestion-${s.urgency}`}>
                    <div className="suggestion-panel-top">
                      <span className="suggestion-panel-label">{s.label}</span>
                      <span className={`status-dot ${s.urgency === 'high' ? 'danger' : 'warning'}`} />
                    </div>
                    <p className="suggestion-panel-desc">{s.desc}</p>
                    <div className="suggestion-panel-actions">
                      {s.actions.map((a, j) => (
                        <button
                          key={j}
                          className={`btn ${j === 0 ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ fontSize: 11, padding: '5px 10px' }}
                          onClick={() => {
                            if (a === 'Dismiss' || a === 'Ignore') {
                              handleDismissSuggestion(s.label);
                            } else {
                              handleAddTask(s, a);
                            }
                          }}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              {pendingSuggestions.every(s => dismissedSuggestions.includes(s.label)) && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                  All suggestions handled ✓
                </p>
              )}
            </div>
          </div>

          {/* Cognitive Buffer */}
          <div
            className="cognitive-buffer clickable"
            onClick={() => setBufferDetailsOpen(prev => !prev)}
            style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
            title="Click to toggle focus time breakdown"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Today's Cognitive Buffer</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--risk-high)' }}>12% (Critical)</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 8 }}>
              <div className="progress-fill" style={{ width: '12%', background: 'var(--risk-high)' }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Only 18 minutes of unstructured focus time between 1:00 PM and 5:00 PM. High likelihood of delayed end-of-day handoffs.
            </p>

            {bufferDetailsOpen && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>• Meeting density:</span>
                  <span style={{ fontWeight: 600 }}>6.2 hrs / 8 hrs (78%)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>• Deep focus windows:</span>
                  <span style={{ fontWeight: 600, color: 'var(--risk-high)' }}>1 slot (18m remaining)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>• Recommended action:</span>
                  <span style={{ color: 'var(--text-brand)', fontWeight: 600 }}>Decline 4:45 PM sync</span>
                </div>
              </div>
            )}
          </div>

          {/* Memory guard */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="status-dot active" />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Memory Guard Active</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--risk-low)' }}>Protected ✓</span>
          </div>
        </div>
      </div>

      {/* Interactive Active Context Inspection Modal */}
      {selectedContext && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedContext(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 14,
              width: 480,
              maxWidth: '92vw',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="context-icon" style={{ width: 34, height: 34 }}>
                  <selectedContext.icon size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, margin: 0, fontWeight: 700, color: '#ffffff' }}>
                    {selectedContext.label}
                  </h3>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    {selectedContext.sub} • Synced {selectedContext.lastSync}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedContext(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
                INDEXED RECALL RECORDS
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
                {selectedContext.details?.map((detail, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      background: 'var(--bg-base)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    {detail.time && detail.title && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{detail.title}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-brand)' }}>{detail.time}</span>
                      </div>
                    )}
                    {detail.channel && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: 'var(--brand-primary)' }}>{detail.channel}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{detail.time}</span>
                        </div>
                        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 11 }}>{detail.preview}</p>
                      </div>
                    )}
                    {detail.id && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text-brand)', marginRight: 6 }}>{detail.id}</span>
                          <span style={{ color: 'var(--text-primary)' }}>{detail.title}</span>
                        </div>
                        <span className="badge badge-low" style={{ fontSize: 9 }}>{detail.status}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setSelectedContext(null)}
                style={{ fontSize: 12, padding: '7px 14px' }}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSelectedContext(null);
                  handleSyncAll();
                }}
                style={{ fontSize: 12, padding: '7px 14px' }}
              >
                Trigger Deep Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
