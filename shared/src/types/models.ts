import type { ActivityType, DisciplineCat, EntryKind, FightMethod, FightResult, GiType, SessionStatus, SetType } from './enums';
import type { FieldConfig } from './fieldConfig';
import type { StrikeCounts, StrikingRoundType } from './rounds';

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  /** ISO timestamp when first-run onboarding was completed; null if not yet. */
  onboardedAt: string | null;
}

export interface UpdateMeRequest {
  onboarded?: boolean;
}

export interface GuestAuthRequest {
  deviceId: string;
}

// guestToken is the guest account's own session JWT — proof the caller holds
// that guest session. The server verifies it and migrates the guest's data
// into the signed-in account. (A bare guest user id is NOT accepted: anyone
// who learned the UUID could steal the guest's history.)
export interface GoogleAuthRequest {
  idToken: string;
  guestToken?: string | null;
}

// Email/password (credential) account registration. Like the Google flow, an
// optional guestToken migrates an existing guest account's data into the new
// credential account.
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string | null;
  guestToken?: string | null;
}

// Email/password login. guestToken migrates guest data on first sign-in.
export interface LoginRequest {
  email: string;
  password: string;
  guestToken?: string | null;
}

export interface AuthResponse {
  sessionToken: string;
  user: User;
}

export interface Exercise {
  id: string;
  userId: string | null;
  name: string;
  type: Exclude<ActivityType, 'martial_arts'>;
  createdAt: string;
  // Metadata — null on user-created custom exercises
  category: string | null;
  bodyPart: string | null;
  equipment: string | null;
  muscleGroup: string | null;
  secondaryMuscles: string[] | null;
  target: string | null;
  imageUrl: string | null;
  // Heavy fields — only populated by GET /exercises/:id, null in list responses
  instructions: string | null;
  instructionSteps: string[] | null;
}

export interface Discipline {
  id: string;
  userId: string | null;
  name: string;
  category: DisciplineCat;
  fieldConfig: FieldConfig;
  createdAt: string;
}

// A training partner the user rolls/spars with, referenced by id from
// martial-arts rounds (RoundsSessionDetails). Name only.
export interface Partner {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

// A competition / fight result, tagged to a discipline. Aggregates into the
// user's win-loss-draw record on the discipline detail screen.
export interface Fight {
  id: string;
  userId: string;
  disciplineId: string;
  date: string;
  opponent: string | null;
  result: FightResult;
  method: FightMethod | null;
  round: number | null;
  notes: string | null;
  createdAt: string;
}

// A single body-weight weigh-in. weightKg is the stored value; display unit is
// handled client-side.
export interface WeightLog {
  id: string;
  userId: string;
  date: string;
  weightKg: number;
  notes: string | null;
  createdAt: string;
}

// A belt/rank promotion, tagged to a discipline. The most recent by date is the
// user's current rank.
export interface RankPromotion {
  id: string;
  userId: string;
  disciplineId: string;
  rank: string;
  stripes: number | null;
  date: string;
  notes: string | null;
  createdAt: string;
}

export interface Routine {
  id: string;
  userId: string;
  name: string;
  dayLabel: string | null;
  notes: string | null;
  // Optional recurring schedule. A routine with rrule === null is unscheduled
  // (run ad-hoc); a routine with rrule set recurs on the calendar.
  rrule: string | null;
  startDate: string | null;
  endDate: string | null;
  timeOfDay: string | null;
  createdAt: string;
  items?: RoutineItem[];
}

// A single planned set in a routine exercise. Mirrors a logged StrengthSet so the
// plan can be tracked 1:1 during a workout. For conditioning exercises, plan
// durationSeconds instead of reps.
export interface PlannedSet {
  setType: SetType;
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
}

// Planned target for a routine exercise item. Stored in routine_items.target.
// `sets` is an ordered list (warm-ups first, then working sets) that pre-fills
// the live workout when a session is started from the routine.
export interface RoutineItemTarget {
  sets?: PlannedSet[];
}

export interface RoutineItem {
  id: string;
  routineId: string;
  kind: EntryKind;
  exerciseId: string | null;
  disciplineId: string | null;
  orderIndex: number;
  supersetGroup: number | null;
  defaultRestSeconds: number | null;
  target: Record<string, unknown> | null;
}

export interface Session {
  id: string;
  userId: string;
  routineId: string | null;
  name: string | null;
  date: string;
  status: SessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
  entries?: SessionEntry[];
  /** Distinct entry kinds present in this session (set on list responses). */
  kinds?: EntryKind[];
}

export interface SessionEntry {
  id: string;
  sessionId: string;
  kind: EntryKind;
  exerciseId: string | null;
  disciplineId: string | null;
  gi: GiType | null;
  orderIndex: number;
  supersetGroup: number | null;
  restSeconds: number | null;
  details: Record<string, unknown> | null;
  notes: string | null;
  sets?: StrengthSet[];
}

export interface StrengthSet {
  id: string;
  sessionEntryId: string;
  setNumber: number;
  setType: SetType;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  rir: number | null;
  completed: boolean;
  notes: string | null;
}

export type CalendarItem =
  | { kind: 'real'; session: Session }
  | { kind: 'virtual'; date: string; routineId: string };

export interface ExerciseListResponse {
  exercises: Exercise[];
}

export interface DisciplineListResponse {
  disciplines: Discipline[];
}

export interface PartnerListResponse {
  partners: Partner[];
}

export interface CreatePartnerRequest {
  name: string;
}

export interface UpdatePartnerRequest {
  name?: string;
}

export interface FightListResponse {
  fights: Fight[];
}

export interface CreateFightRequest {
  disciplineId: string;
  date: string;
  opponent?: string | null;
  result: FightResult;
  method?: FightMethod | null;
  round?: number | null;
  notes?: string | null;
}

export interface UpdateFightRequest {
  date?: string;
  opponent?: string | null;
  result?: FightResult;
  method?: FightMethod | null;
  round?: number | null;
  notes?: string | null;
}

export interface RankPromotionListResponse {
  promotions: RankPromotion[];
}

export interface CreateRankPromotionRequest {
  disciplineId: string;
  rank: string;
  stripes?: number | null;
  date: string;
  notes?: string | null;
}

export interface WeightLogListResponse {
  weights: WeightLog[];
}

export interface CreateWeightLogRequest {
  date: string;
  weightKg: number;
  notes?: string | null;
}

export interface CreateExerciseRequest {
  name: string;
  type: Exclude<ActivityType, 'martial_arts'>;
  target?: string | null;
  muscleGroup?: string | null;
  equipment?: string | null;
}

export interface UpdateExerciseRequest {
  name?: string;
  type?: Exclude<ActivityType, 'martial_arts'>;
  target?: string | null;
}

export interface CreateDisciplineRequest {
  name: string;
  category: DisciplineCat;
  fieldConfig?: FieldConfig;
}

export interface UpdateDisciplineRequest {
  name?: string;
  category?: DisciplineCat;
  fieldConfig?: FieldConfig;
}

export interface RoutineItemWithDetails extends RoutineItem {
  exerciseName: string | null;
  disciplineName: string | null;
}

export interface RoutineWithItems extends Routine {
  items: RoutineItemWithDetails[];
}

export interface RoutineListResponse {
  routines: RoutineWithItems[];
}

export interface CreateFromTemplateRequest {
  templateId: string;
}

/** An item a template couldn't resolve to a global exercise/discipline. */
export interface SkippedTemplateItem {
  routineName: string;
  itemName: string;
  reason: string;
}

export interface CreateFromTemplateResponse {
  routines: RoutineWithItems[];
  skipped: SkippedTemplateItem[];
}

export interface CreateRoutineItemRequest {
  kind: EntryKind;
  exerciseId?: string | null;
  disciplineId?: string | null;
  orderIndex?: number;
  supersetGroup?: number | null;
  defaultRestSeconds?: number | null;
  target?: Record<string, unknown> | null;
}

export interface CreateRoutineRequest {
  name: string;
  dayLabel?: string | null;
  notes?: string | null;
  rrule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeOfDay?: string | null;
  items?: CreateRoutineItemRequest[];
}

export interface UpdateRoutineRequest {
  name?: string;
  dayLabel?: string | null;
  notes?: string | null;
  // Schedule fields — set rrule to null to remove a routine from the calendar.
  rrule?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeOfDay?: string | null;
}

export type AddRoutineItemRequest = CreateRoutineItemRequest;

export interface UpdateRoutineItemRequest {
  orderIndex?: number;
  supersetGroup?: number | null;
  defaultRestSeconds?: number | null;
  target?: Record<string, unknown> | null;
}

export interface ReorderRoutineItemsRequest {
  order: string[];
}

// Skip a single scheduled occurrence of a routine on a given date.
export interface SkipOccurrenceRequest {
  date: string; // ISO date YYYY-MM-DD
}

// ---- Phase 4: Session Logging ----

export interface CreateSessionRequest {
  routineId?: string | null;
  date: string; // ISO date YYYY-MM-DD
  notes?: string | null;
}

export interface UpdateSessionRequest {
  name?: string | null;
  notes?: string | null;
  durationMinutes?: number | null;
}

export interface CompleteSessionRequest {
  name?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  date?: string; // ISO date YYYY-MM-DD — allows backdating
}

export interface CreateSessionEntryRequest {
  kind: EntryKind;
  exerciseId?: string | null;
  disciplineId?: string | null;
  gi?: GiType | null;
  orderIndex?: number;
  restSeconds?: number | null;
  details?: Record<string, unknown> | null;
  notes?: string | null;
}

export interface UpdateSessionEntryRequest {
  gi?: GiType | null;
  restSeconds?: number | null;
  details?: Record<string, unknown> | null;
  notes?: string | null;
  supersetGroup?: number | null;
  /** Swap the exercise on an exercise-kind entry. Cannot be null (use a real UUID). */
  exerciseId?: string | null;
}

/** Full new ordering of a session's entries (entry IDs, first = top). */
export interface ReorderSessionEntriesRequest {
  order: string[];
}

export interface CreateStrengthSetRequest {
  setNumber: number;
  setType?: SetType;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  rir?: number | null;
  completed?: boolean;
  notes?: string | null;
}

export interface UpdateStrengthSetRequest {
  setType?: SetType;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  rir?: number | null;
  completed?: boolean;
  notes?: string | null;
}

export interface SessionEntryWithSets extends SessionEntry {
  sets: StrengthSet[];
  exerciseName: string | null;
  disciplineName: string | null;
}

export interface SessionWithEntries extends Session {
  entries: SessionEntryWithSets[];
}

export interface SessionListResponse {
  sessions: Session[];
}

export interface ExerciseHistoryEntry {
  sessionId: string;
  date: string;
  entry: SessionEntryWithSets;
}

export interface ExerciseHistoryResponse {
  history: ExerciseHistoryEntry[];
}

export interface ExercisePRsResponse {
  estimatedOneRepMax: number | null;
  bestSet: StrengthSet | null;
  totalSessions: number;
}

// ---- Stats ----

export interface MuscleSummaryItem {
  muscleGroup: string | null;
  secondaryMuscles: string[];
}

export interface MuscleSummaryResponse {
  muscles: MuscleSummaryItem[];
}

export interface TopLift {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  estimatedOneRepMax: number;
}

export interface TopLiftsResponse {
  lifts: TopLift[];
}

// ---- Mat (martial arts) stats ----

export interface MatWeekBucket {
  /** ISO date of the bucket's Monday, YYYY-MM-DD. */
  weekStart: string;
  rounds: number;
  /** Whole minutes of mat time attributed to this week. */
  minutes: number;
  /** Distinct completed sessions containing a martial-arts entry. */
  sessions: number;
}

export interface MatStatsResponse {
  /** Oldest → newest, one bucket per requested week. */
  weeks: MatWeekBucket[];
  totals: {
    sessions: number;
    rounds: number;
    minutes: number;
  };
  /** Round counts by intensity; rounds without an intensity land in `unspecified`. */
  intensity: {
    light: number;
    medium: number;
    hard: number;
    unspecified: number;
  };
  // Mixed (MMA) rounds fold their counters into these blocks but only
  // category-pure rounds contribute to each block's `rounds` count.
  grappling: {
    rounds: number;
    submissionsFor: number;
    submissionsAgainst: number;
    sweeps: number;
    takedowns: number;
  };
  striking: {
    rounds: number;
    roundsByType: Partial<Record<StrikingRoundType, number>>;
    strikes: StrikeCounts;
    totalStrikes: number;
  };
}

// ---- Per-partner sparring stats ----

export interface PartnerStatsItem {
  /** partnerId, or null for the "Unassigned" bucket (rounds with no partner). */
  partnerId: string | null;
  name: string;
  rounds: number;
  minutes: number;
  sessions: number;
  submissionsFor: number;
  submissionsAgainst: number;
  /** ISO date (YYYY-MM-DD) of the most recent session rolled together. */
  lastDate: string | null;
}

export interface PartnerStatsResponse {
  since: string;
  partners: PartnerStatsItem[];
}

// ---- Notes timeline ----

export type NoteSource =
  | { type: 'session' }
  | { type: 'entry'; entryId: string }
  | { type: 'technique'; entryId: string }
  | { type: 'round'; entryId: string; roundNumber: number };

export interface NoteItem {
  source: NoteSource;
  /** Display label computed server-side, e.g. "Session notes", "BJJ — Round 3". */
  label: string;
  text: string;
}

export interface NotesSessionGroup {
  sessionId: string;
  date: string;
  sessionName: string | null;
  kinds: EntryKind[];
  notes: NoteItem[];
}

export interface NotesTimelineResponse {
  groups: NotesSessionGroup[];
  /** Opaque keyset cursor ("<date>_<sessionId>"); null when exhausted. */
  nextCursor: string | null;
}

// ---- Phase 5: Calendar + Recurrence ----

export interface CalendarResponse {
  items: CalendarItem[];
}
