import type { StrengthSet } from '../types/models';
import { E1RM_MAX_REPS } from '../limits';

/**
 * Epley estimated 1RM, or `null` when the set has too many reps to estimate from.
 *
 * See E1RM_MAX_REPS for why over-cap sets return null rather than a clamped
 * number. Callers must handle null: it means "not estimable", not "zero", and a
 * set that returns null is still a real set worth showing.
 */
export function estimatedOneRepMax(weight: number, reps: number): number | null {
  if (reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * The best completed set: highest estimated 1RM, falling back to the heaviest
 * set when none of them are estimable.
 *
 * The fallback matters because the cap excludes sets from the *estimate*, not
 * from existence — someone who only ever does sets of fifteen still has a
 * heaviest set, and returning null here would erase their whole history from
 * the PR card rather than just the 1RM figure.
 *
 * Note this helper is not currently on any production path (the backend ranks in
 * SQL via `epleyE1rmSql`); it is kept in step with that query's ordering so the
 * two cannot drift if it is ever used.
 */
export function bestSet(sets: StrengthSet[]): StrengthSet | null {
  const completed = sets.filter(
    (s): s is StrengthSet & { weight: number; reps: number } =>
      s.completed && s.weight !== null && s.reps !== null,
  );
  if (!completed.length) return null;

  return completed.reduce((best, s) => {
    const sE1rm = estimatedOneRepMax(s.weight, s.reps);
    const bestE1rm = estimatedOneRepMax(best.weight, best.reps);
    // Mirrors the SQL `ORDER BY e1rm DESC NULLS LAST, weight DESC, reps DESC`.
    if (sE1rm !== null && bestE1rm !== null) return sE1rm > bestE1rm ? s : best;
    if (sE1rm !== null) return s;
    if (bestE1rm !== null) return best;
    if (s.weight !== best.weight) return s.weight > best.weight ? s : best;
    return s.reps > best.reps ? s : best;
  });
}
