import { describe, expect, it } from 'vitest';
import {
  ANY_DATE_MAX_DAYS_AHEAD,
  ANY_DATE_MAX_DAYS_BACK,
  PLANNED_DATE_SLACK_DAYS,
  PLANNED_MAX_AHEAD_DAYS,
  addDaysISO,
  anyDateWindow,
  daysBetweenISO,
  isWithinAnyDateWindow,
  isWithinPlannedWindow,
  isoFromParts,
  plannedDateWindow,
  utcTodayISO,
  weekdayOf,
} from './dates';

describe('isoFromParts', () => {
  it('zero-pads month and day', () => {
    expect(isoFromParts(2026, 1, 5)).toBe('2026-01-05');
  });

  // An unpadded year breaks both the API's \d{4} check and the lexicographic
  // comparisons every window test below relies on.
  it('zero-pads a sub-4-digit year', () => {
    expect(isoFromParts(999, 1, 1)).toBe('0999-01-01');
    expect(isoFromParts(7, 12, 31)).toBe('0007-12-31');
  });
});

describe('addDaysISO', () => {
  it('moves within a month', () => {
    expect(addDaysISO('2026-08-04', 3)).toBe('2026-08-07');
    expect(addDaysISO('2026-08-04', -3)).toBe('2026-08-01');
  });

  it('crosses a month boundary in both directions', () => {
    expect(addDaysISO('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysISO('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('crosses a year boundary in both directions', () => {
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles a leap day', () => {
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysISO('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDaysISO('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('skips 29 Feb in a non-leap year', () => {
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is a no-op on a non-date rather than producing NaN', () => {
    expect(addDaysISO('2026-02-30', 1)).toBe('2026-02-30');
    expect(addDaysISO('not-a-date', 1)).toBe('not-a-date');
    expect(addDaysISO('999-01-01', 1)).toBe('999-01-01');
  });

  it('round-trips a large offset', () => {
    expect(addDaysISO(addDaysISO('2026-08-04', 730), -730)).toBe('2026-08-04');
  });
});

describe('daysBetweenISO', () => {
  it('is positive forward and negative backward', () => {
    expect(daysBetweenISO('2026-08-01', '2026-08-04')).toBe(3);
    expect(daysBetweenISO('2026-08-04', '2026-08-01')).toBe(-3);
    expect(daysBetweenISO('2026-08-04', '2026-08-04')).toBe(0);
  });

  it('counts across a leap day', () => {
    expect(daysBetweenISO('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetweenISO('2026-02-28', '2026-03-01')).toBe(1);
  });

  // A DST transition shortens a local day to 23h; a UTC-anchored diff must not
  // round that to 0.
  it('counts a DST-transition day as one day', () => {
    expect(daysBetweenISO('2026-03-08', '2026-03-09')).toBe(1);
    expect(daysBetweenISO('2026-11-01', '2026-11-02')).toBe(1);
  });
});

describe('plannedDateWindow', () => {
  const anchor = '2026-08-04';

  it('opens one day early for device-timezone slack', () => {
    expect(plannedDateWindow(anchor).min).toBe('2026-08-03');
    expect(PLANNED_DATE_SLACK_DAYS).toBe(1);
  });

  it('closes PLANNED_MAX_AHEAD_DAYS out', () => {
    expect(plannedDateWindow(anchor).max).toBe(addDaysISO(anchor, PLANNED_MAX_AHEAD_DAYS));
  });

  it('accepts today and tomorrow', () => {
    expect(isWithinPlannedWindow(anchor, anchor)).toBe(true);
    expect(isWithinPlannedWindow('2026-08-05', anchor)).toBe(true);
  });

  // The whole point of the guard: a past-dated planned session is instantly
  // "Overdue" and was previously creatable from a stale calendar.
  it('rejects a date before the slack window', () => {
    expect(isWithinPlannedWindow('2026-08-02', anchor)).toBe(false);
    expect(isWithinPlannedWindow('1999-01-01', anchor)).toBe(false);
  });

  it('accepts the slack day itself', () => {
    expect(isWithinPlannedWindow('2026-08-03', anchor)).toBe(true);
  });

  it('rejects a date past the horizon', () => {
    expect(isWithinPlannedWindow(addDaysISO(anchor, PLANNED_MAX_AHEAD_DAYS), anchor)).toBe(true);
    expect(isWithinPlannedWindow(addDaysISO(anchor, PLANNED_MAX_AHEAD_DAYS + 1), anchor)).toBe(
      false,
    );
    expect(isWithinPlannedWindow('9999-12-31', anchor)).toBe(false);
  });

  it('works across a year boundary', () => {
    expect(isWithinPlannedWindow('2026-12-31', '2027-01-01')).toBe(true);
    expect(isWithinPlannedWindow('2026-12-30', '2027-01-01')).toBe(false);
  });
});

describe('anyDateWindow', () => {
  const anchor = '2026-08-04';

  it('is generous enough for real backfill but bounded', () => {
    const w = anyDateWindow(anchor);
    expect(w.min).toBe(addDaysISO(anchor, -ANY_DATE_MAX_DAYS_BACK));
    expect(w.max).toBe(addDaysISO(anchor, ANY_DATE_MAX_DAYS_AHEAD));
    // A decade of training history is fine.
    expect(isWithinAnyDateWindow('2016-08-04', anchor)).toBe(true);
  });

  it('rejects absurd values a picker bug or hostile client could send', () => {
    expect(isWithinAnyDateWindow('1823-04-01', anchor)).toBe(false);
    expect(isWithinAnyDateWindow('9999-12-31', anchor)).toBe(false);
  });
});

describe('weekdayOf', () => {
  // Monday-first, matching the calendar grid and the week-streak math.
  it('returns 0 for Monday and 6 for Sunday', () => {
    expect(weekdayOf('2026-08-03')).toBe(0); // Monday
    expect(weekdayOf('2026-08-09')).toBe(6); // Sunday
  });

  it('walks a full week', () => {
    const week = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09'];
    expect(week.map(weekdayOf)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('is correct on a DST-transition day', () => {
    expect(weekdayOf('2026-03-08')).toBe(6); // Sunday, US spring-forward
    expect(weekdayOf('2026-10-18')).toBe(6); // Sunday, Santiago springs forward at midnight
  });

  it('is correct on a leap day', () => {
    expect(weekdayOf('2028-02-29')).toBe(1); // Tuesday
  });
});

describe('utcTodayISO', () => {
  it('returns a padded ISO date', () => {
    expect(utcTodayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('agrees with the current UTC date', () => {
    const now = new Date();
    expect(utcTodayISO()).toBe(
      isoFromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()),
    );
  });
});
