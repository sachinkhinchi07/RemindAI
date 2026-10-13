/**
 * Lightweight Client-Side NLP Date & Time Parser for Remind AI
 * Extracts dates, times, relative terms, and yields structured task metadata.
 */

export function parseNaturalDateTime(text) {
  if (!text || typeof text !== 'string') {
    return {
      hasParsed: false,
      title: '',
      dateStr: null,
      timeStr: null,
      isoDate: null,
      formattedTime: null,
      dateLabel: null,
    };
  }

  const raw = text.trim();
  let clean = raw;
  let detectedDate = null;
  let detectedTime = null;
  let dateLabel = null;

  const now = new Date();
  let targetDate = new Date();

  // 1. Time patterns:
  // e.g., 3:30 pm, 3:30pm, 11:15am, 3pm, 4 pm, 14:00, 9am, at 5
  const timeRegexes = [
    // 3:30 pm / 03:30am / 14:30
    /\b(?:at\s+)?([0-1]?[0-9]|2[0-3]):([0-5][0-9])\s*(am|pm)?\b/i,
    // 3pm / 4 pm / 11am (without minutes)
    /\b(?:at\s+)?([1-9]|1[0-2])\s*(am|pm)\b/i,
    // at 3 / at 11 (assume daytime hour)
    /\bat\s+([1-9]|1[0-2])\b/i,
    // relative day parts: in the morning, this afternoon, tonight, after lunch, evening
    /\b(after lunch|in the morning|this morning|this afternoon|in the afternoon|tonight|this evening|in the evening|at night)\b/i
  ];

  let timeMatch = null;
  let matchedTimePhrase = '';

  // Check 1: HH:MM am/pm
  const m1 = raw.match(/\b(?:at\s+)?([0-1]?[0-9]|2[0-3]):([0-5][0-9])\s*(am|pm)?\b/i);
  if (m1) {
    let hours = parseInt(m1[1], 10);
    const minutes = parseInt(m1[2], 10);
    const meridiem = m1[3] ? m1[3].toLowerCase() : null;

    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    const displayMeridiem = hours >= 12 ? 'PM' : 'AM';
    const displayMinutes = minutes.toString().padStart(2, '0');

    detectedTime = `${displayHours}:${displayMinutes} ${displayMeridiem}`;
    matchedTimePhrase = m1[0];
  }

  // Check 2: 3pm / 4 pm (no minutes)
  if (!detectedTime) {
    const m2 = raw.match(/\b(?:at\s+)?([1-9]|1[0-2])\s*(am|pm)\b/i);
    if (m2) {
      let hours = parseInt(m2[1], 10);
      const meridiem = m2[2].toLowerCase();
      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      const displayHours = hours % 12 === 0 ? 12 : hours % 12;
      const displayMeridiem = hours >= 12 ? 'PM' : 'AM';
      detectedTime = `${displayHours}:00 ${displayMeridiem}`;
      matchedTimePhrase = m2[0];
    }
  }

  // Check 3: "at 4", "at 10"
  if (!detectedTime) {
    const m3 = raw.match(/\bat\s+([1-9]|1[0-2])\b/i);
    if (m3) {
      const hours = parseInt(m3[1], 10);
      // Heuristic: if hours <= 7, likely evening (PM); else if 8-11 likely AM/PM based on context
      const isPm = hours < 8; // e.g. "at 3" -> 3 PM, "at 10" -> 10 AM
      const meridiem = isPm ? 'PM' : 'AM';
      detectedTime = `${hours}:00 ${meridiem}`;
      matchedTimePhrase = m3[0];
    }
  }

  // Check 4: Day parts (after lunch, tonight, morning, afternoon)
  if (!detectedTime) {
    const m4 = raw.match(/\b(after lunch|in the morning|this morning|this afternoon|in the afternoon|tonight|this evening|in the evening|at night)\b/i);
    if (m4) {
      const part = m4[1].toLowerCase();
      if (part === 'after lunch') {
        detectedTime = '1:30 PM';
      } else if (part.includes('morning')) {
        detectedTime = '9:00 AM';
      } else if (part.includes('afternoon')) {
        detectedTime = '2:30 PM';
      } else if (part === 'tonight' || part.includes('evening') || part === 'at night') {
        detectedTime = '7:30 PM';
      }
      matchedTimePhrase = m4[0];
    }
  }

  // 2. Date patterns:
  // today, tomorrow, day after tomorrow, next [day], on [day], in [X] days
  let matchedDatePhrase = '';

  const dayMap = {
    sunday: 0, sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thur: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6,
  };

  if (/\bday after tomorrow\b/i.test(raw)) {
    const m = raw.match(/\bday after tomorrow\b/i);
    targetDate.setDate(now.getDate() + 2);
    dateLabel = 'In 2 Days';
    matchedDatePhrase = m[0];
  } else if (/\btomorrow\b/i.test(raw)) {
    const m = raw.match(/\btomorrow\b/i);
    targetDate.setDate(now.getDate() + 1);
    dateLabel = 'Tomorrow';
    matchedDatePhrase = m[0];
  } else if (/\btoday\b/i.test(raw)) {
    const m = raw.match(/\btoday\b/i);
    dateLabel = 'Today';
    matchedDatePhrase = m[0];
  } else if (/\bin\s+(\d+)\s+days?\b/i.test(raw)) {
    const m = raw.match(/\bin\s+(\d+)\s+days?\b/i);
    const numDays = parseInt(m[1], 10);
    targetDate.setDate(now.getDate() + numDays);
    dateLabel = `In ${numDays} Days`;
    matchedDatePhrase = m[0];
  } else {
    // Check weekday: "on Friday", "this Friday", "next Monday"
    const weekdayMatch = raw.match(/\b(?:on\s+|this\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i);
    if (weekdayMatch) {
      const dayName = weekdayMatch[1].toLowerCase();
      const targetDay = dayMap[dayName];
      if (targetDay !== undefined) {
        const currentDay = now.getDay();
        let diff = (targetDay - currentDay + 7) % 7;
        if (diff === 0) diff = 7; // next week's occurrence if requested today
        targetDate.setDate(now.getDate() + diff);
        dateLabel = targetDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        matchedDatePhrase = weekdayMatch[0];
      }
    }
  }

  // Remove matched date/time phrases from the title cleanly
  if (matchedDatePhrase) {
    clean = clean.replace(new RegExp(`\\b${escapeRegExp(matchedDatePhrase)}\\b`, 'gi'), ' ');
  }
  if (matchedTimePhrase) {
    clean = clean.replace(new RegExp(escapeRegExp(matchedTimePhrase), 'gi'), ' ');
  }

  // Clean conversational prefixes: "remind me to", "remember to", "schedule", "please", "set reminder to"
  clean = clean
    .replace(/^remind\s+me\s+to\s+/i, '')
    .replace(/^remember\s+to\s+/i, '')
    .replace(/^schedule\s+/i, '')
    .replace(/^set\s+a?\s*reminder\s+(to|for)?\s*/i, '')
    .replace(/^please\s+/i, '')
    .replace(/^don't\s+forget\s+to\s+/i, '')
    .replace(/^dont\s+forget\s+to\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize first letter of title
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  } else {
    clean = raw;
  }

  const hasParsed = Boolean(detectedTime || dateLabel);
  const isoDate = (dateLabel || detectedTime) ? targetDate.toISOString().split('T')[0] : null;

  // Construct precise ISO timestamp for reminder syncing
  let targetIsoTimestamp = null;
  if (detectedTime) {
    const timeMatch = detectedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      const mer = timeMatch[3].toUpperCase();
      if (mer === 'PM' && h < 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      const combined = new Date(targetDate);
      combined.setHours(h, m, 0, 0);
      targetIsoTimestamp = combined.toISOString();
    }
  } else if (isoDate) {
    const combined = new Date(targetDate);
    combined.setHours(9, 0, 0, 0); // default to 9 AM on target day
    targetIsoTimestamp = combined.toISOString();
  }

  return {
    hasParsed,
    cleanTitle: clean || raw,
    rawText: raw,
    timeStr: detectedTime,
    dateStr: isoDate,
    dateLabel: dateLabel || (detectedTime ? 'Today' : null),
    targetIsoTimestamp,
  };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
