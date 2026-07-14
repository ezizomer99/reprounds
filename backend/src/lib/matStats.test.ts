import { describe, it, expect } from 'vitest';
import { ROUNDS_SCHEMA } from '@app/shared';
import type { RoundsSessionDetails } from '@app/shared';
import { aggregateMatStats, type MatEntryRow } from './matStats';

const SINCE = '2026-06-01'; // a Monday
const WEEKS = 4;

function grappling(rounds: RoundsSessionDetails['rounds']): RoundsSessionDetails {
  return { schema: ROUNDS_SCHEMA, category: 'grappling', rounds } as RoundsSessionDetails;
}

function striking(rounds: RoundsSessionDetails['rounds']): RoundsSessionDetails {
  return { schema: ROUNDS_SCHEMA, category: 'striking', rounds } as RoundsSessionDetails;
}

function mixed(rounds: RoundsSessionDetails['rounds']): RoundsSessionDetails {
  return { schema: ROUNDS_SCHEMA, category: 'mixed', rounds } as RoundsSessionDetails;
}

function row(overrides: Partial<MatEntryRow>): MatEntryRow {
  return {
    sessionId: 's1',
    sessionDate: '2026-06-02',
    sessionDurationMinutes: null,
    details: null,
    ...overrides,
  };
}

describe('aggregateMatStats', () => {
  it('returns all-zero buckets for no entries', () => {
    const res = aggregateMatStats([], new Set(), SINCE, WEEKS);
    expect(res.weeks).toHaveLength(WEEKS);
    expect(res.weeks[0]).toEqual({ weekStart: '2026-06-01', rounds: 0, minutes: 0, sessions: 0 });
    expect(res.weeks[3].weekStart).toBe('2026-06-22');
    expect(res.totals).toEqual({ sessions: 0, rounds: 0, minutes: 0 });
  });

  it('aggregates grappling rounds: counts, intensity, sparring numbers, minutes', () => {
    const details = grappling([
      { id: 'r1', durationSeconds: 300, intensity: 'hard', submissionsFor: 2, submissionsAgainst: 1, sweeps: 1, takedowns: 3 },
      { id: 'r2', durationSeconds: 300, intensity: 'light', submissionsFor: 1 },
      { id: 'r3' }, // no duration/intensity
    ]);
    const res = aggregateMatStats([row({ details })], new Set(), SINCE, WEEKS);

    expect(res.totals).toEqual({ sessions: 1, rounds: 3, minutes: 10 });
    expect(res.weeks[0]).toEqual({ weekStart: '2026-06-01', rounds: 3, minutes: 10, sessions: 1 });
    expect(res.intensity).toEqual({ light: 1, medium: 0, hard: 1, unspecified: 1 });
    expect(res.grappling).toEqual({
      rounds: 3,
      submissionsFor: 3,
      submissionsAgainst: 1,
      submissionsForByType: {},
      submissionsAgainstByType: {},
      sweeps: 1,
      takedowns: 3,
      positions: {},
    });
    expect(res.striking.rounds).toBe(0);
  });

  it('aggregates grappling positions and submission-type breakdowns', () => {
    const details = grappling([
      {
        id: 'r1',
        submissionsFor: 2,
        submissionsForTypes: { armbar: 1, triangle: 1 },
        submissionsAgainst: 1,
        submissionsAgainstTypes: { rnc: 1 },
        positions: ['mount', 'closed_guard'],
      },
      {
        id: 'r2',
        submissionsFor: 1,
        submissionsForTypes: { armbar: 1 },
        positions: ['mount'],
      },
    ]);
    const res = aggregateMatStats([row({ details })], new Set(), SINCE, WEEKS);

    expect(res.grappling.submissionsFor).toBe(3);
    expect(res.grappling.submissionsForByType).toEqual({ armbar: 2, triangle: 1 });
    expect(res.grappling.submissionsAgainstByType).toEqual({ rnc: 1 });
    expect(res.grappling.positions).toEqual({ mount: 2, closed_guard: 1 });
  });

  it('treats legacy grappling rounds without the new fields as empty breakdowns', () => {
    const details = grappling([{ id: 'r1', submissionsFor: 2 }]);
    const res = aggregateMatStats([row({ details })], new Set(), SINCE, WEEKS);

    expect(res.grappling.submissionsFor).toBe(2);
    expect(res.grappling.submissionsForByType).toEqual({});
    expect(res.grappling.positions).toEqual({});
  });

  it('aggregates striking rounds: types and strike counts', () => {
    const details = striking([
      { id: 'r1', roundType: 'pads', strikes: { jab: 20, cross: 10 } },
      { id: 'r2', roundType: 'pads', strikes: { jab: 5 } },
      { id: 'r3', roundType: 'sparring' },
    ]);
    const res = aggregateMatStats([row({ details })], new Set(), SINCE, WEEKS);

    expect(res.striking.rounds).toBe(3);
    expect(res.striking.roundsByType).toEqual({ pads: 2, sparring: 1 });
    expect(res.striking.strikes).toEqual({ jab: 25, cross: 10 });
    expect(res.striking.totalStrikes).toBe(35);
    expect(res.grappling.rounds).toBe(0);
  });

  it('folds mixed rounds into both blocks without bumping their round counts', () => {
    const details = mixed([
      { id: 'r1', submissionsFor: 1, takedownsLanded: 2, strikes: { hook: 4 } },
    ]);
    const res = aggregateMatStats([row({ details })], new Set(), SINCE, WEEKS);

    expect(res.totals.rounds).toBe(1);
    expect(res.grappling.rounds).toBe(0);
    expect(res.grappling.submissionsFor).toBe(1);
    expect(res.grappling.takedowns).toBe(2);
    expect(res.striking.rounds).toBe(0);
    expect(res.striking.strikes).toEqual({ hook: 4 });
    expect(res.striking.totalStrikes).toBe(4);
  });

  it('counts legacy field_config rounds (number and numeric string), capped', () => {
    const res = aggregateMatStats(
      [
        row({ sessionId: 's1', details: { rounds: 4, focus: 'guard passing' } }),
        row({ sessionId: 's2', details: { rounds: '5' } }),
        row({ sessionId: 's3', details: { rounds: 4000 } }),
        row({ sessionId: 's4', details: { focus: 'no rounds key' } }),
      ],
      new Set(),
      SINCE,
      WEEKS,
    );
    expect(res.totals.rounds).toBe(4 + 5 + 100);
    expect(res.totals.sessions).toBe(4);
    expect(res.intensity).toEqual({ light: 0, medium: 0, hard: 0, unspecified: 0 });
  });

  it('falls back to session duration for mat-only sessions without round durations', () => {
    const details = grappling([{ id: 'r1' }, { id: 'r2' }]);
    const res = aggregateMatStats(
      [row({ details, sessionDurationMinutes: 60 })],
      new Set(),
      SINCE,
      WEEKS,
    );
    expect(res.totals.minutes).toBe(60);
  });

  it('does not attribute session duration when the session also has gym entries', () => {
    const details = grappling([{ id: 'r1' }]);
    const res = aggregateMatStats(
      [row({ sessionId: 'mixed-1', details, sessionDurationMinutes: 90 })],
      new Set(['mixed-1']),
      SINCE,
      WEEKS,
    );
    expect(res.totals.minutes).toBe(0);
  });

  it('prefers summed round durations over session duration', () => {
    const details = grappling([{ id: 'r1', durationSeconds: 600 }]);
    const res = aggregateMatStats(
      [row({ details, sessionDurationMinutes: 60 })],
      new Set(),
      SINCE,
      WEEKS,
    );
    expect(res.totals.minutes).toBe(10);
  });

  it('buckets by week and drops out-of-range dates', () => {
    const mk = (id: string, date: string) =>
      row({ sessionId: id, sessionDate: date, details: grappling([{ id: 'r' }]) });
    const res = aggregateMatStats(
      [
        mk('a', '2026-06-01'), // week 0 (boundary)
        mk('b', '2026-06-07'), // week 0 (last day)
        mk('c', '2026-06-08'), // week 1 (boundary)
        mk('d', '2026-06-28'), // week 3
        mk('e', '2026-05-31'), // before window — dropped
        mk('f', '2026-06-29'), // after window — dropped
      ],
      new Set(),
      SINCE,
      WEEKS,
    );
    expect(res.weeks.map((w) => w.rounds)).toEqual([2, 1, 0, 1]);
    expect(res.weeks.map((w) => w.sessions)).toEqual([2, 1, 0, 1]);
    expect(res.totals.rounds).toBe(4);
    expect(res.totals.sessions).toBe(4);
  });

  it('merges multiple entries from the same session', () => {
    const res = aggregateMatStats(
      [
        row({ details: grappling([{ id: 'r1', durationSeconds: 300 }]) }),
        row({ details: striking([{ id: 'r2', durationSeconds: 300 }]) }),
      ],
      new Set(),
      SINCE,
      WEEKS,
    );
    expect(res.totals.sessions).toBe(1);
    expect(res.totals.rounds).toBe(2);
    expect(res.totals.minutes).toBe(10);
  });
});
