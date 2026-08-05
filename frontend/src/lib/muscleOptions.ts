import type { MuscleGroup } from '@app/shared';
import { MUSCLE_GROUPS } from '@app/shared';

/** The muscles a user can tag an exercise with, in pick-list order. */
export const MUSCLE_OPTIONS: readonly MuscleGroup[] = MUSCLE_GROUPS;

/**
 * Fold the seeded catalogue's anatomical vocabulary into the thirteen options
 * the picker offers.
 *
 * The two vocabularies never agreed — the seed stores Title-Case anatomy
 * ('Lats', 'Quadriceps', 'Abdominals') while the picker writes gym shorthand
 * ('back', 'quads', 'abs'); see the note atop muscleSlugMap.ts. Without this,
 * opening the muscle editor on a seeded Pull-up would show an empty form and
 * quietly invite the user to re-tag from scratch.
 *
 * Prefill only. Writes always use the thirteen, which is what the API accepts.
 * Lossy on purpose: the picker has no upper/lower-back distinction, so every
 * back muscle lands on 'back'.
 */
const SEED_ALIASES: Record<string, MuscleGroup> = {
  lats: 'back',
  'upper back': 'back',
  'lower back': 'back',
  traps: 'back',
  abdominals: 'abs',
  obliques: 'abs',
  quadriceps: 'quads',
  adductors: 'quads',
  abductors: 'glutes',
  // Not in the picker and with no sensible home among the thirteen; left
  // unmapped so it reads as "nothing preselected" rather than a wrong guess.
  // neck: —
};

/** Same normalization muscleSlugMap uses, so both vocabularies key alike. */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** The picker option a stored muscle corresponds to, or null if there is none. */
export function toMuscleOption(value: string | null | undefined): MuscleGroup | null {
  if (!value) return null;
  const key = normalize(value);
  if ((MUSCLE_GROUPS as readonly string[]).includes(key)) return key as MuscleGroup;
  return SEED_ALIASES[key] ?? null;
}

/** Map a stored secondary list onto picker options, deduped and primary-free. */
export function toMuscleOptions(
  values: readonly string[] | null | undefined,
  exclude: MuscleGroup | null = null,
): MuscleGroup[] {
  const out: MuscleGroup[] = [];
  for (const v of values ?? []) {
    const option = toMuscleOption(v);
    if (option && option !== exclude && !out.includes(option)) out.push(option);
  }
  return out;
}
