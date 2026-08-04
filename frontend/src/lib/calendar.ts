// Local-date month-grid math shared by CalendarPicker, MonthGrid, and the
// calendar screen. Everything here works in the device's local timezone —
// never use toISOString() for a local date: for timezones ahead of/behind UTC
// it can land on the wrong day (an evening in UTC-8 is already "tomorrow" in
// UTC).
//
// Once a date is an ISO *string* it names a calendar day with no timezone left
// in it, so arithmetic and formatting on it belong in @app/shared's UTC-anchored
// helpers (addDaysISO, weekdayOf) rather than being re-derived through a local
// Date. Parsing one back with `new Date(iso + 'T00:00:00')` is the trap: that
// instant does not exist on a DST-transition day in zones that spring forward at
// midnight, and it drags the device offset back into day math.
import { isoFromParts, weekdayOf } from '@app/shared';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// Monday-first, matching the rest of the app: week streaks, My Week, the stats
// buckets (statsHelpers.mondayOf) and the backend's mat-stats weeks.
export const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const DAY_LABELS_LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

/**
 * `YYYY-MM-DD` from local year / 0-indexed month / day-of-month.
 *
 * The year is zero-padded: an unpadded one (`999-01-01`) fails the API's `\d{4}`
 * check *and* breaks the lexicographic date comparisons used throughout the
 * calendar, so it would surface as an opaque 400 rather than a rejected day.
 */
export function toISODate(year: number, month0: number, day: number): string {
  return isoFromParts(year, month0 + 1, day);
}

/** Today as a local `YYYY-MM-DD` string. */
export function localTodayISO(): string {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * An ISO date as a local `Date` positioned at **noon**, for the cases that
 * genuinely need a Date (comparisons against a cutoff, `toLocaleDateString`).
 *
 * Noon rather than midnight on purpose. `new Date(iso + 'T00:00:00')` was the
 * idiom throughout the app, but in zones that spring forward *at* midnight
 * (Chile, Cuba, Lord Howe) that instant does not exist, so the engine shifts it —
 * and any formatter reading it can land on the wrong day. Noon is never skipped
 * by a one-hour transition, and since only the date parts are ever read, the time
 * component is irrelevant.
 *
 * Prefer the pure string helpers (`formatDayTitle`, `addDaysISO`, lexicographic
 * comparison) where they suffice; reach for this only when a Date is required.
 */
export function parseLocalDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/**
 * The month's day cells as a null-padded Monday-first grid: leading nulls for
 * the weekday offset of the 1st, then 1..daysInMonth, then trailing nulls to a
 * multiple of 7.
 */
export function monthCells(year: number, month0: number): (number | null)[] {
  // Monday-first: shift Sunday (0) to the end of the week, the same idiom as
  // statsHelpers.mondayOf and MyWeek.
  const firstDayOffset = (new Date(year, month0, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Inclusive first/last ISO dates of a month, for `GET /sessions?from=&to=`. */
export function monthRange(year: number, month0: number): { from: string; to: string } {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  return { from: toISODate(year, month0, 1), to: toISODate(year, month0, daysInMonth) };
}

export interface YearMonth {
  year: number;
  month0: number;
}

/** A month index that survives year boundaries, so months can be compared and diffed. */
function monthIndex(m: YearMonth): number {
  return m.year * 12 + m.month0;
}

/** `n` months after `from` (negative to go back). */
export function addMonths(from: YearMonth, n: number): YearMonth {
  const i = monthIndex(from) + n;
  return { year: Math.floor(i / 12), month0: ((i % 12) + 12) % 12 };
}

/** Whole months from `a` to `b`, positive when `b` is later. */
export function monthsApart(a: YearMonth, b: YearMonth): number {
  return monthIndex(b) - monthIndex(a);
}

/**
 * Every month from `first` to `last` inclusive, oldest first. Empty when `last`
 * precedes `first`.
 *
 * The calendar's month list is built from a *fixed origin* rather than an offset
 * from "now", so that when the day rolls over past a month boundary the new month
 * is appended and every existing index keeps its position. Recomputing the window
 * relative to now would shift index 0 and jump the user's scroll.
 */
export function monthsBetween(first: YearMonth, last: YearMonth): YearMonth[] {
  const span = monthsApart(first, last);
  if (span < 0) return [];
  return Array.from({ length: span + 1 }, (_, i) => addMonths(first, i));
}

/** The `YearMonth` an ISO date falls in. */
export function monthOfISO(iso: string): YearMonth {
  const [year, month] = iso.split('-').map(Number);
  return { year, month0: month - 1 };
}

/**
 * A day heading like "Tuesday, Aug 4" (or "Tue, Aug 4" with `weekday: 'short'`),
 * built purely from the ISO parts.
 *
 * Deliberately not `new Date(iso + 'T00:00:00').toLocaleDateString(...)`: local
 * midnight does not exist on the transition day in zones that spring forward at
 * midnight (Chile, Cuba, Lord Howe), and relying on it makes the heading's
 * correctness depend on the device's timezone rules.
 */
export function formatDayTitle(
  iso: string,
  { weekday = 'long' }: { weekday?: 'long' | 'short' } = {},
): string {
  const { month0 } = monthOfISO(iso);
  const day = Number(iso.slice(8, 10));
  if (!Number.isFinite(day) || day < 1 || !MONTH_NAMES[month0]) return iso;
  const dayName = weekday === 'short' ? DAY_LABELS_LONG[weekdayOf(iso)] : DAY_NAMES_FULL[weekdayOf(iso)];
  return `${dayName}, ${MONTH_NAMES[month0].slice(0, 3)} ${day}`;
}
