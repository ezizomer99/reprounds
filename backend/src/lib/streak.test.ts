import { describe, it, expect } from 'vitest';
import { mondayOfISO, weekStreak } from './streak';

const ANCHOR = '2026-08-03'; // a Monday

/** ISO Monday `n` weeks before the anchor. */
function weeksBack(n: number): string {
  return new Date(Date.parse(ANCHOR + 'T00:00:00Z') - n * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe('mondayOfISO', () => {
  it('returns the containing Monday for every day of a week', () => {
    for (const d of [
      '2026-08-03', // Mon
      '2026-08-04',
      '2026-08-06',
      '2026-08-09', // Sun
    ]) {
      expect(mondayOfISO(d)).toBe('2026-08-03');
    }
  });

  it('is idempotent, and rolls back across a month boundary', () => {
    expect(mondayOfISO(mondayOfISO('2026-08-06'))).toBe('2026-08-03');
    expect(mondayOfISO('2026-09-01')).toBe('2026-08-31'); // Tuesday → previous Monday
    expect(mondayOfISO('2027-01-01')).toBe('2026-12-28'); // Friday → previous year
  });
});

// These mirror the client's computeWeekStreak cases one for one. The number this
// endpoint returns replaces the one the app computed locally, so the two have to
// agree — including the grace rule, which is the part users would notice moving.
describe('weekStreak', () => {
  it('returns 0 when nothing has been trained', () => {
    expect(weekStreak([], ANCHOR)).toBe(0);
  });

  it('returns 1 for the current week only', () => {
    expect(weekStreak([weeksBack(0)], ANCHOR)).toBe(1);
  });

  it('de-duplicates repeated week keys', () => {
    expect(weekStreak([weeksBack(0), weeksBack(0), weeksBack(0)], ANCHOR)).toBe(1);
  });

  it('counts consecutive weeks', () => {
    expect(weekStreak([weeksBack(0), weeksBack(1), weeksBack(2)], ANCHOR)).toBe(3);
  });

  it('breaks at a missing week', () => {
    expect(weekStreak([weeksBack(0), weeksBack(2)], ANCHOR)).toBe(1);
  });

  it('grants grace for a current week not yet trained', () => {
    expect(weekStreak([weeksBack(1)], ANCHOR)).toBe(1);
  });

  it('breaks when neither this week nor last week has a session', () => {
    expect(weekStreak([weeksBack(2)], ANCHOR)).toBe(0);
  });

  it('ignores order', () => {
    expect(weekStreak([weeksBack(2), weeksBack(0), weeksBack(1)], ANCHOR)).toBe(3);
  });

  // The whole reason this moved server-side: the client fed it the 200 most
  // recent sessions, which at five a week is ~40 weeks of visibility.
  it('counts a run far longer than a 200-session page could have shown', () => {
    const weeks = Array.from({ length: 120 }, (_, i) => weeksBack(i));
    expect(weekStreak(weeks, ANCHOR)).toBe(120);
  });

  it('stops at its 520-week bound rather than looping forever', () => {
    const weeks = Array.from({ length: 600 }, (_, i) => weeksBack(i));
    expect(weekStreak(weeks, ANCHOR)).toBe(520);
  });

  // Session dates are accepted arbitrarily far into the future, so a mistyped
  // year must not manufacture a run. The endpoint also bounds this in SQL; the
  // walk not trusting its input is the second line of defence.
  it('ignores weeks after the anchor', () => {
    expect(weekStreak([weeksBack(-4), weeksBack(-1)], ANCHOR)).toBe(0);
    expect(weekStreak([weeksBack(-1), weeksBack(0), weeksBack(1)], ANCHOR)).toBe(2);
  });
});
