import { muscleGroupToSlugs, buildBodyData, aggregateMuscles } from './muscleSlugMap';

// Two vocabularies reach this map: the Title-Case exercises.json seed and the
// lowercase gym shorthand ExerciseForm writes for custom exercises. The map used
// to key on the first only, with an exact lookup, so every custom exercise
// resolved to [] and disappeared from the heat map without a trace.

describe('muscleGroupToSlugs', () => {
  it('resolves the seed vocabulary', () => {
    expect(muscleGroupToSlugs('Chest')).toEqual(['chest']);
    expect(muscleGroupToSlugs('Quadriceps')).toEqual(['quadriceps']);
    expect(muscleGroupToSlugs('Abdominals')).toEqual(['abs']);
    expect(muscleGroupToSlugs('Lats')).toEqual(['upper-back']);
  });

  it('resolves the custom-exercise vocabulary', () => {
    expect(muscleGroupToSlugs('chest')).toEqual(['chest']);
    expect(muscleGroupToSlugs('quads')).toEqual(['quadriceps']);
    expect(muscleGroupToSlugs('abs')).toEqual(['abs']);
    expect(muscleGroupToSlugs('glutes')).toEqual(['gluteal']);
  });

  it('fans "back" out to both back slugs', () => {
    // The seed splits the back into Lats / Upper Back / Lower Back; the custom
    // form offers one "back" pill, which has to light up both halves.
    expect(muscleGroupToSlugs('back')).toEqual(['upper-back', 'lower-back']);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(muscleGroupToSlugs('UPPER BACK')).toEqual(['upper-back']);
    expect(muscleGroupToSlugs('  Upper   Back ')).toEqual(['upper-back']);
  });

  it('returns [] for options with no anatomical target', () => {
    expect(muscleGroupToSlugs('full body')).toEqual([]);
    expect(muscleGroupToSlugs('cardio')).toEqual([]);
  });

  it('returns [] for null and unknown names', () => {
    expect(muscleGroupToSlugs(null)).toEqual([]);
    expect(muscleGroupToSlugs('')).toEqual([]);
    expect(muscleGroupToSlugs('spleen')).toEqual([]);
  });
});

describe('buildBodyData', () => {
  it('weights the primary muscle above secondaries', () => {
    const data = buildBodyData('Chest', ['Triceps']);
    expect(data).toContainEqual({ slug: 'chest', intensity: 2 });
    expect(data).toContainEqual({ slug: 'triceps', intensity: 1 });
  });

  it('keeps the primary weighting when a muscle is also listed as secondary', () => {
    const data = buildBodyData('Chest', ['Chest']);
    expect(data).toEqual([{ slug: 'chest', intensity: 2 }]);
  });

  it('works for a custom exercise', () => {
    // The whole point: this used to come back empty.
    expect(buildBodyData('chest', null)).toEqual([{ slug: 'chest', intensity: 2 }]);
  });
});

describe('aggregateMuscles', () => {
  it('returns [] for no input and for input that maps to nothing', () => {
    expect(aggregateMuscles([])).toEqual([]);
    expect(aggregateMuscles([{ muscleGroup: 'cardio', secondaryMuscles: [] }])).toEqual([]);
  });

  // The endpoint used to return DISTINCT (muscleGroup, secondaryMuscles) rows,
  // so eight sets of bench and one set of curls arrived as one row each and
  // coloured identically.
  it('weights by set count, not by row count', () => {
    const data = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: 8 },
      { muscleGroup: 'Biceps', secondaryMuscles: [], sets: 1 },
    ]);
    const chest = data.find((d) => d.slug === 'chest')!.intensity!;
    const biceps = data.find((d) => d.slug === 'biceps')!.intensity!;
    expect(chest).toBe(3);
    expect(biceps).toBeLessThan(chest);
  });

  it('colours equal set counts equally', () => {
    const data = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: 4 },
      { muscleGroup: 'Biceps', secondaryMuscles: [], sets: 4 },
    ]);
    expect(data.find((d) => d.slug === 'chest')!.intensity).toBe(3);
    expect(data.find((d) => d.slug === 'biceps')!.intensity).toBe(3);
  });

  it('accumulates repeated work on the same muscle', () => {
    const once = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: 3 },
      { muscleGroup: 'Biceps', secondaryMuscles: [], sets: 12 },
    ]);
    const twice = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: 3 },
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: 3 },
      { muscleGroup: 'Biceps', secondaryMuscles: [], sets: 12 },
    ]);
    const chestOnce = once.find((d) => d.slug === 'chest')!.intensity!;
    const chestTwice = twice.find((d) => d.slug === 'chest')!.intensity!;
    expect(chestTwice).toBeGreaterThan(chestOnce);
  });

  it('counts a secondary muscle at half a primary', () => {
    const data = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: ['Triceps'], sets: 4 },
    ]);
    expect(data.find((d) => d.slug === 'chest')!.intensity).toBe(3);
    expect(data.find((d) => d.slug === 'triceps')!.intensity).toBe(2);
  });

  it('mixes the two vocabularies onto the same slug', () => {
    // A seed exercise and a custom one, both chest — one muscle, not two.
    const data = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: 2 },
      { muscleGroup: 'chest', secondaryMuscles: [], sets: 2 },
    ]);
    expect(data.filter((d) => d.slug === 'chest')).toHaveLength(1);
  });

  // A response cached before `sets` existed, or a malformed one, must not blank
  // the map — `max` is derived from these weights.
  it('defaults a missing or nonsensical set count to 1', () => {
    const missing = aggregateMuscles([{ muscleGroup: 'Chest', secondaryMuscles: [] }]);
    expect(missing).toEqual([{ slug: 'chest', intensity: 3 }]);

    const bad = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: [], sets: NaN },
      { muscleGroup: 'Biceps', secondaryMuscles: [], sets: -5 },
    ]);
    expect(bad.every((d) => Number.isFinite(d.intensity))).toBe(true);
    expect(bad).toHaveLength(2);
  });

  it('never returns an intensity outside 1–3', () => {
    const data = aggregateMuscles([
      { muscleGroup: 'Chest', secondaryMuscles: ['Biceps'], sets: 500 },
      { muscleGroup: 'Calves', secondaryMuscles: [], sets: 1 },
    ]);
    for (const d of data) {
      expect(d.intensity).toBeGreaterThanOrEqual(1);
      expect(d.intensity).toBeLessThanOrEqual(3);
    }
  });
});
