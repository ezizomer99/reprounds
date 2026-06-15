import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const activityTypeEnum = pgEnum('activity_type', ['strength', 'conditioning', 'martial_arts']);
export const entryKindEnum    = pgEnum('entry_kind',    ['exercise', 'martial_arts']);
export const disciplineCatEnum = pgEnum('discipline_cat', ['grappling', 'striking', 'mixed']);
export const sessionStatusEnum = pgEnum('session_status', ['planned', 'in_progress', 'completed', 'skipped']);
export const setTypeEnum      = pgEnum('set_type',      ['warmup', 'normal', 'drop', 'failure', 'amrap']);
export const giTypeEnum       = pgEnum('gi_type',       ['gi', 'no_gi']);

export const users = pgTable('users', {
  id:         uuid('id').primaryKey().defaultRandom(),
  googleSub:  text('google_sub').unique().notNull(),
  email:      text('email').notNull(),
  name:       text('name'),
  avatarUrl:  text('avatar_url'),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable('exercises', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  userId:             uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name:               text('name').notNull(),
  type:               activityTypeEnum('type').notNull(),
  defaultRestSeconds: integer('default_rest_seconds'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const disciplines = pgTable('disciplines', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  category:    disciplineCatEnum('category').notNull(),
  fieldConfig: jsonb('field_config').notNull().default(sql`'[]'::jsonb`),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// A routine is a workout definition (its items) plus an optional recurring
// schedule. rrule === null means the routine is unscheduled (run ad-hoc);
// when rrule is set, the routine projects onto the calendar.
export const routines = pgTable('routines', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  dayLabel:  text('day_label'),
  notes:     text('notes'),
  rrule:     text('rrule'),
  startDate: date('start_date'),
  endDate:   date('end_date'),
  timeOfDay: time('time_of_day'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index('routines_user_id_idx').on(t.userId),
}));

export const routineItems = pgTable('routine_items', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  routineId:          uuid('routine_id').notNull().references(() => routines.id, { onDelete: 'cascade' }),
  kind:               entryKindEnum('kind').notNull(),
  exerciseId:         uuid('exercise_id').references(() => exercises.id),
  disciplineId:       uuid('discipline_id').references(() => disciplines.id),
  orderIndex:         integer('order_index').notNull().default(0),
  supersetGroup:      integer('superset_group'),
  defaultRestSeconds: integer('default_rest_seconds'),
  target:             jsonb('target'),
}, (t) => ({
  kindCheck: check(
    'routine_items_kind_check',
    sql`(${t.kind} = 'exercise' AND ${t.exerciseId} IS NOT NULL AND ${t.disciplineId} IS NULL)
     OR (${t.kind} = 'martial_arts' AND ${t.disciplineId} IS NOT NULL AND ${t.exerciseId} IS NULL)`,
  ),
}));

export const sessions = pgTable('sessions', {
  id:              uuid('id').primaryKey().defaultRandom(),
  userId:          uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  routineId:       uuid('routine_id').references(() => routines.id),
  date:            date('date').notNull(),
  status:          sessionStatusEnum('status').notNull().default('planned'),
  startedAt:       timestamp('started_at', { withTimezone: true }),
  completedAt:     timestamp('completed_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  notes:           text('notes'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdDateIdx: index('sessions_user_id_date_idx').on(t.userId, t.date),
}));

export const sessionEntries = pgTable('session_entries', {
  id:            uuid('id').primaryKey().defaultRandom(),
  sessionId:     uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  kind:          entryKindEnum('kind').notNull(),
  exerciseId:    uuid('exercise_id').references(() => exercises.id),
  disciplineId:  uuid('discipline_id').references(() => disciplines.id),
  gi:            giTypeEnum('gi'),
  orderIndex:    integer('order_index').notNull().default(0),
  supersetGroup: integer('superset_group'),
  restSeconds:   integer('rest_seconds'),
  details:       jsonb('details'),
  notes:         text('notes'),
}, (t) => ({
  sessionIdIdx: index('session_entries_session_id_idx').on(t.sessionId),
  exerciseIdIdx: index('session_entries_exercise_id_idx').on(t.exerciseId),
  kindCheck: check(
    'session_entries_kind_check',
    sql`(${t.kind} = 'exercise' AND ${t.exerciseId} IS NOT NULL AND ${t.disciplineId} IS NULL)
     OR (${t.kind} = 'martial_arts' AND ${t.disciplineId} IS NOT NULL AND ${t.exerciseId} IS NULL)`,
  ),
}));

export const strengthSets = pgTable('strength_sets', {
  id:              uuid('id').primaryKey().defaultRandom(),
  sessionEntryId:  uuid('session_entry_id').notNull().references(() => sessionEntries.id, { onDelete: 'cascade' }),
  setNumber:       integer('set_number').notNull(),
  setType:         setTypeEnum('set_type').notNull().default('normal'),
  reps:            integer('reps'),
  weight:          numeric('weight'),
  rpe:             numeric('rpe'),
  rir:             integer('rir'),
  completed:       boolean('completed').notNull().default(false),
}, (t) => ({
  sessionEntryIdIdx: index('strength_sets_session_entry_id_idx').on(t.sessionEntryId),
}));
