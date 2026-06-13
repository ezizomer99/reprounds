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
