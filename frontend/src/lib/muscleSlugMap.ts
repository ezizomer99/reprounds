// Maps exercise dataset muscle group / body part strings to react-native-body-highlighter slugs.
// Source values come from the exercises.json seed data — exact casing preserved.
// Supported library slugs: abs | adductors | ankles | biceps | calves | chest | deltoids |
//   feet | forearm | gluteal | hamstring | hands | hair | head | knees | lower-back | neck |
//   obliques | quadriceps | tibialis | trapezius | triceps | upper-back
// Note: 'abductors' (outer hip) is NOT in the library's slug list — omitted.

import type { Slug } from 'react-native-body-highlighter';

export type MuscleEntry = { slug: Slug; intensity?: number };

const MAP: Record<string, Slug[]> = {
  Chest:        ['chest'],
  Lats:         ['upper-back'],
  'Upper Back': ['upper-back'],
  'Lower Back': ['lower-back'],
  Traps:        ['trapezius'],
  Shoulders:    ['deltoids'],
  Biceps:       ['biceps'],
  Triceps:      ['triceps'],
  Forearms:     ['forearm'],
  Abdominals:   ['abs'],
  Obliques:     ['obliques'],
  Quadriceps:   ['quadriceps'],
  Hamstrings:   ['hamstring'],
  Glutes:       ['gluteal'],
  Calves:       ['calves'],
  Adductors:    ['adductors'],
  Abductors:    ['adductors'],
  Neck:         ['neck'],
};

export function muscleGroupToSlugs(muscleGroup: string | null): Slug[] {
  if (!muscleGroup) return [];
  return MAP[muscleGroup] ?? [];
}

/** Build a deduplicated list of Slug entries for the body highlighter.
 *  Primary muscles get intensity 2, secondary muscles get intensity 1. */
export function buildBodyData(
  primaryMuscle: string | null,
  secondaryMuscles: string[] | null,
): MuscleEntry[] {
  const seen = new Map<Slug, number>();

  for (const slug of muscleGroupToSlugs(primaryMuscle)) {
    seen.set(slug, 2);
  }
  for (const sm of secondaryMuscles ?? []) {
    for (const slug of muscleGroupToSlugs(sm)) {
      if (!seen.has(slug)) seen.set(slug, 1);
    }
  }

  return Array.from(seen.entries()).map(([slug, intensity]) => ({ slug, intensity }));
}

/** Aggregate muscle data from multiple exercises (e.g. a week's sessions).
 *  Returns entries sorted by hit count descending so more-trained muscles
 *  appear at higher intensity. */
export function aggregateMuscles(
  muscles: { muscleGroup: string | null; secondaryMuscles: string[] | null }[],
): MuscleEntry[] {
  const counts = new Map<Slug, number>();

  for (const { muscleGroup, secondaryMuscles } of muscles) {
    for (const slug of muscleGroupToSlugs(muscleGroup)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 2);
    }
    for (const sm of secondaryMuscles ?? []) {
      for (const slug of muscleGroupToSlugs(sm)) {
        counts.set(slug, (counts.get(slug) ?? 0) + 1);
      }
    }
  }

  if (counts.size === 0) return [];

  const max = Math.max(...counts.values());
  return Array.from(counts.entries()).map(([slug, count]) => ({
    slug,
    // Normalize to intensity 1–3 for the color scale
    intensity: Math.max(1, Math.ceil((count / max) * 3)),
  }));
}
