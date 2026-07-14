// Runtime companions to the type-only enum unions in types/enums.ts. The backend
// hand-validates request bodies (no schema library), and previously trusted enum
// fields straight from the body — an invalid value became a DB constraint error
// surfaced as a generic 500. These guards let handlers return a clean 400 instead.
// Keep the arrays in lockstep with the unions in types/enums.ts.
import type {
  ActivityType,
  DisciplineCat,
  EntryKind,
  FightMethod,
  FightResult,
  FocusStatus,
  GiType,
  SessionStatus,
  SetType,
  TechniqueKind,
} from './types/enums';

export const ACTIVITY_TYPES: readonly ActivityType[] = ['strength', 'conditioning', 'martial_arts'];
export const ENTRY_KINDS: readonly EntryKind[] = ['exercise', 'martial_arts'];
export const DISCIPLINE_CATS: readonly DisciplineCat[] = ['grappling', 'striking', 'mixed'];
export const SESSION_STATUSES: readonly SessionStatus[] = [
  'planned',
  'in_progress',
  'completed',
  'skipped',
];
export const SET_TYPES: readonly SetType[] = ['warmup', 'normal', 'drop', 'failure', 'amrap'];
export const GI_TYPES: readonly GiType[] = ['gi', 'no_gi'];
export const FIGHT_RESULTS: readonly FightResult[] = ['win', 'loss', 'draw'];
export const FIGHT_METHODS: readonly FightMethod[] = [
  'ko',
  'tko',
  'submission',
  'decision',
  'points',
  'other',
];
export const FOCUS_STATUSES: readonly FocusStatus[] = ['active', 'achieved', 'archived'];
export const TECHNIQUE_KINDS: readonly TechniqueKind[] = ['position', 'submission'];

const isMember = <T extends string>(arr: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (arr as readonly string[]).includes(v);

export const isActivityType = (v: unknown): v is ActivityType => isMember(ACTIVITY_TYPES, v);
export const isEntryKind = (v: unknown): v is EntryKind => isMember(ENTRY_KINDS, v);
export const isDisciplineCat = (v: unknown): v is DisciplineCat => isMember(DISCIPLINE_CATS, v);
export const isSessionStatus = (v: unknown): v is SessionStatus => isMember(SESSION_STATUSES, v);
export const isSetType = (v: unknown): v is SetType => isMember(SET_TYPES, v);
export const isGiType = (v: unknown): v is GiType => isMember(GI_TYPES, v);
export const isFightResult = (v: unknown): v is FightResult => isMember(FIGHT_RESULTS, v);
export const isFightMethod = (v: unknown): v is FightMethod => isMember(FIGHT_METHODS, v);
export const isFocusStatus = (v: unknown): v is FocusStatus => isMember(FOCUS_STATUSES, v);
export const isTechniqueKind = (v: unknown): v is TechniqueKind => isMember(TECHNIQUE_KINDS, v);

// A finite number within an optional inclusive range. Used for reps/rpe/rir/round/
// stripes/durationMinutes so out-of-range or non-numeric input is a 400, not a 500.
export function isNumberInRange(
  v: unknown,
  min: number = Number.NEGATIVE_INFINITY,
  max: number = Number.POSITIVE_INFINITY,
): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}
