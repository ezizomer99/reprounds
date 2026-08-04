import {
  addMonths,
  formatDayTitle,
  localTodayISO,
  monthCells,
  monthOfISO,
  monthRange,
  monthsApart,
  monthsBetween,
  parseLocalDate,
  toISODate,
} from './calendar';

describe('toISODate', () => {
  it('zero-pads month and day', () => {
    expect(toISODate(2026, 0, 5)).toBe('2026-01-05');
    expect(toISODate(2026, 11, 25)).toBe('2026-12-25');
    expect(toISODate(2026, 9, 10)).toBe('2026-10-10');
  });

  // An unpadded year fails the API's \d{4} check and breaks the lexicographic
  // comparisons the calendar uses for past/future and the free-tier cutoff.
  it('zero-pads a sub-4-digit year', () => {
    expect(toISODate(999, 0, 1)).toBe('0999-01-01');
  });
});

describe('monthCells', () => {
  // March 2026 starts on a Sunday — the case a Monday-first grid must pad by a
  // full week, and the one a Sunday-first grid got for free.
  it('pads a month starting on Sunday with six leading blanks', () => {
    const cells = monthCells(2026, 2);
    expect(cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(cells[6]).toBe(1);
    expect(cells[7]).toBe(2);
  });

  // June 2026 starts on a Monday — no padding at all.
  it('does not pad a month starting on Monday', () => {
    const cells = monthCells(2026, 5);
    expect(cells[0]).toBe(1);
    expect(cells.indexOf(null)).toBeGreaterThan(29);
  });

  it('always returns whole weeks', () => {
    for (let m = 0; m < 12; m++) {
      expect(monthCells(2026, m).length % 7).toBe(0);
    }
  });

  it('lists every day of the month in order, with no gaps between days', () => {
    for (let m = 0; m < 12; m++) {
      const cells = monthCells(2026, m);
      const days = cells.filter((c): c is number => c !== null);
      const daysInMonth = new Date(2026, m + 1, 0).getDate();
      expect(days).toEqual(Array.from({ length: daysInMonth }, (_, i) => i + 1));

      // Blanks only ever bookend the days — never interrupt them.
      const first = cells.indexOf(1);
      const last = first + daysInMonth - 1;
      expect(cells.slice(first, last + 1).every((c) => c !== null)).toBe(true);
    }
  });

  it('fits a 31-day month starting on Sunday inside six weeks', () => {
    // 6 leading blanks + 31 days = 37 cells, the Monday-first worst case.
    expect(monthCells(2026, 2).length).toBeLessThanOrEqual(42);
  });
});

describe('monthRange', () => {
  it('covers the whole month inclusively', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange(2026, 3)).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(monthRange(2026, 7)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('handles a leap February', () => {
    expect(monthRange(2028, 1).to).toBe('2028-02-29');
  });
});

describe('month arithmetic', () => {
  it('adds and subtracts months across a year boundary', () => {
    expect(addMonths({ year: 2026, month0: 11 }, 1)).toEqual({ year: 2027, month0: 0 });
    expect(addMonths({ year: 2026, month0: 0 }, -1)).toEqual({ year: 2025, month0: 11 });
    expect(addMonths({ year: 2026, month0: 7 }, -24)).toEqual({ year: 2024, month0: 7 });
  });

  it('diffs months across a year boundary', () => {
    expect(monthsApart({ year: 2026, month0: 11 }, { year: 2027, month0: 0 })).toBe(1);
    expect(monthsApart({ year: 2027, month0: 0 }, { year: 2026, month0: 11 })).toBe(-1);
    expect(monthsApart({ year: 2024, month0: 7 }, { year: 2026, month0: 7 })).toBe(24);
  });

  it('reads the month out of an ISO date', () => {
    expect(monthOfISO('2026-08-04')).toEqual({ year: 2026, month0: 7 });
    expect(monthOfISO('2026-01-31')).toEqual({ year: 2026, month0: 0 });
  });
});

describe('monthsBetween', () => {
  it('is inclusive of both ends and ordered oldest first', () => {
    const months = monthsBetween({ year: 2026, month0: 10 }, { year: 2027, month0: 1 });
    expect(months).toEqual([
      { year: 2026, month0: 10 },
      { year: 2026, month0: 11 },
      { year: 2027, month0: 0 },
      { year: 2027, month0: 1 },
    ]);
  });

  it('returns a single month when both ends match', () => {
    expect(monthsBetween({ year: 2026, month0: 7 }, { year: 2026, month0: 7 })).toEqual([
      { year: 2026, month0: 7 },
    ]);
  });

  it('returns empty when the range is inverted', () => {
    expect(monthsBetween({ year: 2026, month0: 7 }, { year: 2026, month0: 6 })).toEqual([]);
  });

  // The reason the calendar anchors on a fixed origin: a month rollover has to
  // append, leaving every existing index — and so the user's scroll — in place.
  it('appends forward on a rollover without shifting earlier indices', () => {
    const origin = { year: 2024, month0: 7 };
    const before = monthsBetween(origin, { year: 2027, month0: 7 });
    const after = monthsBetween(origin, { year: 2027, month0: 8 });
    expect(after.length).toBe(before.length + 1);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('keeps the anchor month at a predictable index', () => {
    const today = { year: 2026, month0: 7 };
    const months = monthsBetween(addMonths(today, -24), addMonths(today, 12));
    expect(months.length).toBe(37);
    expect(months[24]).toEqual(today);
  });

  // The calendar screen's window contract. Opening mid-list is what made the
  // calendar land on the LAST month: FlashList v2 has no size estimates and
  // assumes 200px per unmeasured item against a ~360px MonthGrid, so a
  // mid-list initialScrollIndex resolved to an offset past the content height
  // and got clamped to the bottom. So the current month MUST be index 0 on the
  // first paint, and history is only ever added above it afterwards.
  describe('calendar window contract', () => {
    const MONTHS_BACK = 24;
    const MONTHS_FORWARD = 12;
    const anchor = { year: 2026, month0: 7 }; // Aug 2026

    const windowFor = (monthsBack: number) =>
      monthsBetween(addMonths(anchor, -monthsBack), addMonths(anchor, MONTHS_FORWARD));

    it('puts the current month at index 0 before any history is loaded', () => {
      const months = windowFor(0);
      expect(months[0]).toEqual(anchor);
      expect(months.length).toBe(MONTHS_FORWARD + 1);
    });

    it('only adds months above when history loads, never reordering the rest', () => {
      const initial = windowFor(0);
      const extended = windowFor(MONTHS_BACK);

      expect(extended.length).toBe(initial.length + MONTHS_BACK);
      // The current month moved down by exactly the number of prepended months...
      expect(extended[MONTHS_BACK]).toEqual(anchor);
      // ...and everything that was already there kept its order, contiguously.
      expect(extended.slice(MONTHS_BACK)).toEqual(initial);
    });

    it('keeps prepending above on each further extension', () => {
      const first = windowFor(MONTHS_BACK);
      const second = windowFor(MONTHS_BACK + 12);
      expect(second.slice(12)).toEqual(first);
      expect(second[MONTHS_BACK + 12]).toEqual(anchor);
    });

    // A month rollover advances only the forward edge, so index 0 is untouched
    // and the user's scroll position survives midnight.
    it('appends at the end on a month rollover without shifting index 0', () => {
      const before = monthsBetween(
        addMonths(anchor, -MONTHS_BACK),
        addMonths(anchor, MONTHS_FORWARD),
      );
      const afterRollover = monthsBetween(
        addMonths(anchor, -MONTHS_BACK),
        addMonths(addMonths(anchor, 1), MONTHS_FORWARD),
      );
      expect(afterRollover.length).toBe(before.length + 1);
      expect(afterRollover.slice(0, before.length)).toEqual(before);
      expect(afterRollover[0]).toEqual(before[0]);
    });
  });
});

describe('formatDayTitle', () => {
  it('formats a weekday, short month and day', () => {
    expect(formatDayTitle('2026-08-04')).toBe('Tuesday, Aug 4');
    expect(formatDayTitle('2026-01-01')).toBe('Thursday, Jan 1');
    expect(formatDayTitle('2026-12-25')).toBe('Friday, Dec 25');
  });

  it('is correct on a leap day', () => {
    expect(formatDayTitle('2028-02-29')).toBe('Tuesday, Feb 29');
  });

  // The reason this is built from ISO parts instead of `new Date(iso +
  // 'T00:00:00')`: local midnight does not exist on the transition day in zones
  // that spring forward at midnight, so the old idiom made the title's
  // correctness depend on the device's timezone rules.
  it('is correct on DST-transition days', () => {
    expect(formatDayTitle('2026-03-08')).toBe('Sunday, Mar 8'); // US spring-forward
    expect(formatDayTitle('2026-11-01')).toBe('Sunday, Nov 1'); // US fall-back
    expect(formatDayTitle('2026-10-18')).toBe('Sunday, Oct 18'); // Santiago, at midnight
  });

  it('falls back to the raw string on a non-date', () => {
    expect(formatDayTitle('not-a-date')).toBe('not-a-date');
  });
});

describe('parseLocalDate', () => {
  it('returns the same calendar day it was given', () => {
    for (const iso of ['2026-01-01', '2026-08-04', '2026-12-31', '2028-02-29']) {
      const d = parseLocalDate(iso);
      expect(toISODate(d.getFullYear(), d.getMonth(), d.getDate())).toBe(iso);
    }
  });

  // Noon, not midnight: in zones that spring forward AT midnight (Chile, Cuba,
  // Lord Howe) local 00:00 does not exist on the transition day, and the engine
  // shifts it — so any formatter reading it could land on the wrong day. A
  // one-hour transition never skips noon.
  it('sits at midday so a DST transition cannot shift the day', () => {
    expect(parseLocalDate('2026-08-04').getHours()).toBe(12);
    for (const iso of ['2026-03-08', '2026-10-18', '2026-11-01', '2026-09-06']) {
      const d = parseLocalDate(iso);
      expect(toISODate(d.getFullYear(), d.getMonth(), d.getDate())).toBe(iso);
    }
  });

  it('round-trips every day of a year', () => {
    for (let m = 0; m < 12; m++) {
      const daysInMonth = new Date(2026, m + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const iso = toISODate(2026, m, day);
        const d = parseLocalDate(iso);
        expect(toISODate(d.getFullYear(), d.getMonth(), d.getDate())).toBe(iso);
      }
    }
  });
});

describe('localTodayISO', () => {
  it('formats today from local date parts', () => {
    const now = new Date();
    expect(localTodayISO()).toBe(toISODate(now.getFullYear(), now.getMonth(), now.getDate()));
  });

  it('does not derive the date from UTC', () => {
    // The regression guard: toISOString() rolls the day over for timezones
    // away from UTC, which silently shifted logged workouts by a day.
    const now = new Date();
    const local = localTodayISO();
    expect(local.length).toBe(10);
    expect(Number(local.slice(8, 10))).toBe(now.getDate());
  });
});
