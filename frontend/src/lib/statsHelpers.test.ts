import {
  mondayOf,
  computeWeekStreak,
  sessionsThisWeek,
  avgPerWeek,
  getWeeklyBarData,
  weeksAgoMonday,
} from './statsHelpers';
import type { Session } from '@app/shared';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** ISO date of the Monday n full weeks before the current Monday. */
function mondayNWeeksAgo(n: number): string {
  const mon = mondayOf(new Date());
  mon.setDate(mon.getDate() - n * 7);
  return isoDate(mon);
}

function makeSession(date: string): Session {
  return {
    id: 'sess',
    userId: 'user',
    routineId: null,
    name: null,
    date,
    status: 'completed',
    startedAt: null,
    completedAt: null,
    durationMinutes: null,
    notes: null,
    createdAt: date + 'T10:00:00Z',
  };
}

// ─── computeWeekStreak ─────────────────────────────────────────────────────────

describe('computeWeekStreak', () => {
  it('returns 0 when there are no sessions', () => {
    expect(computeWeekStreak([])).toBe(0);
  });

  it('returns 1 for sessions only in the current week', () => {
    expect(computeWeekStreak([mondayNWeeksAgo(0)])).toBe(1);
  });

  it('counts sessions in the same week only once (de-duplicates by week)', () => {
    // Two dates both in the same week map to the same week key → streak = 1
    expect(computeWeekStreak([mondayNWeeksAgo(0), mondayNWeeksAgo(0)])).toBe(1);
  });

  it('counts consecutive weeks', () => {
    const dates = [mondayNWeeksAgo(0), mondayNWeeksAgo(1), mondayNWeeksAgo(2)];
    expect(computeWeekStreak(dates)).toBe(3);
  });

  it('breaks the streak at a missing week', () => {
    // This week and 2 weeks ago, but last week is absent
    const dates = [mondayNWeeksAgo(0), mondayNWeeksAgo(2)];
    expect(computeWeekStreak(dates)).toBe(1);
  });

  it('applies grace for the current week not yet trained', () => {
    // Only last week's session; no session this week → grace keeps streak at 1
    expect(computeWeekStreak([mondayNWeeksAgo(1)])).toBe(1);
  });

  it('breaks after last week when neither this week nor last week has a session', () => {
    // Only a session 2 weeks ago → grace covers w=0, then w=1 has no session → break
    expect(computeWeekStreak([mondayNWeeksAgo(2)])).toBe(0);
  });
});

// ─── sessionsThisWeek ─────────────────────────────────────────────────────────

describe('sessionsThisWeek', () => {
  it('returns 0 for an empty list', () => {
    expect(sessionsThisWeek([])).toBe(0);
  });

  it('counts sessions whose date falls in the current Monday-aligned week', () => {
    const thisMonday = mondayNWeeksAgo(0);
    expect(sessionsThisWeek([makeSession(thisMonday)])).toBe(1);
  });

  it('does not count sessions from last week', () => {
    const lastMonday = mondayNWeeksAgo(1);
    expect(sessionsThisWeek([makeSession(lastMonday)])).toBe(0);
  });
});

// ─── avgPerWeek ───────────────────────────────────────────────────────────────

describe('avgPerWeek', () => {
  it('returns 0 for an empty list', () => {
    expect(avgPerWeek([])).toBe(0);
  });

  it('calculates the average over the given window', () => {
    // 4 sessions in 4 weeks = 1.0 avg/week
    const sessions = [0, 1, 2, 3].map((n) => makeSession(mondayNWeeksAgo(n)));
    expect(avgPerWeek(sessions, 4)).toBe(1);
  });

  it('excludes sessions outside the window', () => {
    // One session 10 weeks ago should not appear in a 4-week window
    const old = makeSession(mondayNWeeksAgo(10));
    expect(avgPerWeek([old], 4)).toBe(0);
  });
});

// ─── weeksAgoMonday ───────────────────────────────────────────────────────────

describe('weeksAgoMonday', () => {
  it('returns the current Monday for weeks = 1', () => {
    const mon = mondayOf(new Date());
    const y = mon.getFullYear();
    const m = String(mon.getMonth() + 1).padStart(2, '0');
    const d = String(mon.getDate()).padStart(2, '0');
    expect(weeksAgoMonday(1)).toBe(`${y}-${m}-${d}`);
  });

  it('returns a Monday 7 weeks back for the default 8-week window', () => {
    const result = weeksAgoMonday();
    const parsed = new Date(result + 'T00:00:00');
    expect(parsed.getDay()).toBe(1); // Monday
    const diffDays = Math.round((mondayOf(new Date()).getTime() - parsed.getTime()) / 86_400_000);
    expect(diffDays).toBe(49);
  });
});

// ─── getWeeklyBarData ─────────────────────────────────────────────────────────

describe('getWeeklyBarData', () => {
  it('returns an array with `weeks` entries (default 8)', () => {
    expect(getWeeklyBarData([])).toHaveLength(8);
  });

  it('respects a custom weeks argument', () => {
    expect(getWeeklyBarData([], 4)).toHaveLength(4);
  });

  it('labels the last bucket as "This\\nweek"', () => {
    const data = getWeeklyBarData([]);
    expect(data[data.length - 1].label).toBe('This\nweek');
  });

  it('counts a session dated today in the last (current-week) bucket', () => {
    const today = isoDate(new Date());
    const data = getWeeklyBarData([makeSession(today)]);
    expect(data[data.length - 1].value).toBe(1);
  });

  it('does not count sessions from more than `weeks` weeks ago', () => {
    // 9 weeks ago is outside the default 8-week window
    const old = new Date();
    old.setDate(old.getDate() - 9 * 7);
    const data = getWeeklyBarData([makeSession(isoDate(old))]);
    expect(data.every((d) => d.value === 0)).toBe(true);
  });

  it('bucketes a session from last week into the second-to-last bucket', () => {
    const lastMonday = mondayNWeeksAgo(1);
    const data = getWeeklyBarData([makeSession(lastMonday)]);
    expect(data[data.length - 2].value).toBe(1);
    expect(data[data.length - 1].value).toBe(0);
  });
});
