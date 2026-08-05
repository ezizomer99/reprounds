import { describe, it, expect } from 'vitest';
import {
  isDisciplineCat,
  isEntryKind,
  isFightMethod,
  isFightResult,
  isFocusStatus,
  isGiType,
  isMuscleGroup,
  isNumberInRange,
  isSetType,
} from './validators';

describe('enum guards', () => {
  it('accept valid members and reject invalid ones', () => {
    expect(isEntryKind('exercise')).toBe(true);
    expect(isEntryKind('martial_arts')).toBe(true);
    expect(isEntryKind('cardio')).toBe(false);

    expect(isSetType('amrap')).toBe(true);
    expect(isSetType('superset')).toBe(false);

    expect(isFightResult('win')).toBe(true);
    expect(isFightResult('victory')).toBe(false);

    expect(isFightMethod('submission')).toBe(true);
    expect(isFightMethod('armbar')).toBe(false);

    expect(isGiType('no_gi')).toBe(true);
    expect(isGiType('nogi')).toBe(false);

    expect(isDisciplineCat('grappling')).toBe(true);
    expect(isDisciplineCat('wrestling')).toBe(false);

    expect(isFocusStatus('achieved')).toBe(true);
    expect(isFocusStatus('done')).toBe(false);

    expect(isMuscleGroup('back')).toBe(true);
    expect(isMuscleGroup('full body')).toBe(true);
    // The seeded catalogue's anatomical vocabulary is readable but not writable.
    expect(isMuscleGroup('Lats')).toBe(false);
    expect(isMuscleGroup('quadriceps')).toBe(false);
  });

  it('reject non-string values', () => {
    expect(isEntryKind(3)).toBe(false);
    expect(isSetType(null)).toBe(false);
    expect(isFightResult(undefined)).toBe(false);
  });
});

describe('isNumberInRange', () => {
  it('accepts finite numbers within range', () => {
    expect(isNumberInRange(5, 0, 10)).toBe(true);
    expect(isNumberInRange(0, 0, 10)).toBe(true);
    expect(isNumberInRange(10, 0, 10)).toBe(true);
    expect(isNumberInRange(-3)).toBe(true); // no bounds
  });

  it('rejects out-of-range, non-finite, and non-numbers', () => {
    expect(isNumberInRange(11, 0, 10)).toBe(false);
    expect(isNumberInRange(-1, 0, 10)).toBe(false);
    expect(isNumberInRange(NaN, 0, 10)).toBe(false);
    expect(isNumberInRange(Infinity, 0, 10)).toBe(false);
    expect(isNumberInRange('5' as unknown, 0, 10)).toBe(false);
  });
});
