# ReMind AI Personalization Layer (Phase 12)

## Overview

The Personalization Layer derives conservative, evidence-based user behavioral profiles from verified historical interactions recorded in Phase 11.

**Core Philosophy:**
> *Same intelligence, different behavior based on demonstrated user patterns.*

---

## Architectural Principles

1. **Deterministic Personalization Engine:** Does **NOT** use an LLM to guess habits or calculate profiles.
2. **Strict Hierarchy:**
   ```text
   Explicit User Preference
          ↓
   Safety / Anti-Spam Constraints
          ↓
   Reminder Decision Engine
          ↓
   Personalization
          ↓
   Default Behavior
   ```
3. **Data Sufficiency Gating:**
   - `NONE` (< 3 events): Zero personalization; sensible defaults active.
   - `LIMITED` (3–9 events): Minimal, conservative adjustments.
   - `MODERATE` (10–19 events): Category lead time and voice preference adjustments active.
   - `SUFFICIENT` (20+ events): Comprehensive operational personalization.
4. **Zero Double-Counting:** The Risk Engine calculates forgetfulness risk scores (0–100) independently. Personalization influences **intervention timing and channels**, never silently modifying underlying risk mathematics.

---

## Implemented Deterministic Rules

- **Category Postponement Lead Time:** If a category has $\ge 2$ observed tasks with $\ge 50\%$ postponement rate, lead time is increased to 6 hours (360 minutes) to give the user an adequate focus buffer.
- **Channel Responsiveness:** If $\ge 3$ voice events are observed with active engagement, voice notifications are prioritized in the delivery channels (provided the user has not explicitly disabled voice).
- **Reminder Fatigue Detection:** If $\ge 5$ notifications are delivered with $\ge 60\%$ snooze/dismissal rate and $< 20\%$ completion rate, low-risk proactive alerts are throttled.

---

## Safe Reset Mechanism

Users can reset inferred personalization via `POST /api/personalization/reset` or the UI in **Settings > Personalization & Learning**.
- Clears inferred rules, category lead times, and fatigue flags.
- Restores defaults (`120m` lead time, standard channels).
- Leaves immutable historical events in Phase 11 completely intact.

---

## API Endpoints

- `GET /api/personalization`: Retrieves the user's verified behavioral profile, evidence level, recommended lead time, and active rules.
- `POST /api/personalization/reset`: Resets inferred personalization back to defaults.
