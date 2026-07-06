import { describe, it, expect } from 'vitest';
import { ROUNDS_SCHEMA } from '@app/shared';
import type { RoundsSessionDetails } from '@app/shared';
import { aggregatePartnerStats, type PartnerRow } from './partnerStats';
import type { MatEntryRow } from './matStats';

const partners: PartnerRow[] = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

function grappling(rounds: RoundsSessionDetails['rounds']): RoundsSessionDetails {
  return { schema: ROUNDS_SCHEMA, category: 'grappling', rounds } as RoundsSessionDetails;
}

function row(sessionId: string, date: string, details: unknown): MatEntryRow {
  return { sessionId, sessionDate: date, sessionDurationMinutes: null, details };
}

describe('aggregatePartnerStats', () => {
  it('returns [] when there are no rounds', () => {
    expect(aggregatePartnerStats([], partners)).toEqual([]);
  });

  it('aggregates rounds, minutes, sessions, subs, and last date per partner', () => {
    const rows = [
      row('s1', '2026-07-01', grappling([
        { id: 'r1', partnerId: 'p1', durationSeconds: 300, submissionsFor: 2, submissionsAgainst: 1 },
        { id: 'r2', partnerId: 'p1', durationSeconds: 300, submissionsFor: 1 },
        { id: 'r3', partnerId: 'p2', durationSeconds: 300 },
      ])),
      row('s2', '2026-07-03', grappling([
        { id: 'r4', partnerId: 'p1', durationSeconds: 360, submissionsAgainst: 1 },
      ])),
    ];
    const stats = aggregatePartnerStats(rows, partners);

    expect(stats).toHaveLength(2);
    const alice = stats.find((s) => s.partnerId === 'p1')!;
    expect(alice).toMatchObject({
      name: 'Alice',
      rounds: 3,
      minutes: 16, // (300+300+360)/60 = 16
      sessions: 2,
      submissionsFor: 3,
      submissionsAgainst: 2,
      lastDate: '2026-07-03',
    });
    const bob = stats.find((s) => s.partnerId === 'p2')!;
    expect(bob.rounds).toBe(1);
  });

  it('breaks ties alphabetically and keeps Unassigned last', () => {
    // All three tie at 2 rounds → named partners sort alphabetically, Unassigned sinks.
    const rows = [
      row('s1', '2026-07-01', grappling([
        { id: 'r1', partnerId: 'p2' },
        { id: 'r6', partnerId: 'p2' },
        { id: 'r2' }, // unassigned
        { id: 'r3' }, // unassigned
        { id: 'r4', partnerId: 'p1' },
        { id: 'r5', partnerId: 'p1' },
      ])),
    ];
    const stats = aggregatePartnerStats(rows, partners);
    expect(stats.map((s) => s.partnerId)).toEqual(['p1', 'p2', null]);
    expect(stats[2].name).toBe('Unassigned');
  });

  it('ranks a higher-round Unassigned bucket above lower-round partners', () => {
    const rows = [
      row('s1', '2026-07-01', grappling([
        { id: 'r1', partnerId: 'p2' }, // p2: 1 round
        { id: 'r2' }, { id: 'r3' },    // unassigned: 2 rounds
      ])),
    ];
    const stats = aggregatePartnerStats(rows, partners);
    expect(stats.map((s) => s.partnerId)).toEqual([null, 'p2']);
  });

  it('skips rounds referencing a deleted partner', () => {
    const rows = [
      row('s1', '2026-07-01', grappling([
        { id: 'r1', partnerId: 'ghost' },
        { id: 'r2', partnerId: 'p1' },
      ])),
    ];
    const stats = aggregatePartnerStats(rows, partners);
    expect(stats).toHaveLength(1);
    expect(stats[0].partnerId).toBe('p1');
  });

  it('ignores legacy (non-rounds) entries', () => {
    const rows = [row('s1', '2026-07-01', { rounds: 4, focus: 'guard' })];
    expect(aggregatePartnerStats(rows, partners)).toEqual([]);
  });
});
