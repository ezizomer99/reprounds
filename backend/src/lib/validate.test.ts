import { describe, it, expect } from 'vitest';
import {
  isIntInRange,
  isIsoDate,
  isUuid,
  isWithinLength,
  isWithinSerializedSize,
  validateIdList,
} from './validate';

describe('isIsoDate', () => {
  it('accepts a well-formed date', () => {
    expect(isIsoDate('2026-07-03')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true); // leap year
  });

  it('rejects the wrong shape', () => {
    for (const value of ['3/7/2026', '2026-7-3', '2026-07-03T00:00:00Z', 'tomorrow', '']) {
      expect(isIsoDate(value)).toBe(false);
    }
  });

  // These match the regex but are not real days — they used to reach the date
  // column and come back as a 500.
  it('rejects calendar-invalid dates that pass a shape check', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-00-10')).toBe(false);
    expect(isIsoDate('2025-02-29')).toBe(false); // not a leap year
  });

  it('rejects non-strings', () => {
    for (const value of [null, undefined, 20260703, {}, ['2026-07-03']]) {
      expect(isIsoDate(value)).toBe(false);
    }
  });
});

describe('isUuid', () => {
  it('accepts a UUID in either case', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(true);
  });

  it('rejects placeholders and near-misses', () => {
    for (const value of [
      'ex-1',
      'not-a-uuid',
      '3f2504e0-4f89-41d3-9a0c',
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301x',
      'zzzzzzzz-4f89-41d3-9a0c-0305e82c3301',
      '',
      null,
      42,
    ]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});

describe('isIntInRange', () => {
  const range = { min: 1, max: 10 };

  it('accepts whole numbers inside the range, inclusive', () => {
    expect(isIntInRange(1, range)).toBe(true);
    expect(isIntInRange(10, range)).toBe(true);
    expect(isIntInRange(5, range)).toBe(true);
  });

  it('rejects fractions, out-of-range values and non-numbers', () => {
    for (const value of [0, 11, 1.5, NaN, Infinity, '5', null, undefined]) {
      expect(isIntInRange(value, range)).toBe(false);
    }
  });
});

describe('isWithinLength', () => {
  it('treats an absent value as acceptable', () => {
    expect(isWithinLength(null, 5)).toBe(true);
    expect(isWithinLength(undefined, 5)).toBe(true);
  });

  it('enforces the cap, inclusive', () => {
    expect(isWithinLength('abcde', 5)).toBe(true);
    expect(isWithinLength('abcdef', 5)).toBe(false);
  });

  it('rejects a present non-string', () => {
    expect(isWithinLength(12345, 5)).toBe(false);
  });
});

describe('isWithinSerializedSize', () => {
  it('treats an absent value as acceptable', () => {
    expect(isWithinSerializedSize(null, 10)).toBe(true);
  });

  it('measures the encoded size, not the key count', () => {
    expect(isWithinSerializedSize({ a: 1 }, 100)).toBe(true);
    expect(isWithinSerializedSize({ rounds: 'x'.repeat(200) }, 100)).toBe(false);
  });

  it('counts multi-byte characters by their encoded length', () => {
    // 10 * 4 bytes of emoji, plus the surrounding quotes.
    expect(isWithinSerializedSize('🥋'.repeat(10), 20)).toBe(false);
  });

  it('rejects values that cannot be serialized at all', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isWithinSerializedSize(cyclic, 1000)).toBe(false);
  });
});

describe('validateIdList', () => {
  const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('accepts a non-empty list of UUIDs', () => {
    expect(validateIdList([id], 10, 'order')).toBeNull();
  });

  it('rejects an empty or non-array value', () => {
    expect(validateIdList([], 10, 'order')).toMatch(/non-empty/);
    expect(validateIdList('nope', 10, 'order')).toMatch(/non-empty/);
    expect(validateIdList(undefined, 10, 'order')).toMatch(/non-empty/);
  });

  it('rejects a list longer than the cap', () => {
    expect(validateIdList(Array(11).fill(id), 10, 'order')).toMatch(/too large/);
  });

  it('rejects a list containing a non-UUID', () => {
    expect(validateIdList([id, 'e1'], 10, 'order')).toMatch(/valid/);
    expect(validateIdList([id, 1], 10, 'order')).toMatch(/valid/);
  });

  it('names the id type in its message', () => {
    expect(validateIdList([], 10, 'order', 'entry ID')).toBe(
      'order must be a non-empty array of entry IDs',
    );
  });
});
