import { REPS_RANGE, RPE_RANGE, WEIGHT_KG_RANGE } from '@app/shared';
import {
  parseIntInRangeResult,
  parseNumberInRange,
  parseNumberInRangeResult,
} from './parseNumber';

describe('parseNumberInRange', () => {
  it('treats empty and whitespace-only input as cleared, not invalid', () => {
    expect(parseNumberInRangeResult('', REPS_RANGE)).toEqual({ value: null, invalid: false });
    expect(parseNumberInRangeResult('   ', REPS_RANGE)).toEqual({ value: null, invalid: false });
  });

  it('parses plain integers and decimals', () => {
    expect(parseNumberInRange('8', REPS_RANGE)).toBe(8);
    expect(parseNumberInRange(' 12 ', REPS_RANGE)).toBe(12);
    expect(parseNumberInRange('7.5', RPE_RANGE)).toBe(7.5);
    expect(parseNumberInRange('102.25', WEIGHT_KG_RANGE)).toBe(102.25);
    expect(parseNumberInRange('.5', RPE_RANGE)).toBe(0.5);
  });

  // decimal-pad emits ',' on comma-decimal locales, where Number('7,5') is NaN.
  it('accepts a comma as the decimal mark', () => {
    expect(parseNumberInRange('7,5', RPE_RANGE)).toBe(7.5);
    expect(parseNumberInRange('102,25', WEIGHT_KG_RANGE)).toBe(102.25);
  });

  it('does not mistake a thousands separator for a decimal mark', () => {
    expect(parseNumberInRangeResult('1,000,000', REPS_RANGE)).toEqual({
      value: null,
      invalid: true,
    });
  });

  it('rejects non-numeric text rather than silently truncating it', () => {
    expect(parseNumberInRangeResult('abc', REPS_RANGE)).toEqual({ value: null, invalid: true });
    // parseInt('12kg') would have returned 12.
    expect(parseNumberInRangeResult('12kg', WEIGHT_KG_RANGE)).toEqual({
      value: null,
      invalid: true,
    });
    expect(parseNumberInRangeResult('1.2.3', WEIGHT_KG_RANGE)).toEqual({
      value: null,
      invalid: true,
    });
    // Number('0x10') is 16.
    expect(parseNumberInRangeResult('0x10', REPS_RANGE)).toEqual({ value: null, invalid: true });
  });

  // The bugs this helper exists to stop: each of these passed the old
  // `Number(x)` + isNaN guard and reached an API that 400s on them.
  it('rejects negatives, out-of-range values and exponent notation', () => {
    expect(parseNumberInRangeResult('-5', REPS_RANGE)).toEqual({ value: null, invalid: true });
    expect(parseNumberInRangeResult('1e9', REPS_RANGE)).toEqual({ value: null, invalid: true });
    expect(parseNumberInRangeResult('999999', REPS_RANGE)).toEqual({ value: null, invalid: true });
    expect(parseNumberInRangeResult('11', RPE_RANGE)).toEqual({ value: null, invalid: true });
  });

  it('rejects Infinity and NaN literals', () => {
    expect(parseNumberInRangeResult('Infinity', REPS_RANGE)).toEqual({
      value: null,
      invalid: true,
    });
    expect(parseNumberInRangeResult('-Infinity', REPS_RANGE)).toEqual({
      value: null,
      invalid: true,
    });
    expect(parseNumberInRangeResult('NaN', REPS_RANGE)).toEqual({ value: null, invalid: true });
  });

  it('accepts both inclusive bounds', () => {
    expect(parseNumberInRange('0', REPS_RANGE)).toBe(0);
    expect(parseNumberInRange('10000', REPS_RANGE)).toBe(10_000);
    expect(parseNumberInRange('0', RPE_RANGE)).toBe(0);
    expect(parseNumberInRange('10', RPE_RANGE)).toBe(10);
  });
});

describe('parseIntInRange', () => {
  it('rejects fractions instead of truncating them', () => {
    expect(parseIntInRangeResult('12.5', REPS_RANGE)).toEqual({ value: null, invalid: true });
    expect(parseIntInRangeResult('12', REPS_RANGE)).toEqual({ value: 12, invalid: false });
  });

  it('still treats a blank field as cleared', () => {
    expect(parseIntInRangeResult('', REPS_RANGE)).toEqual({ value: null, invalid: false });
  });
});
