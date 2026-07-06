import type { StrengthSet } from '@app/shared';
import { kgToUnit, unitToKg, type WeightUnit } from '../units/units';

/**
 * Progressive-overload heuristic. Deliberately simple and explainable:
 * suggest a small weight bump only when the last completed session clearly
 * earned it — otherwise stay silent rather than nag "repeat the weight".
 */

/** Every working set must hit at least this many reps to earn a bump. */
export const OVERLOAD_REP_GOAL = 8;

/** Large compound lower-body work progresses in bigger jumps. */
const BIG_INCREMENT = { kg: 5, lbs: 10 } as const;
/** Everything else moves by the smallest plate pair. */
const SMALL_INCREMENT = { kg: 2.5, lbs: 5 } as const;

const LOWER_BODY_PARTS = new Set(['upper legs', 'lower legs']);

export interface OverloadSuggestion {
  /** Suggested working weight, in kg (storage unit). */
  weightKg: number;
  /** Display-unit increment used, for the chip label. */
  incrementDisplay: number;
  /** Human-readable justification, e.g. "all 3 sets hit 8+ reps last time". */
  reason: string;
}

/**
 * Suggest the next working weight from the previous session's working sets.
 * Eligible when there were at least two working sets, all completed, all at
 * the same weight, and every set reached OVERLOAD_REP_GOAL reps.
 */
export function suggestOverload(
  lastWorkingSets: StrengthSet[],
  exercise: { equipment?: string | null; bodyPart?: string | null } | undefined,
  unit: WeightUnit,
): OverloadSuggestion | null {
  if (lastWorkingSets.length < 2) return null;

  const first = lastWorkingSets[0];
  if (first.weight == null || first.weight <= 0) return null;

  for (const set of lastWorkingSets) {
    if (!set.completed) return null;
    if (set.weight == null || set.reps == null) return null;
    if (set.weight !== first.weight) return null;
    if (set.reps < OVERLOAD_REP_GOAL) return null;
  }

  const isBigLift =
    exercise?.equipment === 'barbell' &&
    exercise.bodyPart != null &&
    LOWER_BODY_PARTS.has(exercise.bodyPart.toLowerCase());
  const incrementDisplay = (isBigLift ? BIG_INCREMENT : SMALL_INCREMENT)[unit];

  // Round the previous weight into clean display units before bumping so a
  // converted value like 60.0000001 kg → 132.3 lb doesn't produce ragged
  // suggestions; snap to the increment grid.
  const prevDisplay = kgToUnit(first.weight, unit);
  const nextDisplay =
    Math.round((prevDisplay + incrementDisplay) / incrementDisplay) * incrementDisplay;

  return {
    weightKg: unitToKg(nextDisplay, unit),
    incrementDisplay,
    reason: `all ${lastWorkingSets.length} sets hit ${OVERLOAD_REP_GOAL}+ reps last time`,
  };
}
