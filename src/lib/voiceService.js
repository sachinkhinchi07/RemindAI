/**
 * Web Speech API and Fallback Speech-to-Text & Text-to-Speech Provider.
 * Modular, replaceable abstractions with clean error state management.
 */

// ─── 1. SPEECH RECOGNITION (STT) ─────────────────────────────────────────────

export class BrowserSpeechRecognitionProvider {
  constructor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;
    this.supported = Boolean(SpeechRecognition);
    this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }
  }

  isSupported() {
    return this.supported;
  }

  /**
   * Listen to microphone input and resolve with transcribed text string.
   * Calls onStatusChange with: 'listening' | 'processing' | 'idle' | 'error'
   */
  startListening({ onResult, onError, onStatusChange }) {
    if (!this.supported) {
      if (onError) onError('Speech recognition is not supported in this browser.');
      return () => {};
    }

    let finished = false;

    this.recognition.onstart = () => {
      if (onStatusChange) onStatusChange('listening');
    };

    this.recognition.onresult = (event) => {
      finished = true;
      if (onStatusChange) onStatusChange('processing');
      const transcript = event.results[0][0].transcript;
      if (onResult) onResult(transcript);
      if (onStatusChange) onStatusChange('idle');
    };

    this.recognition.onerror = (event) => {
      finished = true;
      let msg = event.error || 'Speech recognition error';
      if (event.error === 'not-allowed') {
        msg = 'Microphone access is unavailable. You can type instead.';
      } else if (event.error === 'no-speech') {
        msg = 'No speech was detected. Please try again.';
      }
      if (onError) onError(msg);
      if (onStatusChange) onStatusChange('error');
    };

    this.recognition.onend = () => {
      if (!finished && onStatusChange) {
        onStatusChange('idle');
      }
    };

    try {
      this.recognition.start();
    } catch (err) {
      if (onError) onError(err.message);
      if (onStatusChange) onStatusChange('error');
    }

    return () => {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore already stopped
      }
    };
  }
}

// ─── 2. TEXT-TO-SPEECH (TTS) ─────────────────────────────────────────────────

export class BrowserTextToSpeechProvider {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  isSupported() {
    return this.supported;
  }

  speak(text, { rate = 1.0, pitch = 1.0, onStart, onEnd, onError } = {}) {
    if (!this.supported || !text) {
      if (onError) onError('Text-to-speech is not supported in this browser.');
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any pending utterances
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.lang = 'en-US';

      if (onStart) utterance.onstart = onStart;
      if (onEnd) utterance.onend = onEnd;
      if (onError) utterance.onerror = (e) => onError(e.error);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      if (onError) onError(err.message);
    }
  }

  stop() {
    if (this.supported) {
      window.speechSynthesis.cancel();
    }
  }
}

// Global default singletons
export const speechRecognizer = new BrowserSpeechRecognitionProvider();
export const speechSynthesizer = new BrowserTextToSpeechProvider();
