import { toMuscleOption, toMuscleOptions } from './muscleOptions';

describe('toMuscleOption', () => {
  it('passes through a value already in the pick-list', () => {
    expect(toMuscleOption('back')).toBe('back');
    expect(toMuscleOption('full body')).toBe('full body');
  });

  // The seeded catalogue stores Title-Case anatomy. Without the fold, opening
  // the editor on a seeded Pull-up would preselect nothing.
  it('folds the seed vocabulary onto a pick-list option', () => {
    expect(toMuscleOption('Lats')).toBe('back');
    expect(toMuscleOption('Upper Back')).toBe('back');
    expect(toMuscleOption('Quadriceps')).toBe('quads');
    expect(toMuscleOption('Abdominals')).toBe('abs');
  });

  it('normalizes case and whitespace like muscleSlugMap does', () => {
    expect(toMuscleOption('  CHEST ')).toBe('chest');
    expect(toMuscleOption('upper  back')).toBe('back');
  });

  it('returns null rather than guessing at an unmapped muscle', () => {
    expect(toMuscleOption('Neck')).toBeNull();
    expect(toMuscleOption('spleen')).toBeNull();
    expect(toMuscleOption(null)).toBeNull();
    expect(toMuscleOption('')).toBeNull();
  });
});

describe('toMuscleOptions', () => {
  it('maps a stored secondary list onto pick-list options', () => {
    expect(toMuscleOptions(['Biceps', 'Forearms'])).toEqual(['biceps', 'forearms']);
  });

  // 'Lats' and 'Upper Back' both fold to 'back' — the picker must not show it twice.
  it('dedupes muscles that fold onto the same option', () => {
    expect(toMuscleOptions(['Lats', 'Upper Back', 'Traps'])).toEqual(['back']);
  });

  it('drops the primary so a muscle is never counted at both weights', () => {
    expect(toMuscleOptions(['Lats', 'Biceps'], 'back')).toEqual(['biceps']);
  });

  it('drops unmapped muscles and handles an absent list', () => {
    expect(toMuscleOptions(['Neck', 'Biceps'])).toEqual(['biceps']);
    expect(toMuscleOptions(null)).toEqual([]);
  });
});
