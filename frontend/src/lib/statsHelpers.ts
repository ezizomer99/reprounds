import type { WeeklyBucket } from '@app/shared';
import { parseLocalDate, toISODate } from './calendar';

/**
 * Windows the stats tab can be viewed over, in Monday-aligned weeks.
 *
 * 52 is the server's cap (`MAX_WEEKS` in backend/src/routes/stats.ts) — keep the
 * widest option at or under it, or the range silently returns fewer buckets than
 * its own label promises.
 */
export const STATS_RANGES = [
  { key: '4w', label: '4W', weeks: 4, longLabel: 'Last 4 weeks' },
  { key: '8w', label: '8W', weeks: 8, longLabel: 'Last 8 weeks' },
  { key: '6m', label: '6M', weeks: 26, longLabel: 'Last 6 months' },
  { key: '1y', label: '1Y', weeks: 52, longLabel: 'Last year' },
] as const;

export type StatsRangeKey = (typeof STATS_RANGES)[number]['key'];

export function statsRange(key: StatsRangeKey) {
  return STATS_RANGES.find((r) => r.key === key) ?? STATS_RANGES[1];
}

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

/**
 * Average sessions per week across server-aggregated buckets.
 *
 * Divides by the weeks from the first *active* bucket onward, not by the whole
 * window — the same rule `avgPerWeek` applies to a session list, and for the
 * same reason: someone two weeks into the app who trains twice a week should
 * read 2.0, not 0.2 against a year-long divisor.
 */
export function avgPerWeekFromBuckets(buckets: Pick<WeeklyBucket, 'sessions'>[]): number {
  const firstActive = buckets.findIndex((b) => b.sessions > 0);
  if (firstActive === -1) return 0;
  const covered = buckets.length - firstActive;
  const total = buckets.slice(firstActive).reduce((n, b) => n + b.sessions, 0);
  return Math.round((total / covered) * 10) / 10;
}

/**
 * Label a weekly bucket for a chart axis. The newest bucket is always "This
 * week"; the rest carry their Monday's date.
 *
 * Labels thin out as the window widens — at 52 weeks every bucket labelled would
 * be an unreadable smear — so only every `step`-th bucket gets one.
 */
export function weeklyBarLabel(weekStart: string, index: number, total: number): string {
  if (index === total - 1) return 'This\nweek';
  const step = total > 26 ? 8 : total > 12 ? 4 : 1;
  if ((total - 1 - index) % step !== 0) return '';
  return parseLocalDate(weekStart).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
