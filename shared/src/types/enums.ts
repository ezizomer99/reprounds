export type ActivityType    = 'strength' | 'conditioning' | 'martial_arts';
export type EntryKind      = 'exercise' | 'martial_arts';
export type DisciplineCat  = 'grappling' | 'striking' | 'mixed';
export type DisciplineCategory = DisciplineCat;
export type SessionStatus  = 'planned' | 'in_progress' | 'completed' | 'skipped';
export type SetType        = 'warmup' | 'normal' | 'drop' | 'failure' | 'amrap';
export type GiType         = 'gi' | 'no_gi';
export type FightResult    = 'win' | 'loss' | 'draw';
export type FightMethod    = 'ko' | 'tko' | 'submission' | 'decision' | 'points' | 'other';
export type FocusStatus    = 'active' | 'achieved' | 'archived';
export type TechniqueKind  = 'position' | 'submission';

/**
 * Which fields a conditioning exercise tracks. Jump rope / bag work are
 * duration-only; running / rowing add distance. Strength exercises don't use
 * this — `Exercise.metrics` is null for them.
 */
export type ConditioningMetric = 'duration' | 'distance';

/**
 * The muscles a user can tag an exercise with. Deliberately gym shorthand rather
 * than anatomy — it is the pick-list, not a description of the body.
 *
 * `Exercise.muscleGroup` / `secondaryMuscles` stay `string`, NOT this union: the
 * seeded catalogue carries a second, Title-Case anatomical vocabulary ('Lats',
 * 'Quadriceps') that predates this list. See the note atop
 * frontend/src/lib/muscleSlugMap.ts. This union governs what the API accepts on
 * a write; reads still surface whatever the seed put there.
 */
export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'glutes' | 'quads' | 'hamstrings' | 'calves' | 'full body' | 'cardio';
