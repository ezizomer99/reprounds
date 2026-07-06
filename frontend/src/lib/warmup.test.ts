import { generateWarmupRamp } from './warmup';
import { kgToUnit, unitToKg } from '../units/units';

/** Convert a WarmupSet's stored kg to display units for assertions. */
function display(weightKg: number, unit: 'kg' | 'lbs'): number {
  return Math.round(kgToUnit(weightKg, unit) * 10) / 10;
}

describe('generateWarmupRamp', () => {
  it('returns [] for no weight', () => {
    expect(generateWarmupRamp(null, 'kg', 'barbell')).toEqual([]);
    expect(generateWarmupRamp(0, 'kg', 'barbell')).toEqual([]);
  });

  it('ramps a 100 kg barbell squat with a bar set + 40/60/80%', () => {
    const ramp = generateWarmupRamp(100, 'kg', 'barbell');
    expect(ramp.map((s) => [display(s.weightKg, 'kg'), s.reps])).toEqual([
      [20, 10], // bar
      [40, 10],
      [60, 5],
      [80, 3],
    ]);
  });

  it('does not prepend a duplicate bar set below the barbell threshold', () => {
    // 50 kg working: 0.4→20 (=bar), 0.6→30, 0.8→40 — three sets, no extra bar lead.
    const ramp = generateWarmupRamp(50, 'kg', 'barbell');
    const weights = ramp.map((s) => display(s.weightKg, 'kg'));
    expect(weights).toEqual([20, 30, 40]);
    expect(weights.filter((w) => w === 20)).toHaveLength(1); // bar appears once
  });

  it('rounds ramp weights to the plate grid in lb mode', () => {
    // 225 lb bench: 0.4→90, 0.6→135, 0.8→180, plus bar (45) lead set
    const ramp = generateWarmupRamp(unitToKg(225, 'lbs'), 'lbs', 'barbell');
    expect(ramp.map((s) => display(s.weightKg, 'lbs'))).toEqual([45, 90, 135, 180]);
  });

  it('gives a single light set for very light work', () => {
    const ramp = generateWarmupRamp(30, 'kg', 'dumbbell');
    expect(ramp).toHaveLength(1);
    expect(ramp[0].reps).toBe(8);
    expect(display(ramp[0].weightKg, 'kg')).toBe(15);
  });

  it('does not clamp non-barbell equipment to the bar weight', () => {
    // Machine at 100 kg → 40/60/80 with no bar floor
    const ramp = generateWarmupRamp(100, 'kg', 'machine');
    expect(ramp.map((s) => display(s.weightKg, 'kg'))).toEqual([40, 60, 80]);
  });

  it('produces strictly increasing weights below the working weight', () => {
    const ramp = generateWarmupRamp(140, 'kg', 'barbell');
    const weights = ramp.map((s) => s.weightKg);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeGreaterThan(weights[i - 1]);
    }
    expect(weights[weights.length - 1]).toBeLessThan(140);
  });
});
