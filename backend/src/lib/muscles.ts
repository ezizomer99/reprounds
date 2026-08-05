import { isMuscleGroup, MAX_SECONDARY_MUSCLES } from '@app/shared';

/** A validated, normalized muscle tagging ready to write to a row. */
export interface MuscleSelection {
  muscleGroup: string | null;
  secondaryMuscles: string[];
}

/**
 * Validate and normalize the body of a "set this exercise's muscles" request.
 *
 * Every value has to be a member of MUSCLE_GROUPS — the column is bare `text`
 * with no check constraint, so without this any string at all would land in it
 * and then fail to resolve against the body-highlighter map, silently dropping
 * the muscle off the heat map. Seeded rows carry a second, Title-Case vocabulary
 * ('Lats', 'Quadriceps') that stays readable but is not writable.
 *
 * Normalizing is part of the job, not a nicety: duplicates and a secondary that
 * repeats the primary would both double-count that muscle in the heat map, where
 * primary and secondary contribute at different weights.
 *
 * Returns `{ error }` for a 400, or `{ value }` to write.
 */
export function parseMuscleSelection(
  body: unknown,
): { error: string } | { value: MuscleSelection } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Invalid request body' };
  }
  const { muscleGroup, secondaryMuscles } = body as Record<string, unknown>;

  if (muscleGroup != null && !isMuscleGroup(muscleGroup)) {
    return { error: 'muscleGroup must be a known muscle' };
  }
  if (secondaryMuscles !== undefined && !Array.isArray(secondaryMuscles)) {
    return { error: 'secondaryMuscles must be an array' };
  }

  const raw = (secondaryMuscles ?? []) as unknown[];
  if (raw.length > MAX_SECONDARY_MUSCLES) {
    return { error: `secondaryMuscles must contain ${MAX_SECONDARY_MUSCLES} muscles or fewer` };
  }
  if (!raw.every(isMuscleGroup)) {
    return { error: 'secondaryMuscles must contain only known muscles' };
  }

  const primary = (muscleGroup ?? null) as string | null;
  const seen = new Set<string>();
  const secondaries: string[] = [];
  for (const m of raw as string[]) {
    if (m === primary || seen.has(m)) continue;
    seen.add(m);
    secondaries.push(m);
  }

  return { value: { muscleGroup: primary, secondaryMuscles: secondaries } };
}
