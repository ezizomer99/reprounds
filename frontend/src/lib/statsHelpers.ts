import type { Session } from '@app/shared';

/** Return the Monday (00:00:00 local) of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

/** ISO date (YYYY-MM-DD) of the Monday of the week containing `isoDate`. */
export function weekKey(isoDate: string): string {
  return mondayOf(new Date(isoDate + 'T00:00:00')).toISOString().slice(0, 10);
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
    if (activeWeeks.has(wk.toISOString().slice(0, 10))) streak++;
    else if (w === 0) continue; // grace for the current week
    else break;
  }
  return streak;
}

/** Number of completed sessions in the current (Monday-aligned) week. */
export function sessionsThisWeek(sessions: Session[]): number {
  const monday = mondayOf(new Date());
  return sessions.filter((s) => new Date(s.date + 'T00:00:00') >= monday).length;
}

/** Average sessions per week over the last `weeks` weeks (1 decimal). */
export function avgPerWeek(sessions: Session[], weeks = 4): number {
  if (!sessions.length) return 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const recent = sessions.filter((s) => new Date(s.date + 'T00:00:00') >= cutoff);
  return Math.round((recent.length / weeks) * 10) / 10;
}

/**
 * ISO date (local) of the Monday `weeks - 1` weeks before the current week —
 * the window start for weekly charts (last bucket = this week). Formats the
 * local date directly rather than via toISOString so timezones ahead of UTC
 * don't slide the Monday back to Sunday.
 */
export function weeksAgoMonday(weeks = 8): string {
  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() - (weeks - 1) * 7);
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const d = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
      const d = new Date(s.date + 'T00:00:00');
      return d >= weekStart && d < weekEnd;
    }).length;
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return { value: count, label: i === weeks - 1 ? 'This\nweek' : label };
  });
}
