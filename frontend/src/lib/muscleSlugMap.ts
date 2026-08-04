// Maps muscle-group strings to react-native-body-highlighter slugs.
//
// Two vocabularies reach this map and they do not agree:
//   1. The exercises.json seed, which stores Title-Case anatomical names
//      ('Quadriceps', 'Lats', 'Abdominals').
//   2. Custom exercises, where ExerciseForm's MUSCLE_OPTIONS writes lowercase
//      gym shorthand ('quads', 'back', 'abs').
// The map used to key on (1) only, with an exact `MAP[muscleGroup]` lookup — so
// every user-created exercise resolved to [] and vanished from the heat map and
// from its own detail-screen body diagram, silently. Lookups are normalized and
// both vocabularies are listed below.
//
// Supported library slugs: abs | adductors | ankles | biceps | calves | chest |
//   deltoids | feet | forearm | gluteal | hamstring | hands | hair | head |
//   knees | lower-back | neck | obliques | quadriceps | tibialis | trapezius |
//   triceps | upper-back
// Note: 'abductors' (outer hip) is NOT in the library's slug list — folded into
// 'adductors' so the hip at least registers.

import type { Slug } from 'react-native-body-highlighter';

export type MuscleEntry = { slug: Slug; intensity?: number };

/**
 * Keys are normalized (lowercase, trimmed) — see `normalizeMuscleName`. An empty
 * array means "recognized, but no anatomical target", which is different from an
 * unknown name: 'cardio' and 'full body' are deliberately not drawn on the body.
 */
const MAP: Record<string, Slug[]> = {
  // ── Seed vocabulary (exercises.json, Title Case in the data) ──
  chest: ['chest'],
  lats: ['upper-back'],
  'upper back': ['upper-back'],
  'lower back': ['lower-back'],
  traps: ['trapezius'],
  shoulders: ['deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  abdominals: ['abs'],
  obliques: ['obliques'],
  quadriceps: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves'],
  adductors: ['adductors'],
  abductors: ['adductors'],
  neck: ['neck'],

  // ── Custom-exercise vocabulary (ExerciseForm MUSCLE_OPTIONS) ──
  // 'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'hamstrings',
  // 'glutes' and 'calves' are spelled identically once normalized.
  back: ['upper-back', 'lower-back'],
  quads: ['quadriceps'],
  abs: ['abs'],
  'full body': [],
  cardio: [],
};

/** Lowercased and whitespace-collapsed, so 'Upper Back' and 'upper  back' agree. */
function normalizeMuscleName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function muscleGroupToSlugs(muscleGroup: string | null): Slug[] {
  if (!muscleGroup) return [];
  return MAP[normalizeMuscleName(muscleGroup)] ?? [];
}

/** Primary muscles count double what secondary muscles do. */
const PRIMARY_WEIGHT = 2;
const SECONDARY_WEIGHT = 1;

/** Build a deduplicated list of Slug entries for the body highlighter.
 *  Primary muscles get intensity 2, secondary muscles get intensity 1. */
export function buildBodyData(
  primaryMuscle: string | null,
  secondaryMuscles: string[] | null,
): MuscleEntry[] {
  const seen = new Map<Slug, number>();

  for (const slug of muscleGroupToSlugs(primaryMuscle)) {
    seen.set(slug, PRIMARY_WEIGHT);
  }
  for (const sm of secondaryMuscles ?? []) {
    for (const slug of muscleGroupToSlugs(sm)) {
      if (!seen.has(slug)) seen.set(slug, SECONDARY_WEIGHT);
    }
  }

  return Array.from(seen.entries()).map(([slug, intensity]) => ({ slug, intensity }));
}

/**
 * Aggregate a window's muscle work into body-highlighter entries.
 *
 * Each item is weighted by `sets` — the completed working sets logged against
 * that muscle grouping. The endpoint used to return DISTINCT
 * (muscleGroup, secondaryMuscles) tuples and every item counted once, so one set
 * of curls colours a bicep exactly as hot as eight sets of bench colour a chest.
 * `sets` defaults to 1 so a response cached before the field existed still
 * renders (at the old, flat weighting) rather than blanking the map.
 */
export function aggregateMuscles(
  muscles: { muscleGroup: string | null; secondaryMuscles: string[] | null; sets?: number }[],
): MuscleEntry[] {
  const counts = new Map<Slug, number>();

  for (const { muscleGroup, secondaryMuscles, sets } of muscles) {
    // Guard the weight rather than trusting it: a NaN or negative from a stale
    // cache would poison `max` and blank every muscle on the map.
    const weight = Number.isFinite(sets) && (sets as number) > 0 ? (sets as number) : 1;

    for (const slug of muscleGroupToSlugs(muscleGroup)) {
      counts.set(slug, (counts.get(slug) ?? 0) + weight * PRIMARY_WEIGHT);
    }
    for (const sm of secondaryMuscles ?? []) {
      for (const slug of muscleGroupToSlugs(sm)) {
        counts.set(slug, (counts.get(slug) ?? 0) + weight * SECONDARY_WEIGHT);
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
