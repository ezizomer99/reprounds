import { kgToUnit, unitToKg, type WeightUnit } from '../units/units';

/**
 * Warm-up ramp generator. From the first working weight, produce a few
 * lighter ramp sets so a lifter isn't hand-entering warm-ups every session.
 * Ramps are computed and rounded in the user's display unit so the numbers
 * land on real plate increments, then converted back to kg for storage.
 */

export interface WarmupSet {
  /** Weight in kg (storage unit). */
  weightKg: number;
  reps: number;
}

/** Empty-bar weight per unit — the floor for barbell warm-ups. */
const BAR = { kg: 20, lbs: 45 } as const;
/** Rounding grid per unit (smallest plate pair). */
const STEP = { kg: 2.5, lbs: 5 } as const;
/** Above this working weight, a barbell ramp starts with a bar-only set. */
const BAR_SET_THRESHOLD = { kg: 60, lbs: 135 } as const;
/** Below this working weight there's no point ramping — one light set. */
const MIN_RAMP = { kg: 40, lbs: 95 } as const;

const RAMP = [
  { pct: 0.4, reps: 10 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
] as const;

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Generate warm-up sets leading up to `workingWeightKg`.
 * Returns an empty array when there's nothing sensible to ramp (no weight).
 */
export function generateWarmupRamp(
  workingWeightKg: number | null | undefined,
  unit: WeightUnit,
  equipment: string | null | undefined,
): WarmupSet[] {
  if (workingWeightKg == null || workingWeightKg <= 0) return [];

  const isBarbell = equipment === 'barbell';
  const bar = BAR[unit];
  const step = STEP[unit];
  const working = kgToUnit(workingWeightKg, unit);

  if (working < MIN_RAMP[unit]) {
    const light = roundTo(working * 0.5, step);
    if (light <= 0 || light >= working) return [];
    return [{ weightKg: unitToKg(light, unit), reps: 8 }];
  }

  const weights: { display: number; reps: number }[] = [];

  if (isBarbell && working >= BAR_SET_THRESHOLD[unit]) {
    weights.push({ display: bar, reps: 10 });
  }

  for (const rung of RAMP) {
    let w = roundTo(working * rung.pct, step);
    if (isBarbell) w = Math.max(w, bar);
    const prev = weights[weights.length - 1]?.display ?? 0;
    // Skip a rung that rounds to the bar, a previous rung, or the work weight.
    if (w <= prev || w >= working) continue;
    weights.push({ display: w, reps: rung.reps });
  }

  return weights.map((w) => ({ weightKg: unitToKg(w.display, unit), reps: w.reps }));
}
