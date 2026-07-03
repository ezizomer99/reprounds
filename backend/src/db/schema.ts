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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const activityTypeEnum = pgEnum('activity_type', ['strength', 'conditioning', 'martial_arts']);
export const entryKindEnum    = pgEnum('entry_kind',    ['exercise', 'martial_arts']);
export const disciplineCatEnum = pgEnum('discipline_cat', ['grappling', 'striking', 'mixed']);
export const sessionStatusEnum = pgEnum('session_status', ['planned', 'in_progress', 'completed', 'skipped']);
export const setTypeEnum      = pgEnum('set_type',      ['warmup', 'normal', 'drop', 'failure', 'amrap']);
export const giTypeEnum       = pgEnum('gi_type',       ['gi', 'no_gi']);
export const fightResultEnum  = pgEnum('fight_result',  ['win', 'loss', 'draw']);
export const fightMethodEnum  = pgEnum('fight_method',  ['ko', 'tko', 'submission', 'decision', 'points', 'other']);

export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  googleSub:    text('google_sub').unique(),
  deviceId:     text('device_id').unique(),
  isGuest:      boolean('is_guest').notNull().default(false),
  email:        text('email'),
  // Only set on email/password (credential) accounts. Self-describing hash
  // format: algo$params$salt$hash (see backend/src/lib/password.ts).
  passwordHash: text('password_hash'),
  name:         text('name'),
  avatarUrl:    text('avatar_url'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Enforce email uniqueness for credential accounts only, case-insensitively.
  // Google accounts (password_hash IS NULL) are excluded so they can freely
  // share an email with — or exist independently of — a credential account.
  credentialEmailIdx: uniqueIndex('users_credential_email_idx')
    .on(sql`lower(${t.email})`)
    .where(sql`${t.passwordHash} IS NOT NULL`),
}));

export const exercises = pgTable('exercises', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  userId:             uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name:               text('name').notNull(),
  type:               activityTypeEnum('type').notNull(),
  // Metadata columns — populated by seeding from exercises.json, null on user-created exercises
  sourceId:           text('source_id').unique(),
  category:           text('category'),
  bodyPart:           text('body_part'),
  equipment:          text('equipment'),
  muscleGroup:        text('muscle_group'),
  secondaryMuscles:   text('secondary_muscles').array(),
  target:             text('target'),
  instructions:       text('instructions'),
  instructionSteps:   jsonb('instruction_steps'),
  imageUrl:           text('image_url'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const disciplines = pgTable('disciplines', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  category:    disciplineCatEnum('category').notNull(),
  fieldConfig: jsonb('field_config').notNull().default(sql`'[]'::jsonb`),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One global seed row per name — gives the seeder an ON CONFLICT target so
  // re-seeding can update field_config/category on existing rows instead of
  // only ever inserting missing names.
  globalNameIdx: uniqueIndex('disciplines_global_name_idx')
    .on(t.name)
    .where(sql`${t.userId} IS NULL`),
}));

// Training partners — people the user rolls/spars with, referenced from
// martial-arts rounds. Name only; one row per user-owned partner.
export const partners = pgTable('partners', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index('partners_user_id_idx').on(t.userId),
}));

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
  name:            text('name'),
  date:            date('date').notNull(),
  status:          sessionStatusEnum('status').notNull().default('planned'),
  startedAt:       timestamp('started_at', { withTimezone: true }),
  completedAt:     timestamp('completed_at', { withTimezone: true }),
  durationMinutes: integer('duration_minutes'),
  notes:           text('notes'),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdDateIdx: index('sessions_user_id_date_idx').on(t.userId, t.date),
  // Six hot paths filter on (user_id, status): exercise history/PRs, both
  // stats endpoints, the active-session guard, and GET /sessions?status=.
  userIdStatusIdx: index('sessions_user_id_status_idx').on(t.userId, t.status),
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
  disciplineIdIdx: index('session_entries_discipline_id_idx').on(t.disciplineId),
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
  notes:           text('notes'),
}, (t) => ({
  sessionEntryIdIdx: index('strength_sets_session_entry_id_idx').on(t.sessionEntryId),
}));

// Competition / fight results, tagged to a discipline. Builds the user's
// amateur/pro record (the striking/MMA equivalent of belt progression).
export const fights = pgTable('fights', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // restrict, not cascade: a discipline delete must never silently erase the
  // user's fight record — the route checks and reports instead.
  disciplineId: uuid('discipline_id').notNull().references(() => disciplines.id, { onDelete: 'restrict' }),
  date:         date('date').notNull(),
  opponent:     text('opponent'),
  result:       fightResultEnum('result').notNull(),
  method:       fightMethodEnum('method'),
  round:        integer('round'),
  notes:        text('notes'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index('fights_user_id_idx').on(t.userId),
  disciplineIdIdx: index('fights_discipline_id_idx').on(t.disciplineId),
}));

// Belt / rank promotions, tagged to a discipline. The most recent by date is
// the user's current rank. `rank` is free text (e.g. "Blue belt") so it covers
// BJJ belts, Judo, and other ranked arts; stripes is optional.
export const rankPromotions = pgTable('rank_promotions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // restrict for the same reason as fights: belt history is irreplaceable.
  disciplineId: uuid('discipline_id').notNull().references(() => disciplines.id, { onDelete: 'restrict' }),
  rank:         text('rank').notNull(),
  stripes:      integer('stripes'),
  date:         date('date').notNull(),
  notes:        text('notes'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index('rank_promotions_user_id_idx').on(t.userId),
  disciplineIdIdx: index('rank_promotions_discipline_id_idx').on(t.disciplineId),
}));

// Body-weight log — one entry per weigh-in. Drives weight-cut tracking for
// fight camps; weight stored in kg (display unit handled client-side).
export const weightLogs = pgTable('weight_logs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date:      date('date').notNull(),
  weightKg:  numeric('weight_kg').notNull(),
  notes:     text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdDateIdx: index('weight_logs_user_id_date_idx').on(t.userId, t.date),
}));
