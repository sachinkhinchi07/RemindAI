# ReMind AI Forgetfulness Risk Engine Documentation

## 1. Overview & Principle
The Forgetfulness Risk Engine is a **deterministic, rule-based cognitive scoring system**. 

**Core Principle:**
> LLMs are used for natural language understanding and task extraction.  
> **LLMs are NOT used to calculate or invent risk scores.**  
> Risk calculations are mathematical, transparent, reproducible, and explainable.

The risk score is a **heuristic risk score** (0 to 100), not a scientifically validated probability.

---

## 2. Risk Signals & Weighting Breakdown

The scoring formula calculates a baseline and sums non-overlapping, bounded signals:

$$\text{Final Score} = \min(100, \max(0, \text{Base} + S_{\text{deadline}} + S_{\text{priority}} + S_{\text{prep}} + S_{\text{postpone}} + S_{\text{miss}}))$$

| Signal Name | Max Impact | Description |
|---|---|---|
| **Base Risk** | +10 | Baseline score for any active uncompleted task |
| **Deadline Proximity** | +35 | Evaluates remaining duration until deadline (Overdue: +35, <4h: +30, <24h: +25, <48h: +18, <7d: +10, >7d: +2) |
| **Task Priority** | +25 | Urgent: +25, High: +18, Medium: +8, Low: +0 |
| **Preparation Complexity** | +10 | Evaluates physical/digital preparation items (+3 per item, capped at +10) |
| **Historical Postponements** | +20 | User snoozes or reschedules on similar tasks (+6 per incident, capped at +20) |
| **Historical Misses** | +20 | Overdue and missed tasks (+10 per incident, capped at +20) |

---

## 3. Categorical Risk Thresholds

- **LOW:** 0 to 29
- **MEDIUM:** 30 to 59
- **HIGH:** 60 to 100

*Completed tasks immediately evaluate to 0 / LOW.*

---

## 4. Data Sufficiency Concept

New users do not have established historical behavior. The engine explicitly differentiates sufficiency:
- **`limited`:** Less than 3 historical task records. Explanations state that the score is derived primarily from deadlines and priorities without personalization.
- **`moderate`:** 3 to 7 records.
- **`sufficient`:** 8 or more records. Full behavioral weight is applied.

---

## 5. Upgrade Path to Machine Learning

When sufficient user interaction logs (actual completion times, snoozes, dismissals, contextual calendar load) are accumulated:
1. The deterministic engine can serve as the **baseline heuristic feature extractor**.
2. A lightweight classifier (e.g. Logistic Regression or Gradient Boosted Trees) can be trained on actual task outcome labels ($y \in \{0, 1\}$).
3. The deterministic explanation layer ensures explainability is preserved even when model weights are learned.
