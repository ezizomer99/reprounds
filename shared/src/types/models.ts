import type { ActivityType, DisciplineCat, EntryKind, GiType, SessionStatus, SetType } from './enums';
import type { FieldConfig } from './fieldConfig';

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Exercise {
  id: string;
  userId: string | null;
  name: string;
  type: Exclude<ActivityType, 'martial_arts'>;
  defaultRestSeconds: number | null;
  createdAt: string;
}

export interface Discipline {
  id: string;
  userId: string | null;
  name: string;
  category: DisciplineCat;
  fieldConfig: FieldConfig;
  createdAt: string;
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  dayLabel: string | null;
  notes: string | null;
  createdAt: string;
  items?: TemplateItem[];
}

export interface TemplateItem {
  id: string;
  templateId: string;
  kind: EntryKind;
  exerciseId: string | null;
  disciplineId: string | null;
  orderIndex: number;
  supersetGroup: number | null;
  defaultRestSeconds: number | null;
  target: Record<string, unknown> | null;
}

export interface ScheduleRule {
  id: string;
  userId: string;
  templateId: string;
  rrule: string;
  startDate: string;
  endDate: string | null;
  timeOfDay: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  templateId: string | null;
  scheduleRuleId: string | null;
  date: string;
  status: SessionStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
  entries?: SessionEntry[];
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
  | { kind: 'virtual'; date: string; scheduleRuleId: string; templateId: string };

export interface ExerciseListResponse {
  exercises: Exercise[];
}

export interface DisciplineListResponse {
  disciplines: Discipline[];
}

export interface CreateExerciseRequest {
  name: string;
  type: Exclude<ActivityType, 'martial_arts'>;
  defaultRestSeconds?: number | null;
}

export interface UpdateExerciseRequest {
  name?: string;
  type?: Exclude<ActivityType, 'martial_arts'>;
  defaultRestSeconds?: number | null;
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

export interface TemplateItemWithDetails extends TemplateItem {
  exerciseName: string | null;
  disciplineName: string | null;
}

export interface TemplateWithItems extends Template {
  items: TemplateItemWithDetails[];
}

export interface TemplateListResponse {
  templates: TemplateWithItems[];
}

export interface CreateTemplateItemRequest {
  kind: EntryKind;
  exerciseId?: string | null;
  disciplineId?: string | null;
  orderIndex?: number;
  supersetGroup?: number | null;
  defaultRestSeconds?: number | null;
  target?: Record<string, unknown> | null;
}

export interface CreateTemplateRequest {
  name: string;
  dayLabel?: string | null;
  notes?: string | null;
  items?: CreateTemplateItemRequest[];
}

export interface UpdateTemplateRequest {
  name?: string;
  dayLabel?: string | null;
  notes?: string | null;
}

export type AddTemplateItemRequest = CreateTemplateItemRequest;

export interface UpdateTemplateItemRequest {
  orderIndex?: number;
  supersetGroup?: number | null;
  defaultRestSeconds?: number | null;
  target?: Record<string, unknown> | null;
}

export interface ReorderTemplateItemsRequest {
  order: string[];
}

// ---- Phase 4: Session Logging ----

export interface CreateSessionRequest {
  templateId?: string | null;
  scheduleRuleId?: string | null;
  date: string; // ISO date YYYY-MM-DD
  notes?: string | null;
}

export interface UpdateSessionRequest {
  notes?: string | null;
  durationMinutes?: number | null;
}

export interface CompleteSessionRequest {
  durationMinutes?: number | null;
  notes?: string | null;
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

export interface CreateScheduleRuleRequest {
  templateId: string;
  rrule: string;
  startDate: string;
  endDate?: string | null;
  timeOfDay?: string | null;
}

export interface UpdateScheduleRuleRequest {
  templateId?: string;
  rrule?: string;
  startDate?: string;
  endDate?: string | null;
  timeOfDay?: string | null;
}

export interface ScheduleRuleListResponse {
  rules: ScheduleRule[];
}

export interface CalendarResponse {
  items: CalendarItem[];
}
