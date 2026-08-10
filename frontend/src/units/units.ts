import { DISTANCE_METERS_RANGE, WEIGHT_KG_RANGE, type NumericRange } from '@app/shared';

export type WeightUnit = 'kg' | 'lbs';

const LB_PER_KG = 2.2046226218;
const METERS_PER_KM = 1000;
const METERS_PER_MILE = 1609.344;

/**
 * The acceptable range for a weight *typed in the display unit*. Validating
 * raw input against the kg range would reject a legitimate 300 lb lift, so
 * convert the bound rather than the value.
 */
export function weightInputRange(unit: WeightUnit): NumericRange {
  return {
    min: kgToUnit(WEIGHT_KG_RANGE.min, unit),
    max: kgToUnit(WEIGHT_KG_RANGE.max, unit),
  };
}

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

// Distance shares the metric/imperial split with weight: kg → km, lbs → mi.
// Stored canonically in metres; formatted/parsed in the user's unit.
const metersPerUnit = (unit: WeightUnit) => (unit === 'lbs' ? METERS_PER_MILE : METERS_PER_KM);

/** The short label for the distance unit that pairs with a weight unit. */
export function distanceUnitLabel(unit: WeightUnit): string {
  return unit === 'lbs' ? 'mi' : 'km';
}

/** The acceptable range for a distance *typed in the display unit*. */
export function distanceInputRange(unit: WeightUnit): NumericRange {
  const per = metersPerUnit(unit);
  return { min: DISTANCE_METERS_RANGE.min / per, max: DISTANCE_METERS_RANGE.max / per };
}

/** Convert a value entered in the display unit (km/mi) back to metres for storage. */
export function distanceUnitToMeters(value: number, unit: WeightUnit): number {
  return value * metersPerUnit(unit);
}

/** Format a stored metre value in the display unit (up to 2 decimals, trimmed). */
export function fmtDistance(meters: number, unit: WeightUnit): string {
  const v = Math.round((meters / metersPerUnit(unit)) * 100) / 100;
  return Number.isInteger(v) ? String(v) : String(v);
}

/**
 * Parse a distance string entered in the display unit (km/mi) to metres.
 * Returns null for empty or unparseable input.
 */
export function parseDistance(val: string, unit: WeightUnit): number | null {
  const t = val.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : distanceUnitToMeters(n, unit);
}

/**
 * Format a whole-minute duration as "45 min" / "1h" / "1h 30min" — session
 * lengths. Distinct from `fmtDuration`, which formats seconds as "m:ss" for
 * the rest timer.
 */
export function fmtMinutes(mins: number): string {
  if (mins === 0) return '0 min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
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

// ─── Hour-aware duration (conditioning duration cell + wheel picker) ──────────
// Kept separate from fmtDuration/parseDuration above, which the rest timer and
// the "Last session" ghost row rely on for their exact "m:ss" behaviour.

/** Split a duration in seconds into whole hours, minutes and seconds. */
export function splitHMS(secs: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(secs));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/** Format seconds as "m:ss", promoting to "h:mm:ss" once it reaches an hour. */
export function fmtHMS(secs: number): string {
  const { h, m, s } = splitHMS(secs);
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * Parse "h:mm:ss", "m:ss", or a plain integer of seconds into total seconds.
 * The minutes/seconds components are clamped to 59. Returns null for empty or
 * unparseable input.
 */
export function parseHMS(val: string): number | null {
  const t = val.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => parseInt(p || '0', 10));
    if (parts.some((n) => isNaN(n))) return null;
    let h = 0;
    let m = 0;
    let s = 0;
    if (parts.length === 3) [h, m, s] = parts;
    else if (parts.length === 2) [m, s] = parts;
    else return null;
    return h * 3600 + Math.min(m, 59) * 60 + Math.min(s, 59);
  }
  const n = parseInt(t, 10);
  return isNaN(n) ? null : n;
}
