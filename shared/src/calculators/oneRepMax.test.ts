import { describe, it, expect } from 'vitest';
import { estimatedOneRepMax, bestSet } from './oneRepMax';
import { E1RM_MAX_REPS } from '../limits';
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

  // Epley is a low-rep extrapolation. Applied at any rep count it claimed a
  // 60 kg × 20 back-off set was worth 100 kg — beating a genuine 100 kg × 3.
  it('estimates up to and including the cap', () => {
    expect(estimatedOneRepMax(100, E1RM_MAX_REPS)).not.toBeNull();
  });

  it('returns null above the cap rather than a clamped number', () => {
    expect(estimatedOneRepMax(60, E1RM_MAX_REPS + 1)).toBeNull();
    expect(estimatedOneRepMax(60, 20)).toBeNull();
    expect(estimatedOneRepMax(60, 30)).toBeNull();
  });

  it('no longer lets a high-rep set outrank a heavy triple', () => {
    const triple = estimatedOneRepMax(100, 3);
    expect(triple).not.toBeNull();
    expect(estimatedOneRepMax(60, 20)).toBeNull();
    // Previously 60x20 estimated 100kg and edged out the 100x3 at ~110kg.
    expect(triple!).toBeGreaterThan(0);
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

  it('prefers an estimable set over a high-rep one that would have scored higher', () => {
    const triple = set({ id: 'triple', weight: 100, reps: 3 }); // e1RM 110
    const backOff = set({ id: 'backoff', weight: 60, reps: 20 }); // was e1RM 100, now null
    expect(bestSet([backOff, triple])?.id).toBe('triple');
  });

  // The cap excludes a set from the *estimate*, not from existence. Someone who
  // only ever does twenties still has a heaviest set, and blanking the PR card
  // for them would be worse than the wrong number this cap removes.
  it('falls back to the heaviest set when none are estimable', () => {
    const light = set({ id: 'light', weight: 40, reps: 20 });
    const heavy = set({ id: 'heavy', weight: 70, reps: 20 });
    expect(bestSet([light, heavy])?.id).toBe('heavy');
  });

  it('breaks a tie on weight by reps', () => {
    const fewer = set({ id: 'fewer', weight: 60, reps: 15 });
    const more = set({ id: 'more', weight: 60, reps: 25 });
    expect(bestSet([fewer, more])?.id).toBe('more');
  });

  it('still returns a set when every rep count is above the cap', () => {
    expect(bestSet([set({ id: 'only', weight: 50, reps: E1RM_MAX_REPS + 5 })])?.id).toBe('only');
  });
});
