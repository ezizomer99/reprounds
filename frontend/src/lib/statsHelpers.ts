import type { Session } from '@app/shared';
import { parseLocalDate, toISODate } from './calendar';

/** Return the Monday (00:00:00 local) of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

/**
 * Local `YYYY-MM-DD` for a Date.
 *
 * Never `toISOString()` here: it converts to UTC first, so a local Monday
 * 00:00 in any timezone ahead of UTC formats as the previous Sunday. Half this
 * file used to do that and half deliberately didn't — the two conventions
 * agreed only by accident, and every caller that mixed them was off by a day.
 */
function localISO(d: Date): string {
  return toISODate(d.getFullYear(), d.getMonth(), d.getDate());
}

/** ISO date (local) of the Monday of the week containing `d`. */
export function mondayISO(d: Date = new Date()): string {
  return localISO(mondayOf(d));
}

/**
 * ISO date (local) of the Monday *after* the week containing `d` — the exclusive
 * upper bound of "this week".
 *
 * Every client-side weekly count is bounded `[monday, nextMonday)`; the server
 * windows were open-ended, so a session dated ahead of this week counted as
 * trained inside it. This is what callers send as the `until` bound.
 */
export function nextMondayISO(d: Date = new Date()): string {
  const m = mondayOf(d);
  m.setDate(m.getDate() + 7);
  return localISO(m);
}

/** ISO date (YYYY-MM-DD) of the Monday of the week containing `isoDate`. */
export function weekKey(isoDate: string): string {
  return mondayISO(parseLocalDate(isoDate));
}

/**
 * Consecutive weeks (including the current week) with at least one completed
 * session. The current week not yet trained does not break the streak (grace).
 */
export function computeWeekStreak(dates: string[]): number {
  const activeWeeks = new Set(dates.map(weekKey));
  const curMonday = mondayOf(new Date());
  let streak = 0;
  for (let w = 0; w < 520; w++) {
    const wk = new Date(curMonday);
    wk.setDate(curMonday.getDate() - w * 7);
    if (activeWeeks.has(localISO(wk))) streak++;
    else if (w === 0) continue; // grace for the current week
    else break;
  }
  return streak;
}

/**
 * Number of sessions in the current (Monday-aligned) week. Bounded at both
 * ends: an open-ended `>= monday` also counted anything dated *ahead* of this
 * week, so a scheduled session inflated the count.
 */
export function sessionsThisWeek(sessions: Session[]): number {
  const monday = mondayOf(new Date());
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return sessions.filter((s) => {
    const d = parseLocalDate(s.date);
    return d >= monday && d < nextMonday;
  }).length;
}

/**
 * Average sessions per week over the last `weeks` weeks (1 decimal).
 *
 * Divides by the weeks actually covered by the user's history, capped at the
 * window — not by the window itself. Someone two weeks into the app who trains
 * twice a week was shown "1.0/week" against a fixed 4-week divisor, which reads
 * as a slump rather than a start.
 */
export function avgPerWeek(sessions: Session[], weeks = 4): number {
  if (!sessions.length) return 0;
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const recent = sessions.filter((s) => parseLocalDate(s.date) >= cutoff);
  if (!recent.length) return 0;

  const oldest = recent.reduce((min, s) => (s.date < min ? s.date : min), recent[0].date);
  const daysCovered = (now.getTime() - parseLocalDate(oldest).getTime()) / 86_400_000;
  const weeksCovered = Math.min(weeks, Math.max(1, Math.ceil((daysCovered + 1) / 7)));
  return Math.round((recent.length / weeksCovered) * 10) / 10;
}

/**
 * ISO date (local) of the Monday `weeks - 1` weeks before the week containing
 * `from` — the window start for weekly charts (last bucket = that week).
 *
 * `from` is a parameter rather than always `new Date()` so a caller holding this
 * in a query key can re-derive it when the day rolls over; a value frozen at
 * mount keeps querying last week's window after midnight.
 */
export function weeksAgoMonday(weeks = 8, from: Date = new Date()): string {
  const monday = mondayOf(from);
  monday.setDate(monday.getDate() - (weeks - 1) * 7);
  return localISO(monday);
}

/** Aggregate session counts into weekly buckets for a bar chart. */
export function getWeeklyBarData(
  sessions: Session[],
  weeks = 8,
): { value: number; label: string }[] {
  const now = new Date();
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = mondayOf(new Date(now));
    weekStart.setDate(weekStart.getDate() - (weeks - 1 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const count = sessions.filter((s) => {
      const d = parseLocalDate(s.date);
      return d >= weekStart && d < weekEnd;
    }).length;
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { value: count, label: i === weeks - 1 ? 'This\nweek' : label };
  });
}
