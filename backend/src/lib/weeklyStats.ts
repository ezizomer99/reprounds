import type { WeeklyBucket } from '@app/shared';

/** One aggregated week as returned by the /stats/weekly SQL, keyed by bucket index. */
export interface WeeklyRow {
  /** Whole weeks between the window start and the session date. */
  bucket: number;
  sessions: number;
  volumeKg: number;
  completedSets: number;
}

const WEEK_MS = 7 * 86_400_000;

function utcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Expand sparse per-bucket aggregates into a dense, oldest-first week series.
 *
 * The SQL only emits buckets that had a session, so a rest week comes back
 * missing rather than zero — a chart fed those rows directly would silently
 * close the gap and redraw a two-week layoff as two adjacent training weeks.
 *
 * Date maths is pure UTC on `YYYY-MM-DD` strings, matching aggregateMatStats:
 * `sessions.date` is a Postgres `date` with no time in it, and `since` is the
 * caller's *local* Monday, so introducing a timezone here could only shift it.
 */
export function buildWeeklyBuckets(
  rows: WeeklyRow[],
  since: string,
  weeks: number,
): WeeklyBucket[] {
  const sinceMs = utcMs(since);
  const byBucket = new Map<number, WeeklyRow>();
  for (const row of rows) {
    // Defensive: a row outside the requested window would otherwise write past
    // the end of the series and vanish, or worse, land on the wrong week.
    if (row.bucket < 0 || row.bucket >= weeks) continue;
    byBucket.set(row.bucket, row);
  }

  return Array.from({ length: weeks }, (_, i) => {
    const row = byBucket.get(i);
    return {
      weekStart: isoDate(sinceMs + i * WEEK_MS),
      sessions: row?.sessions ?? 0,
      volumeKg: row?.volumeKg ?? 0,
      completedSets: row?.completedSets ?? 0,
    };
  });
}
