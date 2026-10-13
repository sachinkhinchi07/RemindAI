"""
Weights, thresholds, and constants for the Deterministic Forgetfulness Risk Engine.
"""

# Risk Score Thresholds (Normalized 0 to 100)
THRESHOLD_LOW_MAX = 29
THRESHOLD_MEDIUM_MAX = 59
# 0 - 29: LOW
# 30 - 59: MEDIUM
# 60 - 100: HIGH

# Component Weights (Max contributions to score)
# Base score for any uncompleted task
BASE_SCORE = 10

# Deadline Proximity Weights (Max +35)
DEADLINE_WEIGHT_OVERDUE = 35
DEADLINE_WEIGHT_CRITICAL_HOURS = 30  # Due within 4 hours
DEADLINE_WEIGHT_TODAY = 25           # Due within 24 hours
DEADLINE_WEIGHT_TOMORROW = 18        # Due within 48 hours
DEADLINE_WEIGHT_THIS_WEEK = 10       # Due within 7 days
DEADLINE_WEIGHT_FAR = 2              # Due > 7 days

# Priority Weights (Max +25)
PRIORITY_WEIGHT_URGENT = 25
PRIORITY_WEIGHT_HIGH = 18
PRIORITY_WEIGHT_MEDIUM = 8
PRIORITY_WEIGHT_LOW = 0

# Priority Safety Floors (Guaranteed minimum risk scores for critical commitments)
PRIORITY_FLOOR_URGENT = 75  # Guaranteed HIGH / CRITICAL Tier
PRIORITY_FLOOR_HIGH = 60    # Guaranteed HIGH Tier

# Historical Postponements / Snoozes (Max +20)
POSTPONE_WEIGHT_PER_INCIDENT = 6
POSTPONE_MAX_CONTRIBUTION = 20

# Historical Misses / Overdue completions (Max +20)
MISS_WEIGHT_PER_INCIDENT = 10
MISS_MAX_CONTRIBUTION = 20

# Task Complexity / Preparation Requirements (Max +10)
PREP_ITEM_WEIGHT = 3
PREP_MAX_CONTRIBUTION = 10

# Data Sufficiency Thresholds (Based on total recorded user actions)
SUFFICIENCY_MIN_RECORDS_MODERATE = 3
SUFFICIENCY_MIN_RECORDS_SUFFICIENT = 8
