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
const DAY_MS = 86_400_000;

function utcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Format a UTC timestamp as `YYYY-MM-DD`.
 *
 * Built by hand rather than `toISOString().slice(0, 10)`: past year 9999 that
 * method switches to the expanded form `+010000-11-29T…`, so slicing ten
 * characters yields `"+010000-11"` — which binds straight into `${until}::date`
 * and 500s the endpoint. `isIsoDate` accepts `9999-12-01`, and a 52-week window
 * from there crosses the boundary, so the input reaches here legitimately.
 * Padding the year keeps the output a real date Postgres accepts (its own
 * ceiling is year 5874897, far past anything this can produce).
 */
function isoDate(ms: number): string {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * `days` after a `YYYY-MM-DD` date, as another `YYYY-MM-DD`.
 *
 * Exists so the weekly window's upper bound can be computed here rather than in
 * SQL. `${since}::date + ${weeks * 7}` looked equivalent but wasn't: postgres-js
 * binds a JS number with an unspecified type OID, so Postgres saw `date + unknown`
 * and could not choose between `date + integer`, `date + interval`, `date + time`
 * and `date + timetz` — three type categories, so resolution fails outright with
 * "operator is not unique" and every call to /stats/weekly 500'd. A date on both
 * sides of the comparison has only one meaning.
 *
 * Pure UTC on the string, matching buildWeeklyBuckets below: `sessions.date` is a
 * Postgres `date` with no time in it, so a timezone here could only shift it.
 */
export function addDaysISO(from: string, days: number): string {
  return isoDate(utcMs(from) + days * DAY_MS);
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
