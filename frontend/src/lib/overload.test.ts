import { suggestOverload, OVERLOAD_REP_GOAL } from './overload';
import type { StrengthSet } from '@app/shared';

function set(overrides: Partial<StrengthSet>): StrengthSet {
  return {
    id: 's',
    sessionEntryId: 'e',
    setNumber: 1,
    setType: 'normal',
    reps: OVERLOAD_REP_GOAL,
    weight: 60,
    durationSeconds: null,
    distanceMeters: null,
    rpe: null,
    rir: null,
    completed: true,
    notes: null,
    ...overrides,
  };
}

const DUMBBELL = { equipment: 'dumbbell', bodyPart: 'upper arms' };
const BARBELL_SQUAT = { equipment: 'barbell', bodyPart: 'upper legs' };

describe('suggestOverload', () => {
  it('suggests +2.5 kg when all working sets hit the rep goal at the same weight', () => {
    const result = suggestOverload([set({}), set({}), set({})], DUMBBELL, 'kg');
    expect(result).not.toBeNull();
    expect(result!.weightKg).toBeCloseTo(62.5);
    expect(result!.incrementDisplay).toBe(2.5);
    expect(result!.reason).toContain('3 sets');
  });

  it('suggests +5 kg for barbell lower-body lifts', () => {
    const result = suggestOverload([set({ weight: 100 }), set({ weight: 100 })], BARBELL_SQUAT, 'kg');
    expect(result!.weightKg).toBeCloseTo(105);
    expect(result!.incrementDisplay).toBe(5);
  });

  it('suggests in lb increments snapped to the plate grid', () => {
    // 60 kg = 132.28 lb → +5 lb → 137.28 → snapped to 135 lb
    const result = suggestOverload([set({}), set({})], DUMBBELL, 'lbs');
    expect(result).not.toBeNull();
    const displayLb = result!.weightKg * 2.2046226218;
    expect(displayLb).toBeCloseTo(135, 5);
  });

  it('returns null when any set missed the rep goal', () => {
    expect(
      suggestOverload([set({}), set({ reps: OVERLOAD_REP_GOAL - 1 })], DUMBBELL, 'kg'),
    ).toBeNull();
  });

  it('returns null when any set is incomplete', () => {
    expect(suggestOverload([set({}), set({ completed: false })], DUMBBELL, 'kg')).toBeNull();
  });

  it('returns null when weights differ across sets', () => {
    expect(suggestOverload([set({}), set({ weight: 55 })], DUMBBELL, 'kg')).toBeNull();
  });

  it('returns null for fewer than two working sets', () => {
    expect(suggestOverload([set({})], DUMBBELL, 'kg')).toBeNull();
    expect(suggestOverload([], DUMBBELL, 'kg')).toBeNull();
  });

  it('returns null for bodyweight/unweighted sets', () => {
    expect(suggestOverload([set({ weight: null }), set({ weight: null })], DUMBBELL, 'kg')).toBeNull();
  });

  it('treats missing exercise metadata as a small-increment lift', () => {
    const result = suggestOverload([set({}), set({})], undefined, 'kg');
    expect(result!.incrementDisplay).toBe(2.5);
  });
});
