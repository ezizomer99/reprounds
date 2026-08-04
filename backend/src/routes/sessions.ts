import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, max, sql } from 'drizzle-orm';
import { createDb } from '../db';
import {
  disciplines,
  exercises,
  routineItems,
  routines,
  sessionEntries,
  sessionFocuses,
  sessions,
  strengthSets,
  trainingFocuses,
} from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { disciplineVisible, exerciseVisible } from '../lib/ownership';
import {
  DETAILS_MAX_BYTES,
  DURATION_MINUTES_RANGE,
  isEntryKind,
  isGiType,
  isNumberInRange,
  isSessionStatus,
  isSetType,
  MAX_REORDER_IDS,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  ORDER_INDEX_RANGE,
  REPS_RANGE,
  REST_SECONDS_STORED_RANGE,
  RIR_RANGE,
  RPE_RANGE,
  SET_NUMBER_RANGE,
  SUPERSET_GROUP_RANGE,
  WEIGHT_KG_RANGE,
} from '@app/shared';
import {
  isIntInRange,
  isIsoDate,
  isUuid,
  isWithinLength,
  isWithinSerializedSize,
  validateIdList,
} from '../lib/validate';
import type {
  CompleteSessionRequest,
  CreateSessionEntryRequest,
  CreateSessionRequest,
  CreateStrengthSetRequest,
  ReorderSessionEntriesRequest,
  SessionEntryWithSets,
  SessionWithEntries,
  SetSessionFocusesRequest,
  StartSessionRequest,
  StrengthSet,
  UpdateSessionEntryRequest,
  UpdateSessionRequest,
  UpdateStrengthSetRequest,
} from '@app/shared';

type Env = AppEnv;

const sessionRoutes = new Hono<Env>();

sessionRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

const FALLBACK_REST_SECONDS = 120;

// The rest duration an exercise "remembers": the value from the user's most
// recent session entry for that exercise. A remembered 0 ("Off") counts.
async function lastRestSecondsForExercise(
  db: ReturnType<typeof createDb>,
  userId: string,
  exerciseId: string,
): Promise<number | null> {
  const [row] = await db
    .select({ restSeconds: sessionEntries.restSeconds })
    .from(sessionEntries)
    .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessionEntries.exerciseId, exerciseId),
        isNotNull(sessionEntries.restSeconds),
      ),
    )
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(1);
  return row?.restSeconds ?? null;
}

function buildEntryWithSets(
  entry: {
    id: string;
    sessionId: string;
    kind: 'exercise' | 'martial_arts';
    exerciseId: string | null;
    disciplineId: string | null;
    gi: 'gi' | 'no_gi' | null;
    orderIndex: number;
    supersetGroup: number | null;
    restSeconds: number | null;
    details: Record<string, unknown> | null;
    notes: string | null;
  },
  sets: StrengthSet[],
  exerciseName: string | null,
  disciplineName: string | null,
): SessionEntryWithSets {
  return {
    id: entry.id,
    sessionId: entry.sessionId,
    kind: entry.kind,
    exerciseId: entry.exerciseId,
    disciplineId: entry.disciplineId,
    gi: entry.gi,
    orderIndex: entry.orderIndex,
    supersetGroup: entry.supersetGroup,
    restSeconds: entry.restSeconds,
    details: entry.details,
    notes: entry.notes,
    sets,
    exerciseName,
    disciplineName,
  };
}

async function fetchSessionWithEntries(
  db: ReturnType<typeof createDb>,
  sessionId: string,
  userId: string,
): Promise<SessionWithEntries | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (!session) return null;

  const entriesWithNames = await db
    .select({
      id: sessionEntries.id,
      sessionId: sessionEntries.sessionId,
      kind: sessionEntries.kind,
      exerciseId: sessionEntries.exerciseId,
      disciplineId: sessionEntries.disciplineId,
      gi: sessionEntries.gi,
      orderIndex: sessionEntries.orderIndex,
      supersetGroup: sessionEntries.supersetGroup,
      restSeconds: sessionEntries.restSeconds,
      details: sessionEntries.details,
      notes: sessionEntries.notes,
      exerciseName: exercises.name,
      disciplineName: disciplines.name,
    })
    .from(sessionEntries)
    .leftJoin(exercises, eq(sessionEntries.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(sessionEntries.disciplineId, disciplines.id))
    .where(eq(sessionEntries.sessionId, sessionId))
    .orderBy(asc(sessionEntries.orderIndex));

  const entryIds = entriesWithNames.map((e) => e.id);

  let allSets: (typeof strengthSets.$inferSelect)[] = [];
  if (entryIds.length > 0) {
    allSets = await db
      .select()
      .from(strengthSets)
      .where(inArray(strengthSets.sessionEntryId, entryIds))
      .orderBy(asc(strengthSets.setNumber));
  }

  const setsByEntryId = new Map<string, StrengthSet[]>();
  for (const set of allSets) {
    const list = setsByEntryId.get(set.sessionEntryId) ?? [];
    list.push(mapSet(set));
    setsByEntryId.set(set.sessionEntryId, list);
  }

  const focusLinks = await db
    .select({ focusId: sessionFocuses.focusId })
    .from(sessionFocuses)
    .where(eq(sessionFocuses.sessionId, sessionId));

  return {
    id: session.id,
    userId: session.userId,
    routineId: session.routineId,
    name: session.name,
    date: session.date,
    status: session.status,
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    durationMinutes: session.durationMinutes,
    notes: session.notes,
    createdAt: session.createdAt.toISOString(),
    focusIds: focusLinks.map((f) => f.focusId),
    entries: entriesWithNames.map((e) =>
      buildEntryWithSets(
        {
          ...e,
          details: e.details as Record<string, unknown> | null,
        },
        setsByEntryId.get(e.id) ?? [],
        e.exerciseName ?? null,
        e.disciplineName ?? null,
      ),
    ),
  };
}

async function fetchEntryWithSets(
  db: ReturnType<typeof createDb>,
  entryId: string,
): Promise<SessionEntryWithSets | null> {
  const [row] = await db
    .select({
      id: sessionEntries.id,
      sessionId: sessionEntries.sessionId,
      kind: sessionEntries.kind,
      exerciseId: sessionEntries.exerciseId,
      disciplineId: sessionEntries.disciplineId,
      gi: sessionEntries.gi,
      orderIndex: sessionEntries.orderIndex,
      supersetGroup: sessionEntries.supersetGroup,
      restSeconds: sessionEntries.restSeconds,
      details: sessionEntries.details,
      notes: sessionEntries.notes,
      exerciseName: exercises.name,
      disciplineName: disciplines.name,
    })
    .from(sessionEntries)
    .leftJoin(exercises, eq(sessionEntries.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(sessionEntries.disciplineId, disciplines.id))
    .where(eq(sessionEntries.id, entryId))
    .limit(1);

  if (!row) return null;

  const sets = await db
    .select()
    .from(strengthSets)
    .where(eq(strengthSets.sessionEntryId, entryId))
    .orderBy(asc(strengthSets.setNumber));

  return buildEntryWithSets(
    {
      ...row,
      details: row.details as Record<string, unknown> | null,
    },
    sets.map(mapSet),
    row.exerciseName ?? null,
    row.disciplineName ?? null,
  );
}

function mapSet(row: typeof strengthSets.$inferSelect): StrengthSet {
  return {
    id: row.id,
    sessionEntryId: row.sessionEntryId,
    setNumber: row.setNumber,
    setType: row.setType,
    reps: row.reps,
    weight: row.weight !== null ? Number(row.weight) : null,
    rpe: row.rpe !== null ? Number(row.rpe) : null,
    rir: row.rir,
    completed: row.completed,
    notes: row.notes,
  };
}

function validateEntryKind(body: {
  kind: string;
  exerciseId?: string | null;
  disciplineId?: string | null;
}): string | null {
  if (!isEntryKind(body.kind)) {
    return 'kind must be "exercise" or "martial_arts"';
  }
  if (body.kind === 'exercise' && !body.exerciseId) {
    return 'exerciseId is required when kind is exercise';
  }
  if (body.kind === 'martial_arts' && !body.disciplineId) {
    return 'disciplineId is required when kind is martial_arts';
  }
  // Checked before the visibility lookups below run the id through a query —
  // a non-UUID is a uuid cast error (500) rather than a clean 400.
  if (body.exerciseId != null && !isUuid(body.exerciseId)) {
    return 'Invalid exerciseId';
  }
  if (body.disciplineId != null && !isUuid(body.disciplineId)) {
    return 'Invalid disciplineId';
  }
  return null;
}

// Validates the fields a session row carries directly. Shared by create, patch
// and complete so a value one of them rejects can't sneak in via another —
// backdating through /complete previously bypassed every check patch applied.
function validateSessionFields(body: {
  name?: unknown;
  notes?: unknown;
  durationMinutes?: unknown;
}): string | null {
  if (!isWithinLength(body.name, NAME_MAX_LENGTH)) {
    return `name must be ${NAME_MAX_LENGTH} characters or fewer`;
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return `notes must be ${NOTES_MAX_LENGTH} characters or fewer`;
  }
  if (
    body.durationMinutes != null &&
    !isIntInRange(body.durationMinutes, DURATION_MINUTES_RANGE)
  ) {
    return 'Invalid durationMinutes';
  }
  return null;
}

// Validates the optional fields on a session-entry create/update body. These
// went straight to the DB before: a fractional orderIndex or an int4 overflow
// became a 500, and `details` had no ceiling at all.
function validateEntryFields(body: {
  orderIndex?: unknown;
  restSeconds?: unknown;
  supersetGroup?: unknown;
  details?: unknown;
  notes?: unknown;
}): string | null {
  if (body.orderIndex != null && !isIntInRange(body.orderIndex, ORDER_INDEX_RANGE)) {
    return 'Invalid orderIndex';
  }
  // Stored range, not REST_SECONDS_RANGE — 0 is the "Off" preset.
  if (
    body.restSeconds != null &&
    !isIntInRange(body.restSeconds, REST_SECONDS_STORED_RANGE)
  ) {
    return 'Invalid restSeconds';
  }
  if (
    body.supersetGroup != null &&
    !isIntInRange(body.supersetGroup, SUPERSET_GROUP_RANGE)
  ) {
    return 'Invalid supersetGroup';
  }
  if (!isWithinSerializedSize(body.details, DETAILS_MAX_BYTES)) {
    return 'details payload is too large';
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return `notes must be ${NOTES_MAX_LENGTH} characters or fewer`;
  }
  return null;
}

// Validates the enum + numeric fields on a strength-set create/update body so bad
// input is a 400 rather than a DB constraint error (500). Only checks fields that
// are present; presence/required checks live in the handlers.
function validateSetFields(body: {
  setType?: unknown;
  setNumber?: unknown;
  reps?: unknown;
  weight?: unknown;
  rpe?: unknown;
  rir?: unknown;
  notes?: unknown;
}): string | null {
  if (body.setType !== undefined && !isSetType(body.setType)) return 'Invalid setType';
  if (body.setNumber != null && !isIntInRange(body.setNumber, SET_NUMBER_RANGE)) {
    return 'Invalid setNumber';
  }
  if (body.reps != null && !isNumberInRange(body.reps, REPS_RANGE.min, REPS_RANGE.max)) {
    return 'Invalid reps';
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return `notes must be ${NOTES_MAX_LENGTH} characters or fewer`;
  }
  // weight was previously unchecked, so a NaN or a lb/kg mix-up went straight
  // into the column and skewed every volume and 1RM aggregate off it.
  if (
    body.weight != null &&
    !isNumberInRange(body.weight, WEIGHT_KG_RANGE.min, WEIGHT_KG_RANGE.max)
  ) {
    return 'Invalid weight';
  }
  if (body.rpe != null && !isNumberInRange(body.rpe, RPE_RANGE.min, RPE_RANGE.max)) {
    return 'Invalid rpe';
  }
  if (body.rir != null && !isNumberInRange(body.rir, RIR_RANGE.min, RIR_RANGE.max)) {
    return 'Invalid rir';
  }
  return null;
}

// GET /sessions
sessionRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const status = c.req.query('status');
  const from = c.req.query('from');
  const to = c.req.query('to');
  // parseInt returns NaN for a junk ?limit=, and Math.min(NaN, 200) is NaN,
  // which reaches Drizzle's .limit() as an invalid bind param. Fall back to the
  // default instead.
  const requestedLimit = parseInt(c.req.query('limit') ?? '', 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 200)
    : 50;

  if (status !== undefined && !isSessionStatus(status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }
  if (from !== undefined && !isIsoDate(from)) {
    return c.json({ error: 'from must be YYYY-MM-DD' }, 400);
  }
  if (to !== undefined && !isIsoDate(to)) {
    return c.json({ error: 'to must be YYYY-MM-DD' }, 400);
  }

  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        status ? eq(sessions.status, status) : undefined,
        from ? gte(sessions.date, from) : undefined,
        to ? lte(sessions.date, to) : undefined,
      ),
    )
    .orderBy(desc(sessions.date), desc(sessions.createdAt))
    .limit(limit);

  const ids = rows.map((r) => r.id);
  const kindRows = ids.length
    ? await db
        .selectDistinct({ sessionId: sessionEntries.sessionId, kind: sessionEntries.kind })
        .from(sessionEntries)
        .where(inArray(sessionEntries.sessionId, ids))
    : [];

  const kindMap = new Map<string, Set<'exercise' | 'martial_arts'>>();
  for (const r of kindRows) {
    let set = kindMap.get(r.sessionId);
    if (!set) {
      set = new Set();
      kindMap.set(r.sessionId, set);
    }
    set.add(r.kind);
  }

  // Per-session volume of completed sets, so the calendar's day sheet can show
  // "45 min · 1,618 kg" without fetching every session's entries. SUM skips
  // NULL products, matching shared/src/calculators/volume.ts, which counts a
  // null weight or null reps as zero.
  const volumeRows = ids.length
    ? await db
        .select({
          sessionId: sessionEntries.sessionId,
          volumeKg: sql<string>`COALESCE(SUM(${strengthSets.weight} * ${strengthSets.reps}), 0)`,
          completedSets: sql<number>`COUNT(*)::int`,
        })
        .from(strengthSets)
        .innerJoin(sessionEntries, eq(strengthSets.sessionEntryId, sessionEntries.id))
        .where(and(inArray(sessionEntries.sessionId, ids), eq(strengthSets.completed, true)))
        .groupBy(sessionEntries.sessionId)
    : [];

  // `weight` is numeric, so both it and SUM() come back as strings — these must
  // be converted or the JSON ships a string the client then formats as garbage.
  const volumeMap = new Map(
    volumeRows.map((r) => [
      r.sessionId,
      { volumeKg: Number(r.volumeKg), completedSets: Number(r.completedSets) },
    ]),
  );

  const mapped = rows.map((s) => ({
    id: s.id,
    userId: s.userId,
    routineId: s.routineId ?? null,
    name: s.name ?? null,
    date: s.date,
    status: s.status,
    startedAt: s.startedAt?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
    durationMinutes: s.durationMinutes ?? null,
    notes: s.notes ?? null,
    createdAt: s.createdAt.toISOString(),
    kinds: [...(kindMap.get(s.id) ?? [])],
    // Sessions with no completed sets never appear in the aggregate.
    volumeKg: volumeMap.get(s.id)?.volumeKg ?? 0,
    completedSets: volumeMap.get(s.id)?.completedSets ?? 0,
  }));

  return c.json({ sessions: mapped });
});

// GET /sessions/:id
sessionRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const session = await fetchSessionWithEntries(db, id, userId);
  if (!session) return c.json({ error: 'Not found' }, 404);

  return c.json({ session });
});

// POST /sessions
sessionRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  let body: CreateSessionRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Create validated only that a date was present, while patch and complete
  // both checked the format — so the one path that always sets a date was the
  // one that let a malformed one through to the date column as a 500.
  if (!isIsoDate(body.date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }

  const sessionErr = validateSessionFields(body);
  if (sessionErr) return c.json({ error: sessionErr }, 400);

  if (body.routineId !== undefined && body.routineId !== null && !isUuid(body.routineId)) {
    return c.json({ error: 'Invalid routineId' }, 400);
  }

  if (body.kind !== undefined && body.kind !== 'exercise' && body.kind !== 'martial_arts') {
    return c.json({ error: 'kind must be exercise or martial_arts' }, 400);
  }

  // Only 'planned' may be requested explicitly — a scheduled one-off workout
  // that starts later via POST /sessions/:id/start. Every other lifecycle
  // state is server-assigned.
  if (body.status !== undefined && body.status !== 'planned') {
    return c.json({ error: 'status must be planned or omitted' }, 400);
  }
  const isPlanned = body.status === 'planned';

  // The routine the session is created from must belong to the caller —
  // otherwise the prefill below would read (and echo back) another user's
  // routine structure from a leaked UUID.
  let routineSeedItems: (typeof routineItems.$inferSelect)[] = [];
  if (body.routineId) {
    const [ownedRoutine] = await db
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.id, body.routineId), eq(routines.userId, userId)))
      .limit(1);
    if (!ownedRoutine) {
      return c.json({ error: 'Not found' }, 404);
    }

    const allItems = await db
      .select()
      .from(routineItems)
      .where(eq(routineItems.routineId, body.routineId))
      .orderBy(asc(routineItems.orderIndex));

    // A session is either weightlifting or martial arts — never both. Routines
    // may hold mixed-kind items, so a mixed routine is started one part at a
    // time: the caller passes `kind` to pick which part to seed. Without a
    // `kind`, a mixed routine is rejected rather than seeding an invalid
    // combined session; single-kind routines seed as-is.
    const routineKinds = [...new Set(allItems.map((i) => i.kind))];
    if (routineKinds.length > 1 && !body.kind) {
      return c.json({ error: 'mixed_routine_kind_required', kinds: routineKinds }, 400);
    }
    routineSeedItems = body.kind ? allItems.filter((i) => i.kind === body.kind) : allItems;
  }

  // Scheduling a future workout must not conflict with a live one — only
  // starting-now sessions are subject to the single-active-session rule.
  if (!isPlanned) {
    const [existing] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.status, 'in_progress')))
      .limit(1);

    if (existing) {
      return c.json({ error: 'active_session_exists', sessionId: existing.id }, 409);
    }
  }

  // Seed rest durations for routine exercises without an explicit routine
  // default: the exercise's remembered value from the user's last session.
  // Looked up before the transaction to keep it short.
  const restHistory = new Map<string, number | null>();
  for (const item of routineSeedItems) {
    if (
      item.kind === 'exercise' &&
      item.defaultRestSeconds == null &&
      item.exerciseId &&
      !restHistory.has(item.exerciseId)
    ) {
      restHistory.set(
        item.exerciseId,
        await lastRestSecondsForExercise(db, userId, item.exerciseId),
      );
    }
  }

  const newSession = await db.transaction(async (tx) => {
    const [sess] = await tx
      .insert(sessions)
      .values({
        userId,
        routineId: body.routineId ?? null,
        date: body.date,
        status: isPlanned ? 'planned' : 'in_progress',
        startedAt: isPlanned ? null : new Date(),
        notes: body.notes ?? null,
      })
      .returning();

    if (routineSeedItems.length > 0) {
      for (const item of routineSeedItems) {
        const [entry] = await tx
          .insert(sessionEntries)
          .values({
            sessionId: sess.id,
            kind: item.kind,
            exerciseId: item.exerciseId ?? null,
            disciplineId: item.disciplineId ?? null,
            orderIndex: item.orderIndex,
            supersetGroup: item.supersetGroup ?? null,
            restSeconds:
              item.kind === 'exercise'
                ? item.defaultRestSeconds ??
                  (item.exerciseId ? restHistory.get(item.exerciseId) : null) ??
                  FALLBACK_REST_SECONDS
                : null,
          })
          .returning();

        // Pre-fill planned sets for exercises that have a target plan.
        if (item.kind === 'exercise' && item.target) {
          const t = item.target as {
            sets?: Array<{
              setType?: 'warmup' | 'normal' | 'drop' | 'failure' | 'amrap';
              reps?: number | null;
              weight?: number | null;
              durationSeconds?: number | null;
            }>;
          };
          const planned = Array.isArray(t.sets) ? t.sets.slice(0, 30) : [];
          if (planned.length > 0) {
            await tx.insert(strengthSets).values(
              planned.map((p, i) => ({
                sessionEntryId: entry.id,
                setNumber: i + 1,
                setType: p.setType ?? 'normal',
                reps: p.durationSeconds != null ? p.durationSeconds : (p.reps ?? null),
                weight: p.weight != null ? String(p.weight) : null,
                completed: false,
              })),
            );
          }
        }
      }
    }

    return sess;
  });

  const session = await fetchSessionWithEntries(db, newSession.id, userId);
  return c.json({ session }, 201);
});

// PATCH /sessions/:id
sessionRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Not found' }, 404);

  let body: UpdateSessionRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const sessionErr = validateSessionFields(body);
  if (sessionErr) return c.json({ error: sessionErr }, 400);

  const updates: Partial<typeof sessions.$inferInsert> = {};
  if ('name' in body) updates.name = body.name ?? null;
  if ('notes' in body) updates.notes = body.notes ?? null;
  if ('durationMinutes' in body) updates.durationMinutes = body.durationMinutes ?? null;
  if ('date' in body) {
    if (!isIsoDate(body.date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
    updates.date = body.date;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(sessions)
      .set(updates)
      .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
  }

  const session = await fetchSessionWithEntries(db, id, userId);
  return c.json({ session });
});

// DELETE /sessions/:id
sessionRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Not found' }, 404);

  await db
    .delete(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

  return c.json({ success: true });
});

// POST /sessions/:id/start — flip a planned (scheduled) session live. The
// single-active-session rule is enforced here, mirroring POST /sessions, so
// the client's existing 409 conflict handling works for both paths.
sessionRoutes.post('/:id/start', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const [existing] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);
  if (existing.status !== 'planned') return c.json({ error: 'not_planned' }, 409);

  const [active] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, 'in_progress')))
    .limit(1);

  if (active) {
    return c.json({ error: 'active_session_exists', sessionId: active.id }, 409);
  }

  let body: StartSessionRequest = {};
  try {
    body = await c.req.json();
  } catch {
    // body is optional
  }

  const updates: Partial<typeof sessions.$inferInsert> = {
    status: 'in_progress',
    startedAt: new Date(),
  };
  // Client-local today: an overdue planned session snaps to the day it
  // actually ran.
  if (isIsoDate(body.date)) updates.date = body.date;

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

  const session = await fetchSessionWithEntries(db, id, userId);
  return c.json({ session });
});

// POST /sessions/:id/complete
sessionRoutes.post('/:id/complete', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const [existing] = await db
    .select({ id: sessions.id, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  // Only a live session can be completed. Without this, a double-tap on Finish
  // over a slow connection re-stamped completedAt on an already-finished
  // session (skewing duration analytics and the notes timeline), and a planned
  // session could jump straight to completed with startedAt still null.
  // Mirrors the not_planned guard on /start so the client sees the same shape.
  if (existing.status !== 'in_progress') {
    return c.json({ error: 'not_in_progress', status: existing.status }, 409);
  }

  let body: CompleteSessionRequest = {};
  try {
    body = await c.req.json();
  } catch {
    // body is optional
  }

  const sessionErr = validateSessionFields(body);
  if (sessionErr) return c.json({ error: sessionErr }, 400);

  const updates: Partial<typeof sessions.$inferInsert> = {
    status: 'completed',
    completedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name ?? null;
  if (body.durationMinutes !== undefined) updates.durationMinutes = body.durationMinutes ?? null;
  if (body.notes !== undefined) updates.notes = body.notes ?? null;
  // Backdating a finished session is how a past workout gets its real date —
  // validate it like every other date the API accepts.
  if (body.date !== undefined) {
    if (!isIsoDate(body.date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
    updates.date = body.date;
  }

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

  const session = await fetchSessionWithEntries(db, id, userId);
  return c.json({ session });
});

// PUT /sessions/:id/focuses — replace the set of training focuses ticked as
// worked on during this session. Replace-semantics (delete + re-insert), like
// the entries reorder endpoint.
sessionRoutes.put('/:id/focuses', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const [existing] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  let body: SetSessionFocusesRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Shape-check before the ids reach the inArray lookup below, where a
  // non-UUID element would be a uuid cast error rather than a 400.
  if (!Array.isArray(body.focusIds) || !body.focusIds.every(isUuid)) {
    return c.json({ error: 'focusIds must be an array of focus IDs' }, 400);
  }
  if (body.focusIds.length > MAX_REORDER_IDS) {
    return c.json({ error: 'focusIds array too large' }, 400);
  }

  // Dedupe and, if any provided, verify every focus belongs to the caller —
  // reject the whole request rather than silently dropping foreign IDs.
  const focusIds = [...new Set(body.focusIds)];
  if (focusIds.length > 0) {
    const owned = await db
      .select({ id: trainingFocuses.id })
      .from(trainingFocuses)
      .where(and(eq(trainingFocuses.userId, userId), inArray(trainingFocuses.id, focusIds)));
    if (owned.length !== focusIds.length) {
      return c.json({ error: 'One or more focusIds are invalid' }, 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(sessionFocuses).where(eq(sessionFocuses.sessionId, id));
    if (focusIds.length > 0) {
      await tx
        .insert(sessionFocuses)
        .values(focusIds.map((focusId) => ({ sessionId: id, focusId })));
    }
  });

  return c.json({ focusIds });
});

// POST /sessions/:id/entries
sessionRoutes.post('/:id/entries', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  let body: CreateSessionEntryRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const kindErr = validateEntryKind(body);
  if (kindErr) return c.json({ error: kindErr }, 400);
  if (body.gi != null && !isGiType(body.gi)) {
    return c.json({ error: 'Invalid gi' }, 400);
  }
  const fieldErr = validateEntryFields(body);
  if (fieldErr) return c.json({ error: fieldErr }, 400);

  // Guard against attaching another user's private exercise/discipline (IDOR).
  if (!(await exerciseVisible(db, body.exerciseId, userId))) {
    return c.json({ error: 'Exercise not found' }, 404);
  }
  if (!(await disciplineVisible(db, body.disciplineId, userId))) {
    return c.json({ error: 'Discipline not found' }, 404);
  }

  // A session is either weightlifting or martial arts — never both. Reject an
  // entry whose kind disagrees with entries already in the session.
  const [existingKind] = await db
    .select({ kind: sessionEntries.kind })
    .from(sessionEntries)
    .where(eq(sessionEntries.sessionId, sessionId))
    .limit(1);

  if (existingKind && existingKind.kind !== body.kind) {
    return c.json(
      { error: 'A session cannot mix weightlifting and martial arts entries.' },
      400,
    );
  }

  const [maxRow] = await db
    .select({ maxOrder: max(sessionEntries.orderIndex) })
    .from(sessionEntries)
    .where(eq(sessionEntries.sessionId, sessionId));

  const nextIndex = body.orderIndex ?? (maxRow?.maxOrder ?? -1) + 1;

  // Exercise entries "remember" their rest duration: when the client doesn't
  // send one, seed from the user's last session with this exercise.
  let restSeconds: number | null = body.restSeconds ?? null;
  if (body.kind === 'exercise' && body.restSeconds === undefined && body.exerciseId) {
    restSeconds =
      (await lastRestSecondsForExercise(db, userId, body.exerciseId)) ??
      FALLBACK_REST_SECONDS;
  }

  const [inserted] = await db
    .insert(sessionEntries)
    .values({
      sessionId,
      kind: body.kind,
      exerciseId: body.exerciseId ?? null,
      disciplineId: body.disciplineId ?? null,
      gi: body.gi ?? null,
      orderIndex: nextIndex,
      restSeconds,
      details: body.details ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  const entry = await fetchEntryWithSets(db, inserted.id);
  return c.json({ entry }, 201);
});

// PUT /sessions/:id/entries/order — full new ordering of the session's
// entries. Mirrors PUT /routines/:id/items/order.
sessionRoutes.put('/:id/entries/order', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  let body: ReorderSessionEntriesRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  // Matches the guards the routines reorder endpoints have carried since they
  // were written: each id costs a round-trip inside the transaction, and a
  // non-UUID element reaches Postgres as a cast error.
  const orderErr = validateIdList(body.order, MAX_REORDER_IDS, 'order', 'entry ID');
  if (orderErr) return c.json({ error: orderErr }, 400);

  await db.transaction(async (tx) => {
    for (let i = 0; i < body.order.length; i++) {
      await tx
        .update(sessionEntries)
        .set({ orderIndex: i })
        .where(
          and(
            eq(sessionEntries.id, body.order[i]),
            eq(sessionEntries.sessionId, sessionId),
          ),
        );
    }
  });

  return c.json({ success: true });
});

// PATCH /sessions/:id/entries/:entryId
sessionRoutes.patch('/:id/entries/:entryId', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const entryId = c.req.param('entryId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  const entryCheck = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(and(eq(sessionEntries.id, entryId), eq(sessionEntries.sessionId, sessionId)))
    .limit(1);

  if (entryCheck.length === 0) return c.json({ error: 'Entry not found' }, 404);

  let body: UpdateSessionEntryRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (body.gi != null && !isGiType(body.gi)) {
    return c.json({ error: 'Invalid gi' }, 400);
  }
  const fieldErr = validateEntryFields(body);
  if (fieldErr) return c.json({ error: fieldErr }, 400);

  const updates: Partial<typeof sessionEntries.$inferInsert> = {};
  if ('gi' in body) updates.gi = body.gi ?? null;
  if ('restSeconds' in body) updates.restSeconds = body.restSeconds ?? null;
  if ('details' in body) updates.details = body.details ?? null;
  if ('notes' in body) updates.notes = body.notes ?? null;
  if ('supersetGroup' in body) updates.supersetGroup = body.supersetGroup ?? null;

  if ('exerciseId' in body && body.exerciseId !== undefined) {
    if (body.exerciseId === null) {
      return c.json({ error: 'exerciseId cannot be null for exercise entries' }, 400);
    }
    if (!isUuid(body.exerciseId)) {
      return c.json({ error: 'Invalid exerciseId' }, 400);
    }
    // Re-fetch the entry kind — only exercise-kind entries may swap their exercise.
    const [kindRow] = await db
      .select({ kind: sessionEntries.kind })
      .from(sessionEntries)
      .where(eq(sessionEntries.id, entryId))
      .limit(1);
    if (kindRow?.kind !== 'exercise') {
      return c.json({ error: 'exerciseId can only be updated on exercise entries' }, 400);
    }
    // Validate the exercise is visible to this user (global seed or user-owned).
    if (!(await exerciseVisible(db, body.exerciseId, userId))) {
      return c.json({ error: 'Exercise not found' }, 404);
    }
    updates.exerciseId = body.exerciseId;
    // Swapping the exercise reseeds the rest duration from the new exercise's
    // history, unless the client set one explicitly in the same request.
    if (!('restSeconds' in body)) {
      updates.restSeconds =
        (await lastRestSecondsForExercise(db, userId, body.exerciseId)) ??
        FALLBACK_REST_SECONDS;
    }
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(sessionEntries)
      .set(updates)
      .where(eq(sessionEntries.id, entryId));
  }

  const entry = await fetchEntryWithSets(db, entryId);
  return c.json({ entry });
});

// DELETE /sessions/:id/entries/:entryId
sessionRoutes.delete('/:id/entries/:entryId', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const entryId = c.req.param('entryId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  const entryCheck = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(and(eq(sessionEntries.id, entryId), eq(sessionEntries.sessionId, sessionId)))
    .limit(1);

  if (entryCheck.length === 0) return c.json({ error: 'Entry not found' }, 404);

  // Cascade-on-delete in the schema removes associated strength_sets automatically.
  await db
    .delete(sessionEntries)
    .where(eq(sessionEntries.id, entryId));

  return c.json({ success: true });
});

// POST /sessions/:id/entries/:entryId/sets
sessionRoutes.post('/:id/entries/:entryId/sets', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const entryId = c.req.param('entryId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  const entryCheck = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(and(eq(sessionEntries.id, entryId), eq(sessionEntries.sessionId, sessionId)))
    .limit(1);

  if (entryCheck.length === 0) return c.json({ error: 'Entry not found' }, 404);

  let body: CreateStrengthSetRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (body.setNumber === undefined || body.setNumber === null) {
    return c.json({ error: 'setNumber is required' }, 400);
  }
  const setErr = validateSetFields(body);
  if (setErr) return c.json({ error: setErr }, 400);

  const [inserted] = await db
    .insert(strengthSets)
    .values({
      sessionEntryId: entryId,
      setNumber: body.setNumber,
      setType: body.setType ?? 'normal',
      reps: body.reps ?? null,
      weight: body.weight !== undefined && body.weight !== null ? String(body.weight) : null,
      rpe: body.rpe !== undefined && body.rpe !== null ? String(body.rpe) : null,
      rir: body.rir ?? null,
      completed: body.completed ?? false,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ set: mapSet(inserted) }, 201);
});

// PATCH /sessions/:id/entries/:entryId/sets/:setId
sessionRoutes.patch('/:id/entries/:entryId/sets/:setId', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const entryId = c.req.param('entryId');
  const setId = c.req.param('setId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  const entryCheck = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(and(eq(sessionEntries.id, entryId), eq(sessionEntries.sessionId, sessionId)))
    .limit(1);

  if (entryCheck.length === 0) return c.json({ error: 'Entry not found' }, 404);

  const setCheck = await db
    .select({ id: strengthSets.id })
    .from(strengthSets)
    .where(and(eq(strengthSets.id, setId), eq(strengthSets.sessionEntryId, entryId)))
    .limit(1);

  if (setCheck.length === 0) return c.json({ error: 'Set not found' }, 404);

  let body: UpdateStrengthSetRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const setErr = validateSetFields(body);
  if (setErr) return c.json({ error: setErr }, 400);

  const updates: Partial<typeof strengthSets.$inferInsert> = {};
  if (body.setType !== undefined) updates.setType = body.setType;
  if ('reps' in body) updates.reps = body.reps ?? null;
  if ('weight' in body) {
    updates.weight = body.weight !== undefined && body.weight !== null ? String(body.weight) : null;
  }
  if ('rpe' in body) {
    updates.rpe = body.rpe !== undefined && body.rpe !== null ? String(body.rpe) : null;
  }
  if ('rir' in body) updates.rir = body.rir ?? null;
  if (body.completed !== undefined) updates.completed = body.completed;
  if ('notes' in body) updates.notes = body.notes ?? null;

  if (Object.keys(updates).length > 0) {
    await db
      .update(strengthSets)
      .set(updates)
      .where(eq(strengthSets.id, setId));
  }

  const [updated] = await db
    .select()
    .from(strengthSets)
    .where(eq(strengthSets.id, setId))
    .limit(1);

  return c.json({ set: mapSet(updated) });
});

// DELETE /sessions/:id/entries/:entryId/sets/:setId
sessionRoutes.delete('/:id/entries/:entryId/sets/:setId', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const entryId = c.req.param('entryId');
  const setId = c.req.param('setId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) return c.json({ error: 'Not found' }, 404);

  const entryCheck = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(and(eq(sessionEntries.id, entryId), eq(sessionEntries.sessionId, sessionId)))
    .limit(1);

  if (entryCheck.length === 0) return c.json({ error: 'Entry not found' }, 404);

  const setCheck = await db
    .select({ id: strengthSets.id })
    .from(strengthSets)
    .where(and(eq(strengthSets.id, setId), eq(strengthSets.sessionEntryId, entryId)))
    .limit(1);

  if (setCheck.length === 0) return c.json({ error: 'Set not found' }, 404);

  await db
    .delete(strengthSets)
    .where(eq(strengthSets.id, setId));

  return c.json({ success: true });
});

export { sessionRoutes };
