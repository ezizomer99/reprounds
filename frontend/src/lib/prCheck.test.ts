import { bestOfSet, checkPR, mergeBest, priorBestFromPRs } from './prCheck';
import type { StrengthSet } from '@app/shared';

// 100 kg × 5 → 100 * (1 + 5/30) ≈ 116.67
const PRIOR = { e1rmKg: 116.67, weightKg: 100 };

describe('priorBestFromPRs', () => {
  it('reduces the endpoint payload to the two comparable numbers', () => {
    const bestSet = { weight: 100, reps: 5 } as StrengthSet;
    expect(priorBestFromPRs({ estimatedOneRepMax: 116.67, bestSet })).toEqual({
      e1rmKg: 116.67,
      weightKg: 100,
    });
  });

  it('treats a missing response as no history', () => {
    expect(priorBestFromPRs(undefined)).toEqual({ e1rmKg: null, weightKg: null });
  });

  it('treats an over-cap-only history as having a weight but no estimate', () => {
    const bestSet = { weight: 60, reps: 20 } as StrengthSet;
    expect(priorBestFromPRs({ estimatedOneRepMax: null, bestSet })).toEqual({
      e1rmKg: null,
      weightKg: 60,
    });
  });
});

describe('bestOfSet', () => {
  it('scores an estimable set on both counts', () => {
    expect(bestOfSet({ weightKg: 100, reps: 5 })).toEqual({ e1rmKg: 100 * (1 + 5 / 30), weightKg: 100 });
  });

  it('scores an over-cap set on weight only', () => {
    expect(bestOfSet({ weightKg: 60, reps: 20 })).toEqual({ e1rmKg: null, weightKg: 60 });
  });

  it('scores an unusable set as nothing', () => {
    expect(bestOfSet({ weightKg: null, reps: 5 })).toEqual({ e1rmKg: null, weightKg: null });
  });
});

describe('mergeBest', () => {
  it('takes the higher of each field', () => {
    expect(mergeBest({ e1rmKg: 100, weightKg: 90 }, { e1rmKg: 120, weightKg: 80 })).toEqual({
      e1rmKg: 120,
      weightKg: 90,
    });
  });

  it('fills in from whichever side has a value', () => {
    expect(mergeBest({ e1rmKg: null, weightKg: 60 }, { e1rmKg: 110, weightKg: null })).toEqual({
      e1rmKg: 110,
      weightKg: 60,
    });
  });

  it('stops a record from re-firing on an equal set later in the session', () => {
    const afterFirstPR = mergeBest(PRIOR, bestOfSet({ weightKg: 105, reps: 5 }));
    expect(checkPR({ weightKg: 105, reps: 5 }, afterFirstPR)).toBeNull();
    // ...but a genuinely better set still lands.
    expect(checkPR({ weightKg: 105, reps: 6 }, afterFirstPR)?.kind).toBe('e1rm');
  });
});

describe('checkPR', () => {
  it('celebrates a rep PR at an unchanged weight', () => {
    // 100 × 6 ≈ 120 e1RM, beating 116.67 — the case raw-weight comparison missed.
    expect(checkPR({ weightKg: 100, reps: 6 }, PRIOR)).toEqual({
      kind: 'e1rm',
      valueKg: 120,
    });
  });

  it('celebrates a heavier set', () => {
    const hit = checkPR({ weightKg: 110, reps: 5 }, PRIOR);
    expect(hit?.kind).toBe('e1rm');
  });

  it('stays silent for a set below the prior best', () => {
    expect(checkPR({ weightKg: 85, reps: 5 }, PRIOR)).toBeNull();
  });

  it('stays silent for a heavier-than-recent set that is still below the all-time best', () => {
    // The deload case: 90 kg beats anything in the last five sessions but the
    // lifter has done 100 × 5 before, so this is not a record.
    expect(checkPR({ weightKg: 90, reps: 5 }, PRIOR)).toBeNull();
  });

  it('celebrates an over-cap set that is the heaviest ever', () => {
    // 20 reps has no estimate, but 105 kg is still more than 100 kg.
    expect(checkPR({ weightKg: 105, reps: 20 }, PRIOR)).toEqual({
      kind: 'weight',
      valueKg: 105,
    });
  });

  it('stays silent for an over-cap set below the heaviest ever', () => {
    expect(checkPR({ weightKg: 95, reps: 20 }, PRIOR)).toBeNull();
  });

  it('stays silent when there is no history to beat', () => {
    expect(checkPR({ weightKg: 100, reps: 5 }, { e1rmKg: null, weightKg: null })).toBeNull();
  });

  it('beats an over-cap-only history on estimate alone', () => {
    // Prior best is 60 × 20 (no estimate). A 65 × 5 is both heavier and
    // estimable, so it lands as an e1RM record.
    const hit = checkPR({ weightKg: 65, reps: 5 }, { e1rmKg: null, weightKg: 60 });
    expect(hit?.kind).toBe('e1rm');
  });

  it('ignores bodyweight and incomplete sets', () => {
    expect(checkPR({ weightKg: null, reps: 10 }, PRIOR)).toBeNull();
    expect(checkPR({ weightKg: 0, reps: 10 }, PRIOR)).toBeNull();
    expect(checkPR({ weightKg: 120, reps: null }, PRIOR)).toBeNull();
    expect(checkPR({ weightKg: 120, reps: 0 }, PRIOR)).toBeNull();
  });
});
