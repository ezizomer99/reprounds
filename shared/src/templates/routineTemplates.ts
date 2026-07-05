/**
 * Starter routine templates — seeded programs a new user can clone into their
 * own routines in one tap. Purely static data (no fetch); the backend resolves
 * exercise/discipline names against global seed rows when instantiating.
 *
 * One template = one or more routines, because a routine row is a single
 * training day (e.g. a PPL split is three routines).
 */

export interface RoutineTemplateExerciseItem {
  kind: 'exercise';
  /** Matched case-insensitively against global exercise names (name fallback resolution). */
  name: string;
  /** Working-set target shown in the plan, e.g. "3 × 5". */
  sets?: number;
  reps?: string;
  restSeconds?: number;
}

export interface RoutineTemplateMatItem {
  kind: 'martial_arts';
  /** Matched exactly (case-insensitive) against global discipline names. */
  disciplineName: string;
}

export type RoutineTemplateItem = RoutineTemplateExerciseItem | RoutineTemplateMatItem;

export interface RoutineTemplateDay {
  name: string;
  dayLabel?: string;
  items: RoutineTemplateItem[];
}

export interface RoutineTemplate {
  id: string;
  name: string;
  description: string;
  goal: 'gym' | 'martial_arts' | 'both';
  daysPerWeek: number;
  routines: RoutineTemplateDay[];
}

const ex = (name: string, sets: number, reps: string): RoutineTemplateExerciseItem => ({
  kind: 'exercise',
  name,
  sets,
  reps,
});

const mat = (disciplineName: string): RoutineTemplateMatItem => ({
  kind: 'martial_arts',
  disciplineName,
});

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: 'full-body-3x',
    name: 'Full Body 3×/week',
    description: 'Three full-body days a week — the simplest effective start for a new lifter.',
    goal: 'gym',
    daysPerWeek: 3,
    routines: [
      {
        name: 'Full Body A',
        dayLabel: 'Day A',
        items: [ex('Squat', 3, '5'), ex('Bench Press', 3, '5'), ex('Barbell Row', 3, '5'), ex('Plank', 3, '30s')],
      },
      {
        name: 'Full Body B',
        dayLabel: 'Day B',
        items: [ex('Deadlift', 1, '5'), ex('Overhead Press', 3, '5'), ex('Pull Up', 3, 'AMRAP'), ex('Plank', 3, '30s')],
      },
      {
        name: 'Full Body C',
        dayLabel: 'Day C',
        items: [ex('Squat', 3, '5'), ex('Bench Press', 3, '5'), ex('Barbell Row', 3, '5'), ex('Bicep Curl', 3, '10')],
      },
    ],
  },
  {
    id: 'ppl',
    name: 'Push / Pull / Legs',
    description: 'A classic six-day hypertrophy split across push, pull, and leg days.',
    goal: 'gym',
    daysPerWeek: 6,
    routines: [
      {
        name: 'Push',
        dayLabel: 'Push',
        items: [ex('Bench Press', 4, '8'), ex('Overhead Press', 3, '10'), ex('Incline Bench Press', 3, '10'), ex('Tricep Pushdown', 3, '12')],
      },
      {
        name: 'Pull',
        dayLabel: 'Pull',
        items: [ex('Deadlift', 3, '6'), ex('Pull Up', 3, 'AMRAP'), ex('Barbell Row', 3, '10'), ex('Bicep Curl', 3, '12')],
      },
      {
        name: 'Legs',
        dayLabel: 'Legs',
        items: [ex('Squat', 4, '8'), ex('Romanian Deadlift', 3, '10'), ex('Leg Press', 3, '12'), ex('Calf Raise', 4, '15')],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    description: 'A balanced four-day split alternating upper- and lower-body sessions.',
    goal: 'gym',
    daysPerWeek: 4,
    routines: [
      {
        name: 'Upper A',
        dayLabel: 'Upper',
        items: [ex('Bench Press', 4, '6'), ex('Barbell Row', 4, '6'), ex('Overhead Press', 3, '10'), ex('Pull Up', 3, 'AMRAP')],
      },
      {
        name: 'Lower A',
        dayLabel: 'Lower',
        items: [ex('Squat', 4, '6'), ex('Romanian Deadlift', 3, '8'), ex('Leg Press', 3, '12'), ex('Calf Raise', 4, '15')],
      },
    ],
  },
  {
    id: 'strong-5x5',
    name: 'Strong 5×5',
    description: 'Two alternating full-body days of heavy compound 5×5 work for strength.',
    goal: 'gym',
    daysPerWeek: 3,
    routines: [
      {
        name: 'Workout A',
        dayLabel: 'A',
        items: [ex('Squat', 5, '5'), ex('Bench Press', 5, '5'), ex('Barbell Row', 5, '5')],
      },
      {
        name: 'Workout B',
        dayLabel: 'B',
        items: [ex('Squat', 5, '5'), ex('Overhead Press', 5, '5'), ex('Deadlift', 1, '5')],
      },
    ],
  },
  {
    id: 'bjj-plus-lifting',
    name: 'BJJ + 2 Lifts',
    description: 'Three mat sessions a week backed by two full-body lifts to build strength.',
    goal: 'both',
    daysPerWeek: 5,
    routines: [
      { name: 'BJJ', dayLabel: 'Mat', items: [mat('BJJ')] },
      {
        name: 'Strength A',
        dayLabel: 'Lift',
        items: [ex('Squat', 3, '5'), ex('Bench Press', 3, '5'), ex('Pull Up', 3, 'AMRAP')],
      },
      {
        name: 'Strength B',
        dayLabel: 'Lift',
        items: [ex('Deadlift', 1, '5'), ex('Overhead Press', 3, '5'), ex('Barbell Row', 3, '8')],
      },
    ],
  },
  {
    id: 'striking-plus-lifting',
    name: 'Striking + 2 Lifts',
    description: 'Three striking sessions a week plus two lifting days for power and conditioning.',
    goal: 'both',
    daysPerWeek: 5,
    routines: [
      { name: 'Muay Thai', dayLabel: 'Mat', items: [mat('Muay Thai')] },
      {
        name: 'Strength A',
        dayLabel: 'Lift',
        items: [ex('Squat', 3, '5'), ex('Overhead Press', 3, '8'), ex('Pull Up', 3, 'AMRAP')],
      },
      {
        name: 'Strength B',
        dayLabel: 'Lift',
        items: [ex('Deadlift', 1, '5'), ex('Bench Press', 3, '5'), ex('Barbell Row', 3, '8')],
      },
    ],
  },
];

export function findRoutineTemplate(id: string): RoutineTemplate | undefined {
  return ROUTINE_TEMPLATES.find((t) => t.id === id);
}
