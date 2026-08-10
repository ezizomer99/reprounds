import { WEIGHT_KG_RANGE } from '@app/shared';
import {
  kgToUnit,
  unitToKg,
  fmtWeight,
  fmtDuration,
  fmtMinutes,
  parseDuration,
  weightInputRange,
  fmtDistance,
  parseDistance,
  distanceUnitLabel,
  distanceUnitToMeters,
} from './units';

describe('kgToUnit / unitToKg', () => {
  it('is identity for kg unit', () => {
    expect(kgToUnit(2.5, 'kg')).toBe(2.5);
    expect(kgToUnit(1.25, 'kg')).toBe(1.25);
    expect(unitToKg(2.5, 'kg')).toBe(2.5);
    expect(unitToKg(1.25, 'kg')).toBe(1.25);
  });

  it('round-trips 2.5 kg through lbs', () => {
    expect(unitToKg(kgToUnit(2.5, 'lbs'), 'lbs')).toBeCloseTo(2.5, 10);
  });

  it('round-trips 1.25 kg through lbs', () => {
    expect(unitToKg(kgToUnit(1.25, 'lbs'), 'lbs')).toBeCloseTo(1.25, 10);
  });

  it('converts 2.5 kg to the expected lbs value', () => {
    expect(kgToUnit(2.5, 'lbs')).toBeCloseTo(5.5115565545, 5);
  });
});

describe('fmtWeight', () => {
  it('returns an integer string when the display value is whole in kg', () => {
    expect(fmtWeight(100, 'kg')).toBe('100');
    expect(fmtWeight(20, 'kg')).toBe('20');
  });

  it('returns one decimal for non-integer values in kg', () => {
    expect(fmtWeight(2.5, 'kg')).toBe('2.5');
  });

  it('rounds 1.25 kg to 1.3 kg (half-up at 1 decimal)', () => {
    expect(fmtWeight(1.25, 'kg')).toBe('1.3');
  });

  it('rounds 2.5 kg to 5.5 lbs', () => {
    expect(fmtWeight(2.5, 'lbs')).toBe('5.5');
  });

  it('rounds 1.25 kg to 2.8 lbs', () => {
    expect(fmtWeight(1.25, 'lbs')).toBe('2.8');
  });
});

describe('fmtMinutes', () => {
  it('formats session lengths in hours and minutes', () => {
    expect(fmtMinutes(0)).toBe('0 min');
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(60)).toBe('1h');
    expect(fmtMinutes(90)).toBe('1h 30min');
    expect(fmtMinutes(125)).toBe('2h 5min');
  });
});

describe('fmtDuration', () => {
  it('formats 0 seconds as "0:00"', () => {
    expect(fmtDuration(0)).toBe('0:00');
  });

  it('formats 65 seconds as "1:05"', () => {
    expect(fmtDuration(65)).toBe('1:05');
  });

  it('formats 3661 seconds as "61:01"', () => {
    expect(fmtDuration(3661)).toBe('61:01');
  });

  it('zero-pads single-digit seconds', () => {
    expect(fmtDuration(62)).toBe('1:02');
  });
});

describe('parseDuration', () => {
  it('returns null for an empty string', () => {
    expect(parseDuration('')).toBeNull();
  });

  it('returns null for a whitespace-only string', () => {
    expect(parseDuration('   ')).toBeNull();
  });

  it('returns null for non-numeric garbage without a colon', () => {
    expect(parseDuration('abc')).toBeNull();
  });

  it('returns null when the colon-separated parts are not numbers', () => {
    expect(parseDuration('abc:def')).toBeNull();
  });

  it('parses "0:00" to 0', () => {
    expect(parseDuration('0:00')).toBe(0);
  });

  it('parses "1:05" to 65', () => {
    expect(parseDuration('1:05')).toBe(65);
  });

  it('clamps seconds > 59 to 59', () => {
    // "1:65" → 1*60 + min(65, 59) = 60 + 59 = 119
    expect(parseDuration('1:65')).toBe(119);
  });

  it('parses a plain integer as seconds', () => {
    expect(parseDuration('90')).toBe(90);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseDuration('  2:30  ')).toBe(150);
  });

  it('round-trips with fmtDuration for representative values', () => {
    for (const secs of [0, 65, 120, 3600]) {
      expect(parseDuration(fmtDuration(secs))).toBe(secs);
    }
  });
});

describe('distance helpers', () => {
  it('labels distance km for kg and mi for lbs', () => {
    expect(distanceUnitLabel('kg')).toBe('km');
    expect(distanceUnitLabel('lbs')).toBe('mi');
  });

  it('formats metres as whole km without a trailing decimal', () => {
    expect(fmtDistance(5000, 'kg')).toBe('5');
    expect(fmtDistance(0, 'kg')).toBe('0');
  });

  it('formats metres with up to two trimmed decimals', () => {
    expect(fmtDistance(5200, 'kg')).toBe('5.2');
    expect(fmtDistance(5250, 'kg')).toBe('5.25');
  });

  it('converts a mile to ~1609 metres', () => {
    expect(distanceUnitToMeters(1, 'lbs')).toBeCloseTo(1609.344, 3);
  });

  it('parses a km value entered in metric to metres', () => {
    expect(parseDistance('5', 'kg')).toBeCloseTo(5000, 6);
    expect(parseDistance('5.2', 'kg')).toBeCloseTo(5200, 6);
  });

  it('parses a mile value entered in imperial to metres', () => {
    expect(parseDistance('1', 'lbs')).toBeCloseTo(1609.344, 3);
  });

  it('returns null for empty or unparseable distance input', () => {
    expect(parseDistance('', 'kg')).toBeNull();
    expect(parseDistance('   ', 'kg')).toBeNull();
    expect(parseDistance('abc', 'kg')).toBeNull();
  });

  it('round-trips representative metric distances through fmt/parse', () => {
    for (const meters of [0, 1000, 5000, 10500]) {
      expect(parseDistance(fmtDistance(meters, 'kg'), 'kg')).toBeCloseTo(meters, 6);
    }
  });
});

describe('weightInputRange', () => {
  it('passes the kg bounds straight through for kg', () => {
    expect(weightInputRange('kg')).toEqual(WEIGHT_KG_RANGE);
  });

  // Validating typed input against the raw kg bound would reject a legitimate
  // 300 lb lift, so the bound is converted rather than the value.
  it('converts the upper bound for lbs', () => {
    const range = weightInputRange('lbs');
    expect(range.min).toBe(0);
    expect(range.max).toBeCloseTo(WEIGHT_KG_RANGE.max * 2.2046226218, 5);
    expect(range.max).toBeGreaterThan(300);
  });
});
