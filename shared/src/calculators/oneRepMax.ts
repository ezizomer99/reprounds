import type { StrengthSet } from '../types/models';

export function estimatedOneRepMax(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function bestSet(sets: StrengthSet[]): StrengthSet | null {
  const completed = sets.filter(
    (s): s is StrengthSet & { weight: number; reps: number } =>
      s.completed && s.weight !== null && s.reps !== null,
  );
  if (!completed.length) return null;
  return completed.reduce((best, s) =>
    estimatedOneRepMax(s.weight, s.reps) > estimatedOneRepMax(best.weight, best.reps) ? s : best,
  );
}
