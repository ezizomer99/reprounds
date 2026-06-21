export type WeightUnit = 'kg' | 'lbs';

const LB_PER_KG = 2.2046226218;

/** Convert a stored kg value to the user's display unit. */
export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kg * LB_PER_KG : kg;
}

/** Convert a value entered in the display unit back to kg for storage. */
export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value / LB_PER_KG : value;
}

/** Format a stored kg value in the display unit (1 decimal, trimmed). */
export function fmtWeight(kg: number, unit: WeightUnit): string {
  const v = Math.round(kgToUnit(kg, unit) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
