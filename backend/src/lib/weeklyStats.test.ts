import { describe, it, expect } from 'vitest';
import { addDaysISO, buildWeeklyBuckets, type WeeklyRow } from './weeklyStats';

const SINCE = '2026-06-01'; // a Monday

function row(over: Partial<WeeklyRow> & { bucket: number }): WeeklyRow {
  return { sessions: 1, volumeKg: 0, completedSets: 0, ...over };
}

describe('buildWeeklyBuckets', () => {
  it('returns exactly `weeks` buckets, oldest first', () => {
    const buckets = buildWeeklyBuckets([], SINCE, 8);
    expect(buckets).toHaveLength(8);
    expect(buckets[0].weekStart).toBe('2026-06-01');
    expect(buckets[7].weekStart).toBe('2026-07-20');
  });

  it('spaces every bucket exactly seven days apart', () => {
    const buckets = buildWeeklyBuckets([], SINCE, 6);
    for (let i = 1; i < buckets.length; i++) {
      const prev = Date.parse(buckets[i - 1].weekStart + 'T00:00:00Z');
      const cur = Date.parse(buckets[i].weekStart + 'T00:00:00Z');
      expect((cur - prev) / 86_400_000).toBe(7);
    }
  });

  it('zero-fills a window with no activity at all', () => {
    const buckets = buildWeeklyBuckets([], SINCE, 4);
    expect(buckets.every((b) => b.sessions === 0 && b.volumeKg === 0)).toBe(true);
  });

  // The SQL only emits buckets that had a session. Handed straight to a chart,
  // a rest week would be missing rather than zero and the gap would close up —
  // redrawing a two-week layoff as two adjacent training weeks.
  it('zero-fills the gaps between sparse rows instead of closing them', () => {
    const buckets = buildWeeklyBuckets(
      [row({ bucket: 0, sessions: 3 }), row({ bucket: 3, sessions: 2 })],
      SINCE,
      4,
    );
    expect(buckets.map((b) => b.sessions)).toEqual([3, 0, 0, 2]);
  });

  it('places each row at its own bucket index', () => {
    const buckets = buildWeeklyBuckets(
      [row({ bucket: 2, sessions: 5, volumeKg: 1200, completedSets: 40 })],
      SINCE,
      4,
    );
    expect(buckets[2]).toEqual({
      weekStart: '2026-06-15',
      sessions: 5,
      volumeKg: 1200,
      completedSets: 40,
    });
  });

  it('drops rows outside the requested window rather than misplacing them', () => {
    const buckets = buildWeeklyBuckets(
      [row({ bucket: -1, sessions: 9 }), row({ bucket: 4, sessions: 9 }), row({ bucket: 1, sessions: 2 })],
      SINCE,
      4,
    );
    expect(buckets.map((b) => b.sessions)).toEqual([0, 2, 0, 0]);
  });

  it('carries volume and set counts through', () => {
    const buckets = buildWeeklyBuckets(
      [row({ bucket: 0, sessions: 2, volumeKg: 8450.5, completedSets: 61 })],
      SINCE,
      2,
    );
    expect(buckets[0].volumeKg).toBe(8450.5);
    expect(buckets[0].completedSets).toBe(61);
  });

  it('handles a full-year window', () => {
    const buckets = buildWeeklyBuckets([row({ bucket: 51, sessions: 1 })], SINCE, 52);
    expect(buckets).toHaveLength(52);
    expect(buckets[51].sessions).toBe(1);
  });

  // since is the caller's *local* Monday and sessions.date is a Postgres date
  // with no time in it, so nothing here may re-introduce a timezone.
  it('never shifts a week start across a date boundary', () => {
    for (const start of ['2026-01-05', '2026-03-30', '2026-10-26', '2026-12-28']) {
      expect(buildWeeklyBuckets([], start, 1)[0].weekStart).toBe(start);
    }
  });
});

describe('addDaysISO', () => {
  it('advances a date by whole days', () => {
    expect(addDaysISO('2026-06-01', 28)).toBe('2026-06-29');
    expect(addDaysISO('2026-06-01', 0)).toBe('2026-06-01');
    expect(addDaysISO('2026-06-01', 364)).toBe('2027-05-31');
  });

  it('crosses month, year and leap-day boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
  });

  // toISOString() switches to the expanded form `+010000-11-29T...` past year
  // 9999, so `.slice(0, 10)` yielded "+010000-11" — which bound straight into
  // `${until}::date` and 500'd the endpoint. isIsoDate accepts 9999-12-01 and a
  // 52-week window from there crosses the boundary, so this input is reachable.
  it('stays a real date past year 9999 instead of the expanded ISO form', () => {
    const until = addDaysISO('9999-12-01', 364);
    expect(until).toBe('10000-11-29');
    expect(until).toMatch(/^\d{4,}-\d{2}-\d{2}$/);
    expect(until.startsWith('+')).toBe(false);
  });

  it('pads every component so the result is always parseable', () => {
    for (const [from, days] of [['2026-01-01', 5], ['9999-12-31', 1], ['2026-09-30', 1]] as const) {
      expect(addDaysISO(from, days)).toMatch(/^\d{4,}-\d{2}-\d{2}$/);
    }
  });
});
