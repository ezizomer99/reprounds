// Local-date month-grid math shared by CalendarPicker, MonthGrid, and the
// calendar screen. Everything here works in the device's local timezone —
// never use toISOString() for a local date: for timezones ahead of/behind UTC
// it can land on the wrong day (an evening in UTC-8 is already "tomorrow" in
// UTC).

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// Monday-first, matching the rest of the app: week streaks, My Week, the stats
// buckets (statsHelpers.mondayOf) and the backend's mat-stats weeks.
export const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const DAY_LABELS_LONG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** `YYYY-MM-DD` from local year / 0-indexed month / day-of-month. */
export function toISODate(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Today as a local `YYYY-MM-DD` string. */
export function localTodayISO(): string {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth(), now.getDate());
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
