import { estimatedOneRepMax } from '@app/shared';
import type { ExercisePRsResponse } from '@app/shared';

/**
 * Whether a set just completed in the logger beats what the lifter had done
 * before.
 *
 * This has to agree with the server, which is the only thing the Stats tab and
 * the PR feed read. `GET /exercises/:id/prs` and `GET /stats/prs` both rank by
 * **Epley e1RM** over completed, non-warm-up sets; the logger used to compare
 * raw weight against the last *five* sessions' maximum, which made it wrong in
 * both directions — a deload block scrolled the real best out of the window so
 * a light set fired "New PR", and a rep PR at an unchanged weight never fired
 * at all.
 *
 * The comparison is deliberately against *completed history only* (the PRs
 * endpoint filters `status = 'completed'`), so the live session's own sets
 * don't become the baseline mid-workout.
 */

/** What the lifter had done before this session. */
export interface PriorBest {
  /** Best Epley e1RM over all completed history; null when none was estimable. */
  e1rmKg: number | null;
  /** Heaviest completed working set; null when nothing has been logged yet. */
  weightKg: number | null;
}

/**
 * An e1RM record is the meaningful one — it captures beating a lift on reps at
 * the same weight. A weight record is still worth celebrating when the set was
 * too high-rep to estimate from (see E1RM_MAX_REPS).
 */
export type PRKind = 'e1rm' | 'weight';

export interface PRHit {
  kind: PRKind;
  /** The value that set the record, in kg. */
  valueKg: number;
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** What a single set is worth, as a prior-best of its own. */
export function bestOfSet(set: { weightKg: number | null; reps: number | null }): PriorBest {
  const { weightKg, reps } = set;
  if (weightKg === null || weightKg <= 0 || reps === null || reps < 1) {
    return { e1rmKg: null, weightKg: null };
  }
  return { e1rmKg: estimatedOneRepMax(weightKg, reps), weightKg };
}

/**
 * The higher of two prior-bests, field by field. Used to fold records set
 * earlier in the live session into the baseline: the PRs endpoint only sees
 * *completed* sessions, so without this a lifter who beats their best on set 1
 * gets the same banner again on every heavier set after it.
 */
export function mergeBest(a: PriorBest, b: PriorBest): PriorBest {
  return {
    e1rmKg: maxOrNull(a.e1rmKg, b.e1rmKg),
    weightKg: maxOrNull(a.weightKg, b.weightKg),
  };
}

/** Reduce the PRs endpoint's payload to the two numbers the check needs. */
export function priorBestFromPRs(
  prs: Pick<ExercisePRsResponse, 'estimatedOneRepMax' | 'bestSet'> | undefined,
): PriorBest {
  return {
    e1rmKg: prs?.estimatedOneRepMax ?? null,
    weightKg: prs?.bestSet?.weight ?? null,
  };
}

/**
 * Does this set beat `prior`? Returns null when it doesn't, or when there is
 * nothing to beat — a lifter's very first session should not celebrate every
 * set, which is also how the old check behaved.
 */
export function checkPR(
  set: { weightKg: number | null; reps: number | null },
  prior: PriorBest,
): PRHit | null {
  const { weightKg, reps } = set;
  if (weightKg === null || weightKg <= 0 || reps === null || reps < 1) return null;
  // Nothing logged before, so nothing has been beaten.
  if (prior.e1rmKg === null && prior.weightKg === null) return null;

  const e1rm = estimatedOneRepMax(weightKg, reps);
  if (e1rm !== null && (prior.e1rmKg === null || e1rm > prior.e1rmKg)) {
    return { kind: 'e1rm', valueKg: e1rm };
  }
  // Above the rep cap the estimate is null, not zero — such a set can still be
  // the heaviest ever lifted, and that deserves the banner.
  if (prior.weightKg === null || weightKg > prior.weightKg) {
    return { kind: 'weight', valueKg: weightKg };
  }
  return null;
}
