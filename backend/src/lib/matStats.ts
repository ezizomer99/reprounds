import { isRoundsSession } from '@app/shared';
import type { MatStatsResponse, MatWeekBucket, StrikeWeapon } from '@app/shared';

/** One completed martial-arts session entry, as selected by the /stats/mat route. */
export interface MatEntryRow {
  sessionId: string;
  /** sessions.date, YYYY-MM-DD. */
  sessionDate: string;
  /** sessions.duration_minutes — fallback mat time for mat-only sessions. */
  sessionDurationMinutes: number | null;
  /** session_entries.details (rounds.v1 payload or legacy field_config values). */
  details: unknown;
}

const WEEK_MS = 7 * 86_400_000;
// Legacy field_config payloads store a free-typed rounds number; cap it so a
// typo ("400") can't wreck the chart scale.
const LEGACY_ROUNDS_CAP = 100;

function utcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The four buckets MatStatsResponse.intensity declares — anything else folds into 'unspecified'. */
const INTENSITY_KEYS = ['light', 'medium', 'hard', 'unspecified'] as const;
type IntensityKey = (typeof INTENSITY_KEYS)[number];

function intensityKey(value: unknown): IntensityKey {
  return INTENSITY_KEYS.includes(value as IntensityKey) ? (value as IntensityKey) : 'unspecified';
}

/**
 * Aggregate martial-arts entries into weekly buckets + totals.
 *
 * @param rows completed MA entries with session date/duration
 * @param mixedSessionIds sessions that also contain gym entries — their
 *   session-level duration is NOT attributed to mat time
 * @param since ISO Monday of the oldest bucket
 * @param weeks number of 7-day buckets starting at `since`
 */
export function aggregateMatStats(
  rows: MatEntryRow[],
  mixedSessionIds: Set<string>,
  since: string,
  weeks: number,
): MatStatsResponse {
  const sinceMs = utcMs(since);

  const buckets: MatWeekBucket[] = Array.from({ length: weeks }, (_, i) => ({
    weekStart: isoDate(sinceMs + i * WEEK_MS),
    rounds: 0,
    minutes: 0,
    sessions: 0,
  }));
  // Fractional mat minutes per bucket, rounded once at the end.
  const bucketMinutes = new Array<number>(weeks).fill(0);

  const result: MatStatsResponse = {
    weeks: buckets,
    totals: { sessions: 0, rounds: 0, minutes: 0 },
    intensity: { light: 0, medium: 0, hard: 0, unspecified: 0 },
    grappling: {
      rounds: 0,
      submissionsFor: 0,
      submissionsAgainst: 0,
      submissionsForByType: {},
      submissionsAgainstByType: {},
      sweeps: 0,
      takedowns: 0,
      positions: {},
    },
    striking: { rounds: 0, roundsByType: {}, strikes: {}, totalStrikes: 0 },
  };

  // Mat time is attributed per session, not per entry: sum round durations
  // across a session's entries, falling back to the session's own duration
  // only when the whole session was mat work.
  const perSession = new Map<
    string,
    { bucket: number; roundSeconds: number; durationMinutes: number | null }
  >();

  const addStrikes = (strikes: Partial<Record<StrikeWeapon, number>> | undefined) => {
    for (const [weapon, n] of Object.entries(strikes ?? {}) as [StrikeWeapon, number][]) {
      if (!Number.isFinite(n) || n <= 0) continue;
      result.striking.strikes[weapon] = (result.striking.strikes[weapon] ?? 0) + n;
      result.striking.totalStrikes += n;
    }
  };

  // Fold a { key: count } breakdown map into a running total map, skipping
  // non-positive/NaN counts (defensive against malformed stored data).
  const foldCounts = (target: Record<string, number>, src: Record<string, number> | undefined) => {
    for (const [key, n] of Object.entries(src ?? {})) {
      if (!Number.isFinite(n) || n <= 0) continue;
      target[key] = (target[key] ?? 0) + n;
    }
  };

  for (const row of rows) {
    const bucket = Math.floor((utcMs(row.sessionDate) - sinceMs) / WEEK_MS);
    if (bucket < 0 || bucket >= weeks) continue;

    let session = perSession.get(row.sessionId);
    if (!session) {
      session = { bucket, roundSeconds: 0, durationMinutes: row.sessionDurationMinutes };
      perSession.set(row.sessionId, session);
    }

    let entryRounds = 0;

    if (isRoundsSession(row.details)) {
      const details = row.details;
      entryRounds = details.rounds.length;

      for (const round of details.rounds) {
        session.roundSeconds += round.durationSeconds ?? 0;
        // Whitelisted, unlike the plain `result.intensity[round.intensity]++`
        // this replaces. `details` is stored verbatim, so a value outside the
        // three known ones indexed a key that didn't exist: `undefined + 1` is
        // NaN, and the response came back with an extra `{ brutal: null }` that
        // MatStatsResponse.intensity doesn't declare and that turns any client
        // summing Object.values into NaN. Every other accumulator in this file
        // already guards its input; this was the one that didn't.
        result.intensity[intensityKey(round.intensity)] += 1;
      }

      // Branch on the payload's own discriminant — the joined discipline row
      // can be gone (deleted discipline) while the entry's data lives on.
      switch (details.category) {
        case 'grappling':
          result.grappling.rounds += details.rounds.length;
          for (const round of details.rounds) {
            result.grappling.submissionsFor += round.submissionsFor ?? 0;
            result.grappling.submissionsAgainst += round.submissionsAgainst ?? 0;
            foldCounts(result.grappling.submissionsForByType, round.submissionsForTypes);
            foldCounts(result.grappling.submissionsAgainstByType, round.submissionsAgainstTypes);
            result.grappling.sweeps += round.sweeps ?? 0;
            result.grappling.takedowns += round.takedowns ?? 0;
            for (const pos of round.positions ?? []) {
              result.grappling.positions[pos] = (result.grappling.positions[pos] ?? 0) + 1;
            }
          }
          break;
        case 'striking':
          result.striking.rounds += details.rounds.length;
          for (const round of details.rounds) {
            if (round.roundType) {
              result.striking.roundsByType[round.roundType] =
                (result.striking.roundsByType[round.roundType] ?? 0) + 1;
            }
            addStrikes(round.strikes);
          }
          break;
        case 'mixed':
          // MMA rounds fold their counters into both blocks without bumping
          // either block's category-pure round count.
          for (const round of details.rounds) {
            result.grappling.submissionsFor += round.submissionsFor ?? 0;
            result.grappling.submissionsAgainst += round.submissionsAgainst ?? 0;
            result.grappling.takedowns += round.takedownsLanded ?? 0;
            addStrikes(round.strikes);
          }
          break;
      }
    } else if (typeof row.details === 'object' && row.details !== null) {
      const legacy = Number((row.details as { rounds?: unknown }).rounds);
      if (Number.isFinite(legacy) && legacy > 0) {
        entryRounds = Math.min(Math.floor(legacy), LEGACY_ROUNDS_CAP);
      }
    }

    buckets[bucket].rounds += entryRounds;
    result.totals.rounds += entryRounds;
  }

  for (const [sessionId, session] of perSession) {
    buckets[session.bucket].sessions += 1;
    result.totals.sessions += 1;

    if (session.roundSeconds > 0) {
      bucketMinutes[session.bucket] += session.roundSeconds / 60;
    } else if (!mixedSessionIds.has(sessionId) && session.durationMinutes) {
      bucketMinutes[session.bucket] += session.durationMinutes;
    }
  }

  for (let i = 0; i < weeks; i++) {
    buckets[i].minutes = Math.round(bucketMinutes[i]);
    result.totals.minutes += buckets[i].minutes;
  }

  return result;
}
