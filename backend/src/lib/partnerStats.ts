import { isRoundsSession } from '@app/shared';
import type { PartnerStatsItem } from '@app/shared';
import type { MatEntryRow } from './matStats';

/** Minimal partner row for name resolution. */
export interface PartnerRow {
  id: string;
  name: string;
}

const UNASSIGNED = '__unassigned__';

/**
 * Aggregate martial-arts rounds by training partner: rounds together, mat
 * minutes, distinct sessions, submissions for/against (grappling + MMA), and
 * the most recent date rolled together. Rounds with no partnerId collect in an
 * "Unassigned" bucket, included only when it has rounds.
 */
export function aggregatePartnerStats(
  rows: MatEntryRow[],
  partners: PartnerRow[],
): PartnerStatsItem[] {
  const names = new Map(partners.map((p) => [p.id, p.name]));

  interface Acc {
    rounds: number;
    seconds: number;
    submissionsFor: number;
    submissionsAgainst: number;
    sessions: Set<string>;
    lastDate: string | null;
  }
  const byPartner = new Map<string, Acc>();

  const get = (key: string): Acc => {
    let acc = byPartner.get(key);
    if (!acc) {
      acc = { rounds: 0, seconds: 0, submissionsFor: 0, submissionsAgainst: 0, sessions: new Set(), lastDate: null };
      byPartner.set(key, acc);
    }
    return acc;
  };

  for (const row of rows) {
    if (!isRoundsSession(row.details)) continue;
    const category = row.details.category;

    for (const round of row.details.rounds) {
      const key = round.partnerId ?? UNASSIGNED;
      // Skip partner rows that no longer exist (deleted partner) unless unassigned.
      if (key !== UNASSIGNED && !names.has(key)) continue;

      const acc = get(key);
      acc.rounds += 1;
      acc.seconds += round.durationSeconds ?? 0;
      acc.sessions.add(row.sessionId);
      if (!acc.lastDate || row.sessionDate > acc.lastDate) acc.lastDate = row.sessionDate;

      if (category === 'grappling' || category === 'mixed') {
        const r = round as { submissionsFor?: number; submissionsAgainst?: number };
        acc.submissionsFor += r.submissionsFor ?? 0;
        acc.submissionsAgainst += r.submissionsAgainst ?? 0;
      }
    }
  }

  const items: PartnerStatsItem[] = [];
  for (const [key, acc] of byPartner) {
    if (acc.rounds === 0) continue;
    items.push({
      partnerId: key === UNASSIGNED ? null : key,
      name: key === UNASSIGNED ? 'Unassigned' : names.get(key) ?? 'Unknown',
      rounds: acc.rounds,
      minutes: Math.round(acc.seconds / 60),
      sessions: acc.sessions.size,
      submissionsFor: acc.submissionsFor,
      submissionsAgainst: acc.submissionsAgainst,
      lastDate: acc.lastDate,
    });
  }

  // Most-trained first; Unassigned sinks to the bottom on ties by staying last.
  items.sort((a, b) => {
    if (b.rounds !== a.rounds) return b.rounds - a.rounds;
    if (a.partnerId === null) return 1;
    if (b.partnerId === null) return -1;
    return a.name.localeCompare(b.name);
  });

  return items;
}
