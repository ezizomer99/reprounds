// Pure `YYYY-MM-DD` arithmetic and the bounds both sides enforce on a session
// date. This lives in shared because the client and the Worker have to agree on
// the window: the client disables out-of-range days in the picker, the Worker
// rejects them, and a disagreement means either a 400 the UI never predicted or
// a guard the UI silently bypasses.
//
// Every function here is UTC-anchored on purpose. An ISO date names a calendar
// day, not an instant, so `new Date(iso + 'T00:00:00')` (local midnight) is the
// wrong tool twice over: it drags the device offset into date math, and that
// instant does not exist on a DST-transition day in zones that spring forward at
// midnight (Chile, Cuba, Lord Howe). `Date.UTC` has no such gaps.

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Split an ISO date into numeric parts. Returns null when it isn't one. */
function parts(iso: string): [number, number, number] | null {
  if (typeof iso !== 'string' || !ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return [y, m, d];
}

/** Format local-style parts as `YYYY-MM-DD`, zero-padding the year. */
export function isoFromParts(year: number, month1: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

/**
 * `iso` shifted by `n` days (negative to go back). Returns `iso` unchanged when
 * it isn't a real calendar day, so a caller that skipped validation degrades to
 * a no-op instead of producing `NaN-NaN-NaN`.
 */
export function addDaysISO(iso: string, n: number): string {
  const p = parts(iso);
  if (!p) return iso;
  const [y, m, d] = p;
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return isoFromParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** Whole days from `a` to `b`, positive when `b` is later. 0 if either is invalid. */
export function daysBetweenISO(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return 0;
  const ms = Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2]);
  return Math.round(ms / 86_400_000);
}

/**
 * Today in UTC. The Worker's only available "now" — it cannot know the device's
 * timezone, which is why the planned-date window below carries a day of slack
 * rather than comparing against this directly.
 */
export function utcTodayISO(): string {
  const now = new Date();
  return isoFromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/**
 * Timezone tolerance for the planned-date floor. Device offsets span UTC−12 to
 * UTC+14, so a device's "today" can be a calendar day either side of the
 * server's. One day of slack means a legitimate "schedule something for today"
 * is never rejected, while a date that is genuinely in the past still is.
 */
export const PLANNED_DATE_SLACK_DAYS = 1;

/** How far ahead a one-off session may be scheduled. The calendar shows 12 months. */
export const PLANNED_MAX_AHEAD_DAYS = 730;

// Absurd-value bounds for any session date, planned or not. Backfilling a past
// workout is a first-class feature so the floor is generous, but a date outside
// this range is a bug or a hostile client, never a user.
export const ANY_DATE_MAX_DAYS_BACK = 365 * 50;
export const ANY_DATE_MAX_DAYS_AHEAD = 365 * 5;

export interface DateWindow {
  /** Inclusive earliest allowed `YYYY-MM-DD`. */
  min: string;
  /** Inclusive latest allowed `YYYY-MM-DD`. */
  max: string;
}

/** The window a `status='planned'` session's date must fall inside. */
export function plannedDateWindow(anchorISO: string): DateWindow {
  return {
    min: addDaysISO(anchorISO, -PLANNED_DATE_SLACK_DAYS),
    max: addDaysISO(anchorISO, PLANNED_MAX_AHEAD_DAYS),
  };
}

/** The sanity window every session date must fall inside, whatever its status. */
export function anyDateWindow(anchorISO: string): DateWindow {
  return {
    min: addDaysISO(anchorISO, -ANY_DATE_MAX_DAYS_BACK),
    max: addDaysISO(anchorISO, ANY_DATE_MAX_DAYS_AHEAD),
  };
}

/**
 * Inclusive range check. Lexicographic comparison is exact for zero-padded
 * `YYYY-MM-DD`, so no parsing is needed — but the ISO shape is required for that
 * to hold, and an unpadded year (`999-01-01`) would compare wrongly. Callers
 * validate the shape first; `isoFromParts` guarantees it on the way in.
 */
export function isWithinWindow(iso: string, window: DateWindow): boolean {
  return iso >= window.min && iso <= window.max;
}

/** Whether a planned session may carry this date, given the server's today. */
export function isWithinPlannedWindow(iso: string, anchorISO: string): boolean {
  return isWithinWindow(iso, plannedDateWindow(anchorISO));
}

/** Whether any session may carry this date, given the server's today. */
export function isWithinAnyDateWindow(iso: string, anchorISO: string): boolean {
  return isWithinWindow(iso, anyDateWindow(anchorISO));
}

/**
 * Day of week for an ISO date, 0 = Monday … 6 = Sunday — matching the app's
 * Monday-first weeks. UTC-anchored, so it never shifts with the device offset.
 */
export function weekdayOf(iso: string): number {
  const p = parts(iso);
  if (!p) return 0;
  const [y, m, d] = p;
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
