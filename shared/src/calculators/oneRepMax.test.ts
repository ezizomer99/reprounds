import { describe, it, expect } from 'vitest';
import { estimatedOneRepMax, bestSet } from './oneRepMax';
import type { StrengthSet } from '../types/models';

function set(partial: Partial<StrengthSet>): StrengthSet {
  return {
    id: 'set',
    sessionEntryId: 'entry',
    setNumber: 1,
    setType: 'normal',
    reps: null,
    weight: null,
    rpe: null,
    rir: null,
    completed: true,
    notes: null,
    ...partial,
  };
}

describe('estimatedOneRepMax (Epley)', () => {
  it('returns the weight unchanged for a single rep', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });

  it('applies the Epley formula for multiple reps', () => {
    // 100 * (1 + 5/30) = 116.66...
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(116.667, 2);
  });

  it('scales with both weight and reps', () => {
    expect(estimatedOneRepMax(60, 10)).toBeCloseTo(80, 5);
  });
});

describe('bestSet', () => {
  it('returns null when no set is completed with weight and reps', () => {
    expect(bestSet([set({ completed: false, weight: 100, reps: 5 })])).toBeNull();
    expect(bestSet([set({ completed: true, weight: null, reps: 5 })])).toBeNull();
    expect(bestSet([])).toBeNull();
  });

  it('picks the set with the highest estimated 1RM', () => {
    const heavyLowReps = set({ id: 'a', weight: 140, reps: 1 }); // e1RM 140
    const moderate = set({ id: 'b', weight: 100, reps: 5 }); // e1RM ~116.7
    const best = bestSet([moderate, heavyLowReps]);
    expect(best?.id).toBe('a');
  });

  it('ignores incomplete sets when choosing the best', () => {
    const completed = set({ id: 'done', weight: 80, reps: 5 });
    const biggerButIncomplete = set({ id: 'skip', weight: 200, reps: 5, completed: false });
    expect(bestSet([completed, biggerButIncomplete])?.id).toBe('done');
  });
});
