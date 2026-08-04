import type { ActivityType, DisciplineCat, EntryKind, FightMethod, FightResult, FocusStatus, GiType, SessionStatus, SetType, TechniqueKind } from './enums';
import type { FieldConfig } from './fieldConfig';
import type { StrikeCounts, StrikingRoundType } from './rounds';

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  // Server-computed Pro comp: true when the account is on the owner's complimentary
  // allowlist. The single source of truth lives server-side (backend/src/lib/
  // entitlements.ts) so the list is never shipped in the client bundle.
  isComped: boolean;
  // True for email/password (credential) accounts. Lets the client show a
  // "Change password" action only where it applies (not Google/guest accounts).
  hasPassword: boolean;
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
}

export interface Discipline {
  id: string;
  userId: string | null;
  name: string;
  category: DisciplineCat;
  fieldConfig: FieldConfig;
  createdAt: string;
}

// A grappling technique in the user's bank — the martial-arts analog of Exercise.
// `userId: null` = global seed; a non-null userId = a user's custom. `value` is the
// machine key stored in the rounds JSONB (positions[] / submissionsFor(Types) keys);
// `label` is what the chip displays.
export interface Technique {
  id: string;
  userId: string | null;
  kind: TechniqueKind;
  category: DisciplineCat;
  value: string;
  label: string;
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

// A training focus — an ongoing martial-arts goal the user works toward across
// many sessions. `disciplineId` null = a global focus (applies to all arts).
export interface TrainingFocus {
  id: string;
  userId: string;
  disciplineId: string | null;
  title: string;
  notes: string | null;
  status: FocusStatus;
  achievedAt: string | null;
  createdAt: string;
}

// A focus with its computed progress: how many sessions ticked it and when it
// was last worked. `disciplineName` is joined from the tagged discipline.
export interface FocusWithStats extends TrainingFocus {
  sessionCount: number;
  lastWorkedDate: string | null;
  disciplineName: string | null;
}

export interface FocusListResponse {
  focuses: FocusWithStats[];
}

export interface CreateFocusRequest {
  title: string;
  notes?: string | null;
  disciplineId?: string | null;
}

export interface UpdateFocusRequest {
  title?: string;
  notes?: string | null;
  disciplineId?: string | null;
  status?: FocusStatus;
}

// Replace-semantics: sets the full set of focuses ticked for a session.
export interface SetSessionFocusesRequest {
  focusIds: string[];
}

export interface Routine {
  id: string;
  userId: string;
  name: string;
  dayLabel: string | null;
  notes: string | null;
  // User-defined position in the routines list. Ascending; ties fall back to
  // newest-first so pre-existing rows keep the order they had before ordering
  // was introduced.
  orderIndex: number;
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
  /**
   * Total volume of completed sets, in kg (set on list responses). Lets the
   * calendar and history show a session's volume without fetching its entries.
   */
  volumeKg?: number;
  /** Number of completed strength sets (set on list responses). */
  completedSets?: number;
  /** IDs of the training focuses the user ticked as worked on this session. */
  focusIds?: string[];
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

export interface ExerciseListResponse {
  exercises: Exercise[];
}

export interface DisciplineListResponse {
  disciplines: Discipline[];
}

export interface TechniqueListResponse {
  techniques: Technique[];
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

// Per-discipline win-loss-draw tally, aggregated server-side so the mat tab can
// show a record badge per discipline in one request instead of fetching every
// discipline's full fight list (an N+1).
export interface FightRecord {
  disciplineId: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface FightRecordsResponse {
  records: FightRecord[];
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

export interface UpdateWeightLogRequest {
  date?: string;
  weightKg?: number;
  notes?: string | null;
}

export interface UpdateRankPromotionRequest {
  disciplineId?: string;
  rank?: string;
  stripes?: number | null;
  date?: string;
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

export interface CreateTechniqueRequest {
  kind: TechniqueKind;
  label: string;
  category?: DisciplineCat;
}

export interface UpdateTechniqueRequest {
  label?: string;
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
  items?: CreateRoutineItemRequest[];
}

export interface UpdateRoutineRequest {
  name?: string;
  dayLabel?: string | null;
  notes?: string | null;
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

export interface ReorderRoutinesRequest {
  order: string[];
}

// ---- Phase 4: Session Logging ----

export interface CreateSessionRequest {
  routineId?: string | null;
  date: string; // ISO date YYYY-MM-DD
  notes?: string | null;
  // When starting from a mixed-kind routine, restricts the seeded entries to a
  // single kind — a session is either weightlifting or martial arts, never both.
  // Required for mixed routines; ignored for empty or single-kind sessions.
  kind?: EntryKind;
  // Only 'planned' may be requested explicitly (schedule for later, no
  // startedAt, exempt from the single-active-session rule). Omitted = start now.
  status?: 'planned';
}

export interface UpdateSessionRequest {
  name?: string | null;
  notes?: string | null;
  durationMinutes?: number | null;
  date?: string; // ISO date YYYY-MM-DD — reschedule (planned sessions from the calendar)
}

export interface CompleteSessionRequest {
  name?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  date?: string; // ISO date YYYY-MM-DD — allows backdating
}

export interface StartSessionRequest {
  // Client-local today: an overdue planned session snaps to the day it
  // actually ran (the server can't know the device's timezone).
  date?: string; // ISO date YYYY-MM-DD
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
  /**
   * True when the query filled its `limit`, so older rows exist that this
   * response does not contain. Range queries have no cursor yet, and a truncated
   * calendar month used to render as blank days with no indication anything was
   * missing. Optional so older clients keep type-checking.
   */
  hasMore?: boolean;
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

// One point per completed session that included the exercise, oldest-first, for
// charting a lift's trend over time. All weights are in kg (the storage unit);
// the client converts to the user's display unit.
export interface ExerciseProgressionPoint {
  date: string; // YYYY-MM-DD
  /**
   * Best Epley e1RM across the session's completed working sets, or null when no
   * set that session was low-rep enough to estimate from (see E1RM_MAX_REPS).
   * Such a session still carries topWeight and totalVolume — it contributes no
   * point to the 1RM trend, not no point at all.
   */
  bestEstimatedOneRepMax: number | null;
  topWeight: number; // heaviest completed set that session
  totalVolume: number; // sum of weight*reps over completed sets that session
}

export interface ExerciseProgressionResponse {
  points: ExerciseProgressionPoint[];
}

// ---- Stats ----

export interface MuscleSummaryItem {
  muscleGroup: string | null;
  secondaryMuscles: string[];
  /**
   * Completed working sets logged against this muscle grouping over the window.
   *
   * The heat map's colour scale is driven by this, not by row count: the
   * endpoint used to return DISTINCT (muscleGroup, secondaryMuscles) tuples, so
   * one set of curls and eight sets of bench coloured identically. An entry with
   * no strength sets at all (conditioning work) still counts as 1.
   */
  sets: number;
  /** Tonnage (kg) from completed sets. 0 for bodyweight and conditioning work. */
  volumeKg: number;
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

/** One Monday-aligned week of gym activity. */
export interface WeeklyBucket {
  /** ISO date of the bucket's Monday, YYYY-MM-DD. */
  weekStart: string;
  /** Completed sessions dated in this week. */
  sessions: number;
  /** Tonnage (kg) from completed strength sets — 0 for a bodyweight-only week. */
  volumeKg: number;
  /** Completed strength sets logged this week. */
  completedSets: number;
}

/**
 * Weekly gym activity over a window.
 *
 * Exists because the equivalent client-side rollup read from `GET /sessions`,
 * which caps at 200 rows ordered newest-first: at a year and five sessions a
 * week the *oldest* buckets silently undercounted. Bounded by `weeks` rather
 * than by a row cap, so it stays correct at any range.
 */
export interface WeeklyStatsResponse {
  /** Oldest → newest, one bucket per requested week, gaps filled with zeroes. */
  weeks: WeeklyBucket[];
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
    /** Submissions landed, broken down by type; empty when none were typed. */
    submissionsForByType: Record<string, number>;
    /** Submissions conceded, broken down by type; empty when none were typed. */
    submissionsAgainstByType: Record<string, number>;
    sweeps: number;
    takedowns: number;
    /** Rounds worked per position (rounds-per-position); empty when none logged. */
    positions: Record<string, number>;
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

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagListResponse {
  tags: TagCount[];
}
