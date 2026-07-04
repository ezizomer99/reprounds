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

/** Format a duration in seconds as "m:ss". */
export function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parse a duration string ("m:ss" or plain seconds) to seconds.
 * Seconds component is clamped to 59. Returns null for empty or unparseable input.
 */
export function parseDuration(val: string): number | null {
  const t = val.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [mPart, sPart] = t.split(':');
    const m = parseInt(mPart || '0', 10);
    const s = parseInt(sPart || '0', 10);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + Math.min(s, 59);
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}
