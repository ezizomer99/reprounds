import type { ActivityType, DisciplineCat, EntryKind, FightMethod, FightResult, GiType, SessionStatus, SetType } from './enums';
import type { FieldConfig } from './fieldConfig';

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
}

export interface GuestAuthRequest {
  deviceId: string;
}

export interface GoogleAuthRequest {
  idToken: string;
  guestUserId?: string | null;
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
}

export interface CreateStrengthSetRequest {
  setNumber: number;
  setType?: SetType;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  rir?: number | null;
  completed?: boolean;
}

export interface UpdateStrengthSetRequest {
  setType?: SetType;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  rir?: number | null;
  completed?: boolean;
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

// ---- Phase 5: Calendar + Recurrence ----

export interface CalendarResponse {
  items: CalendarItem[];
}
