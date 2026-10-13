import re
from datetime import datetime, date, time, timedelta
from typing import Optional, Tuple
import pytz

WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}

def parse_time_expression(time_str: Optional[str]) -> Optional[time]:
    """Parse common time expressions like '10 AM', '10:30 PM', '14:00', 'morning', 'evening'."""
    if not time_str:
        return None

    cleaned = time_str.strip().lower()

    # Generic periods
    if "morning" in cleaned:
        return time(9, 0)
    if "noon" in cleaned or "midday" in cleaned:
        return time(12, 0)
    if "afternoon" in cleaned:
        return time(14, 0)
    if "evening" in cleaned:
        return time(18, 0)
    if "night" in cleaned:
        return time(20, 0)

    # Match 10 AM / 10:30 PM / 10am / 2:15pm
    match_12h = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)", cleaned)
    if match_12h:
        hour = int(match_12h.group(1))
        minute = int(match_12h.group(2) or 0)
        meridiem = match_12h.group(3)

        if meridiem == "pm" and hour != 12:
            hour += 12
        elif meridiem == "am" and hour == 12:
            hour = 0
        return time(hour, minute)

    # Match 24h: 14:30 or 09:00
    match_24h = re.search(r"(\d{1,2}):(\d{2})", cleaned)
    if match_24h:
        hour = int(match_24h.group(1))
        minute = int(match_24h.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return time(hour, minute)

    # Match standalone digit if reasonable hour (e.g. "at 10")
    match_digit = re.search(r"\b(\d{1,2})\b", cleaned)
    if match_digit:
        hour = int(match_digit.group(1))
        if 1 <= hour <= 12:
            # Assume AM for morning-like hours, PM otherwise if > 6
            return time(hour if hour >= 8 else hour + 12, 0)

    return None


def resolve_relative_date(
    date_expr: Optional[str],
    reference_dt: datetime,
) -> Optional[date]:
    """
    Resolve natural language relative date expression against reference date.
    E.g., 'tomorrow', 'tonight', 'next Monday', 'in 2 days', 'Friday'.
    """
    if not date_expr:
        return None

    cleaned = date_expr.strip().lower()
    ref_date = reference_dt.date()

    if "today" in cleaned or "tonight" in cleaned or "this evening" in cleaned:
        return ref_date

    if "tomorrow" in cleaned:
        return ref_date + timedelta(days=1)

    if "day after tomorrow" in cleaned:
        return ref_date + timedelta(days=2)

    # "in X days"
    in_days_match = re.search(r"in\s+(\d+)\s+days?", cleaned)
    if in_days_match:
        return ref_date + timedelta(days=int(in_days_match.group(1)))

    # Weekday matching: "next Monday", "this Friday", "Friday"
    for day_name, day_idx in WEEKDAYS.items():
        if day_name in cleaned:
            current_day_idx = ref_date.weekday()
            days_ahead = day_idx - current_day_idx
            if days_ahead <= 0:  # Target day already happened this week
                days_ahead += 7
            if "next" in cleaned and days_ahead < 7:
                days_ahead += 7
            return ref_date + timedelta(days=days_ahead)

    # Check for direct ISO-like YYYY-MM-DD
    iso_match = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", cleaned)
    if iso_match:
        try:
            return date(int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3)))
        except ValueError:
            pass

    return None


def resolve_datetime(
    date_expr: Optional[str],
    time_expr: Optional[str],
    reference_dt: Optional[datetime] = None,
    user_tz_name: Optional[str] = None,
) -> Tuple[Optional[datetime], Optional[str], Optional[str]]:
    """
    Resolves date and time expressions to a timezone-aware ISO string and human readable strings.
    Returns: (resolved_datetime, formatted_date_str, formatted_time_str)
    """
    # Establish user timezone with UTC fallback
    try:
        tz = pytz.timezone(user_tz_name) if user_tz_name else pytz.UTC
    except Exception:
        tz = pytz.UTC

    if reference_dt is None:
        reference_dt = datetime.now(tz)
    elif reference_dt.tzinfo is None:
        reference_dt = tz.localize(reference_dt)

    resolved_date = resolve_relative_date(date_expr, reference_dt)
    resolved_time = parse_time_expression(time_expr)

    if not resolved_date:
        return None, None, resolved_time.strftime("%I:%M %p") if resolved_time else None

    # Date string representation
    date_str = resolved_date.strftime("%A, %b %d, %Y")
    time_str = resolved_time.strftime("%I:%M %p") if resolved_time else None

    # If time wasn't specified, default to 09:00 AM on target date for timestamp calculation
    calc_time = resolved_time or time(9, 0)
    target_dt = tz.localize(datetime.combine(resolved_date, calc_time))

    return target_dt, date_str, time_str
