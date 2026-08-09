import type { Session } from '@app/shared';
import { addDaysISO } from '@app/shared';
import { buildWeekStrip, weekSummary } from './weekStrip';
import { MAX_MARKERS } from './sessionMarkers';
import { weekRangeOf } from './statsHelpers';

/**
 * A session with only the fields the strip reads. Nothing here hardcodes a date:
 * every case derives its days from the Monday of the week under test, so the
 * suite doesn't rot or drift with the day it runs on.
 */
function session(partial: Partial<Session> & { date: string }): Session {
  return {
    id: `s-${partial.date}-${partial.status ?? 'completed'}-${Math.random()}`,
    status: 'completed',
    kinds: ['exercise'],
    ...partial,
  } as Session;
}

/** A fixed reference week — a Wednesday, so there are days on both sides. */
const TODAY = '2026-03-11';
const { from: MONDAY } = weekRangeOf(TODAY);
const day = (i: number) => addDaysISO(MONDAY, i);

describe('buildWeekStrip', () => {
  it('returns Monday through Sunday of the week containing today', () => {
    const { days } = buildWeekStrip(TODAY, []);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.abbrev)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    expect(days[0].isoDate).toBe(MONDAY);
    expect(days[6].isoDate).toBe(addDaysISO(MONDAY, 6));
  });

  it('marks exactly one day as today, and the days after it as future', () => {
    const { days } = buildWeekStrip(TODAY, []);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
    expect(days.find((d) => d.isToday)?.isoDate).toBe(TODAY);

    const todayIdx = days.findIndex((d) => d.isToday);
    expect(days.slice(0, todayIdx + 1).every((d) => !d.isFuture)).toBe(true);
    expect(days.slice(todayIdx + 1).every((d) => d.isFuture)).toBe(true);
  });

  // The week the month changes underneath it — the old hand-rolled Monday
  // arithmetic in the week block had to agree with weekKey, and only did by
  // accident.
  it('spans a month boundary without losing a day', () => {
    const endOfMonth = '2026-04-01'; // a Wednesday; the week starts in March
    const { days } = buildWeekStrip(endOfMonth, []);
    expect(days.map((d) => d.isoDate)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-04',
      '2026-04-05',
    ]);
    expect(days.map((d) => d.dayNum)).toEqual([30, 31, 1, 2, 3, 4, 5]);
  });

  it('ignores sessions outside the week', () => {
    const { days, counts } = buildWeekStrip(TODAY, [
      session({ date: addDaysISO(MONDAY, -1) }),
      session({ date: addDaysISO(MONDAY, 7) }),
    ]);
    expect(counts.completed).toBe(0);
    expect(days.every((d) => d.markers.length === 0)).toBe(true);
  });

  it('puts a session on its own day only', () => {
    const { days } = buildWeekStrip(TODAY, [session({ date: day(1) })]);
    expect(days[1].markers).toEqual([{ tone: 'gym', style: 'filled' }]);
    expect(days.filter((d) => d.markers.length > 0)).toHaveLength(1);
  });

  it('distinguishes gym from mat', () => {
    const { days, counts } = buildWeekStrip(TODAY, [
      session({ date: day(0), kinds: ['exercise'] }),
      session({ date: day(1), kinds: ['martial_arts'] }),
    ]);
    expect(days[0].markers).toEqual([{ tone: 'gym', style: 'filled' }]);
    expect(days[1].markers).toEqual([{ tone: 'mat', style: 'filled' }]);
    expect(counts.gym).toBe(1);
    expect(counts.mat).toBe(1);
  });

  // The states the private three-case version silently dropped.
  it('renders in_progress and skipped, not just completed and planned', () => {
    const { days } = buildWeekStrip(TODAY, [
      session({ date: day(0), status: 'in_progress' }),
      session({ date: day(1), status: 'skipped' }),
    ]);
    expect(days[0].markers).toEqual([{ tone: 'gym', style: 'core' }]);
    expect(days[1].markers).toEqual([{ tone: 'muted', style: 'faded' }]);
  });

  it('separates a planned day still to come from one that has passed', () => {
    const { days } = buildWeekStrip(TODAY, [
      session({ date: day(0), status: 'planned' }), // Monday, already gone
      session({ date: day(4), status: 'planned' }), // Friday, still coming
    ]);
    expect(days[0].markers).toEqual([{ tone: 'muted', style: 'overdue' }]);
    expect(days[4].markers).toEqual([{ tone: 'gym', style: 'hollow' }]);
  });

  it('collapses duplicate markers on one day', () => {
    const { days, counts } = buildWeekStrip(TODAY, [
      session({ date: day(2) }),
      session({ date: day(2) }),
      session({ date: day(2) }),
    ]);
    expect(days[2].markers).toHaveLength(1);
    // Three sessions, one dot — the count must still say three.
    expect(counts.completed).toBe(3);
  });

  it('shows both a completed and a planned session on the same day', () => {
    const { days } = buildWeekStrip(TODAY, [
      session({ date: day(4), status: 'completed' }),
      session({ date: day(4), status: 'planned' }),
    ]);
    expect(days[4].markers).toEqual([
      { tone: 'gym', style: 'filled' },
      { tone: 'gym', style: 'hollow' },
    ]);
  });

  it('flags a day with more distinct markers than it can draw', () => {
    const crowded = [
      session({ date: day(3), status: 'completed', kinds: ['exercise'] }),
      session({ date: day(3), status: 'completed', kinds: ['martial_arts'] }),
      session({ date: day(3), status: 'in_progress', kinds: ['exercise'] }),
      session({ date: day(3), status: 'in_progress', kinds: ['martial_arts'] }),
      session({ date: day(3), status: 'planned', kinds: ['exercise'] }),
      session({ date: day(3), status: 'skipped', kinds: ['exercise'] }),
    ];
    const { days } = buildWeekStrip(TODAY, crowded);
    expect(days[3].markers).toHaveLength(MAX_MARKERS);
    expect(days[3].overflow).toBe(true);
  });

  it('does not flag overflow on an ordinary day', () => {
    const { days } = buildWeekStrip(TODAY, [session({ date: day(3) })]);
    expect(days[3].overflow).toBe(false);
  });
});

describe('weekCounts', () => {
  // The contradiction this replaces: dots included planned sessions, the
  // sentence counted only completed ones, and the two sat 40px apart.
  it('counts completed and planned separately, from the same list the dots use', () => {
    const { days, counts } = buildWeekStrip(TODAY, [
      session({ date: day(0), status: 'completed' }),
      session({ date: day(1), status: 'completed' }),
      session({ date: day(4), status: 'planned' }),
      session({ date: day(5), status: 'planned' }),
    ]);
    expect(counts).toMatchObject({ completed: 2, planned: 2 });
    expect(days.filter((d) => d.markers.length > 0)).toHaveLength(4);
  });

  it('ignores in_progress and skipped in both tallies', () => {
    const { counts } = buildWeekStrip(TODAY, [
      session({ date: day(0), status: 'in_progress' }),
      session({ date: day(1), status: 'skipped' }),
    ]);
    expect(counts).toMatchObject({ completed: 0, planned: 0, gym: 0, mat: 0 });
  });

  it('counts a session with no kinds as gym, matching how it is drawn', () => {
    const { counts, days } = buildWeekStrip(TODAY, [session({ date: day(0), kinds: [] })]);
    expect(counts.gym).toBe(1);
    expect(days[0].markers[0].tone).toBe('gym');
  });
});

describe('weekSummary', () => {
  it('names both halves when both exist', () => {
    expect(weekSummary({ completed: 3, planned: 1, gym: 3, mat: 0 })).toBe('3 logged · 1 planned');
  });

  it('drops a clause at zero rather than saying "0 planned"', () => {
    expect(weekSummary({ completed: 3, planned: 0, gym: 3, mat: 0 })).toBe('3 logged');
    expect(weekSummary({ completed: 0, planned: 2, gym: 0, mat: 0 })).toBe('2 planned');
  });

  it('prompts instead of tallying an empty week', () => {
    expect(weekSummary({ completed: 0, planned: 0, gym: 0, mat: 0 })).toBe(
      'Log a session to start your streak',
    );
  });
});
