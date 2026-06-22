import { describe, it, expect } from 'vitest';
import { setVolume, totalVolume } from './volume';

describe('setVolume', () => {
  it('multiplies weight by reps', () => {
    expect(setVolume({ weight: 100, reps: 5 })).toBe(500);
  });

  it('treats null weight or reps as zero', () => {
    expect(setVolume({ weight: null, reps: 5 })).toBe(0);
    expect(setVolume({ weight: 100, reps: null })).toBe(0);
  });
});

describe('totalVolume', () => {
  it('sums only completed sets', () => {
    const sets = [
      { weight: 100, reps: 5, completed: true }, // 500
      { weight: 80, reps: 10, completed: true }, // 800
      { weight: 200, reps: 5, completed: false }, // ignored
    ];
    expect(totalVolume(sets)).toBe(1300);
  });

  it('returns 0 for an empty list', () => {
    expect(totalVolume([])).toBe(0);
  });
});
