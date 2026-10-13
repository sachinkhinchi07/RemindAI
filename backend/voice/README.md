# Voice & Gesture Interaction Layer (Pre-Phase 10)

## 1. Overview
The **Voice & Gesture Interaction Layer** provides multimodal hands-free interaction for task capture, AI Agent dialogue, voice-driven task completion, snoozing/dismissal, and spoken reminders without duplicating or compromising the core architecture:

```text
Voice / Gesture Modality
        ↓
Normalized Interaction (VoiceTranscriptionRequest / GestureActionRequest)
        ↓
Existing Business Services (NLP Parser, Agent Orchestrator, Task Store)
        ↓
Verified Execution & Spoken Confirmation (Text-to-Speech)
```

---

## 2. Voice Architecture
- **Speech-to-Text (STT):** Implemented in [`src/lib/voiceService.js`](file:///C:/Users/user/Desktop/Remind AI/Remind AI/src/lib/voiceService.js) via `BrowserSpeechRecognitionProvider`. Uses Web Speech API with fallback error handling (`not-allowed`, `no-speech`). Temporary audio is processed on the client and discarded immediately (no raw audio storage).
- **Text-to-Speech (TTS):** Implemented via `BrowserTextToSpeechProvider` (`window.speechSynthesis`). Generates speech **only** from verified application data and backend confirmations.
- **Backend Voice Service:** Located in [`backend/voice/`](file:///C:/Users/user/Desktop/Remind AI/Remind AI/backend/voice/). Routes transcribed text to:
  1. **Task Completion:** Identifies and marks tasks `done` via `AgentOrchestrator`.
  2. **Snooze/Dismiss:** Schedules a snoozed reminder (30 mins) or dismisses active alerts without changing task state.
  3. **Agent Queries:** Answers *"What might I forget today?"* or *"Remind me about the task that looks most risky"* and returns concise speech strings.
  4. **Task Parsing:** Forwards raw statements to Phase 4 `TaskUnderstandingService` for structured attribute extraction.

---

## 3. Gesture Architecture
- Defined via `GestureActionRequest` and `GestureActionResponse` in [`backend/voice/models.py`](file:///C:/Users/user/Desktop/Remind AI/Remind AI/backend/voice/models.py).
- Supported mappings:
  - `thumbs_up`: Marks active target task as completed (`COMPLETE_TASK`).
  - `open_palm`: Dismisses active reminder (`DISMISS_REMINDER`).
  - `two_fingers`: Snoozes active reminder for 15 minutes (`SNOOZE_REMINDER`).
- **Safety Guard:** Requests with confidence $< 0.70$ are safely rejected with zero database mutation.

---

## 4. API Endpoints
- `POST /api/voice/command`: Receives transcript, identifies action, executes through Agent/store, returns structured response and `spoken_confirmation`.
- `POST /api/voice/gesture`: Receives normalized camera gesture and confidence, validates threshold and user ownership, and executes action safely.

---

## 5. Security & Privacy
- **Privacy:** No raw audio recordings are stored on disk or sent over external networks.
- **Authorization:** Every voice/gesture request requires an authenticated `user_id`. Attempting to complete or snooze another user's task via gesture or voice is rejected.
- **Suppression:** Once marked `done`, the Reminder Decision Engine automatically blocks new proactive reminders for that task.
