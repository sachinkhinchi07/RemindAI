import { useState, useEffect, useRef } from 'react';
import { Bell, Clock, Check, AlertTriangle, X, Volume2 } from 'lucide-react';
import { getTasks, completeTask, updateTask } from '../lib/db';
import './TaskAlarmManager.css';

/**
 * Synthesizes a high-intensity, piercing digital alarm using dual oscillators.
 * Uses sawtooth + sine waves at full gain to create an unmistakable, loud alarm sound.
 */
export function playAlarmChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // Ensure audio context is active
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Function to produce one punchy, loud digital alarm beep
    const playBeep = (startTime, freq = 980, duration = 0.12) => {
      // Primary Oscillator (Sawtooth for sharp, cutting edge)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(freq, startTime);
      gain1.gain.setValueAtTime(0.75, startTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(startTime);
      osc1.stop(startTime + duration);

      // Secondary Oscillator (Square wave for high-decibel acoustic presence)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(freq * 1.5, startTime); // Fifth harmonic
      gain2.gain.setValueAtTime(0.55, startTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(startTime);
      osc2.stop(startTime + duration);

      // Bass punch for physical presence
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(freq * 0.5, startTime);
      gain3.gain.setValueAtTime(0.6, startTime);
      gain3.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(startTime);
      osc3.stop(startTime + duration);
    };

    const now = ctx.currentTime + 0.05;

    // 3 complete cycles of rapid 4-beep digital emergency alarm
    for (let cycle = 0; cycle < 3; cycle++) {
      const cycleStart = now + cycle * 1.05;
      playBeep(cycleStart + 0.0, 920, 0.12);
      playBeep(cycleStart + 0.16, 920, 0.12);
      playBeep(cycleStart + 0.32, 920, 0.12);
      playBeep(cycleStart + 0.48, 1200, 0.22); // Accent high pitch beep
    }
  } catch (err) {
    console.warn('Could not synthesize loud alarm:', err);
  }
}

/**
 * Speaks task title using Web Speech API synthesis at maximum volume
 */
export function speakAlarmUtterance(taskTitle) {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = `Attention! Your task, ${taskTitle}, is due right now!`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = 1.0; // 100% maximum volume
      utterance.rate = 1.05;
      utterance.pitch = 1.15;
      window.speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.warn('TTS speech error:', err);
  }
}

export default function TaskAlarmManager() {
  const [activeAlarmTask, setActiveAlarmTask] = useState(null);
  const firedAlarmsRef = useRef(new Set());

  useEffect(() => {
    // Request notification permission once if unprompted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const checkDueTasks = async () => {
      try {
        const { data: tasks, error } = await getTasks();
        if (error || !tasks) return;

        const now = Date.now();

        for (const task of tasks) {
          if (task.status === 'done' || task.status === 'completed') continue;
          if (!task.due_at) continue;

          const dueTime = new Date(task.due_at).getTime();
          if (isNaN(dueTime)) continue;

          // Check if due time has arrived (within the past 2 hours or due right now)
          if (now >= dueTime && now - dueTime <= 2 * 60 * 60 * 1000) {
            const alarmKey = `${task.id}_${task.due_at}`;

            if (!firedAlarmsRef.current.has(alarmKey)) {
              firedAlarmsRef.current.add(alarmKey);

              // 1. Play audible sound chime
              playAlarmChime();

              // 2. Announce via voice TTS
              speakAlarmUtterance(task.title || 'Your scheduled task');

              // 3. Desktop Native Notification
              if ('Notification' in window && Notification.permission === 'granted') {
                try {
                  new Notification(`⏰ ReMind AI: Task Due Now!`, {
                    body: `${task.title} is scheduled for right now.`,
                    icon: '/favicon.ico',
                  });
                } catch {
                  // ignore desktop notification errors
                }
              }

              // 4. Show visual floating alarm modal
              setActiveAlarmTask(task);
              break;
            }
          }
        }
      } catch (err) {
        console.warn('Alarm checker error:', err);
      }
    };

    // Run immediately, then check every 3 seconds
    checkDueTasks();
    const interval = setInterval(checkDueTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!activeAlarmTask) return null;

  const handleMarkDone = async () => {
    if (activeAlarmTask?.id) {
      await completeTask(activeAlarmTask.id);
    }
    setActiveAlarmTask(null);
  };

  const handleSnooze = async (minutes = 5) => {
    if (activeAlarmTask?.id) {
      const newDue = new Date(Date.now() + minutes * 60 * 1000).toISOString();
      await updateTask(activeAlarmTask.id, { due_at: newDue });
    }
    setActiveAlarmTask(null);
  };

  return (
    <div className="alarm-overlay-banner" role="alert">
      <div className="alarm-banner-top">
        <div className="alarm-badge-pulse">
          <Bell size={12} className="alarm-bell-icon" />
          <span>⏰ Task Alarm • Due Now</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="alarm-btn-snooze"
            style={{ padding: '3px 8px', fontSize: 11, gap: 4 }}
            onClick={() => {
              playAlarmChime();
              speakAlarmUtterance(activeAlarmTask.title);
            }}
            title="Replay Loud Alarm"
          >
            <Volume2 size={12} color="#ef4444" /> Replay
          </button>
          <button
            className="alarm-btn-dismiss-x"
            onClick={() => setActiveAlarmTask(null)}
            aria-label="Dismiss alarm banner"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <div>
        <h4 className="alarm-task-title">{activeAlarmTask.title}</h4>
        <div className="alarm-task-time-note" style={{ marginTop: 4 }}>
          <Clock size={12} color="#fca5a5" />
          <span>
            Due at {new Date(activeAlarmTask.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="alarm-actions-row">
        <button className="alarm-btn-done" onClick={handleMarkDone}>
          <Check size={14} strokeWidth={2.5} /> Mark Done
        </button>
        <button className="alarm-btn-snooze" onClick={() => handleSnooze(5)}>
          <Clock size={12} /> Snooze 5m
        </button>
        <button
          className="alarm-btn-snooze"
          style={{ padding: '8px 10px', fontSize: 11 }}
          onClick={() => setActiveAlarmTask(null)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
