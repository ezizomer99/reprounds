import { isNumberInRange, type NumericRange } from '@app/shared';

export interface ParseResult {
  /** The parsed number, or null when the field was deliberately left blank. */
  value: number | null;
  /** True only when the field held something that isn't an acceptable number. */
  invalid: boolean;
}

const BLANK: ParseResult = { value: null, invalid: false };
const INVALID: ParseResult = { value: null, invalid: true };

// Number() is far too permissive on its own: '0x10' is 16, '12kg' is NaN but
// parseInt('12kg') is 12, and '' is 0. Require a plain decimal literal up front
// so only genuinely numeric text gets through.
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/**
 * On a comma-decimal locale the numeric keypad emits ',' — `Number('7,5')` is
 * NaN, so a Norwegian user typing a bodyweight got a silent null. Swap a lone
 * comma for a dot, but leave anything with multiple commas or a dot already
 * present alone (that's a thousands separator, not a decimal mark, and
 * guessing there would turn '1,000' into 1).
 */
function normalizeDecimalMark(text: string): string {
  if (text.includes('.')) return text;
  return text.split(',').length === 2 ? text.replace(',', '.') : text;
}

/**
 * Parse user-typed text into a number the API will accept.
 *
 * Distinguishes "cleared the field" (`{ value: null, invalid: false }`) from
 * "typed something unusable" (`{ value: null, invalid: true }`). That
 * distinction is the whole point: collapsing the two into a bare null is how a
 * rejected value used to stay on screen looking saved.
 */
export function parseNumberInRangeResult(text: string, range: NumericRange): ParseResult {
  const trimmed = normalizeDecimalMark(text.trim());
  if (trimmed === '') return BLANK;
  if (!DECIMAL.test(trimmed)) return INVALID;
  const parsed = Number(trimmed);
  if (!isNumberInRange(parsed, range.min, range.max)) return INVALID;
  return { value: parsed, invalid: false };
}

/** As above, but rejects fractions — '12.5' reps is a typo, not twelve reps. */
export function parseIntInRangeResult(text: string, range: NumericRange): ParseResult {
  const result = parseNumberInRangeResult(text, range);
  if (result.value !== null && !Number.isInteger(result.value)) return INVALID;
  return result;
}

/** Convenience for call sites where dropping unusable input is acceptable. */
export function parseNumberInRange(text: string, range: NumericRange): number | null {
  return parseNumberInRangeResult(text, range).value;
}

export function parseIntInRange(text: string, range: NumericRange): number | null {
  return parseIntInRangeResult(text, range).value;
}
