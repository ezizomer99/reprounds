import { localTodayISO, monthCells, monthRange, toISODate } from './calendar';

describe('toISODate', () => {
  it('zero-pads month and day', () => {
    expect(toISODate(2026, 0, 5)).toBe('2026-01-05');
    expect(toISODate(2026, 11, 25)).toBe('2026-12-25');
    expect(toISODate(2026, 9, 10)).toBe('2026-10-10');
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
