import type { StrengthSet } from '../types/models';

/** Volume (weight × reps) of a single set; treats nulls as 0. */
export function setVolume(set: Pick<StrengthSet, 'weight' | 'reps'>): number {
  return (set.weight ?? 0) * (set.reps ?? 0);
}

/** Total volume of the completed sets in a list. */
export function totalVolume(
  sets: Pick<StrengthSet, 'weight' | 'reps' | 'completed'>[],
): number {
  return sets.reduce((sum, s) => sum + (s.completed ? setVolume(s) : 0), 0);
}
