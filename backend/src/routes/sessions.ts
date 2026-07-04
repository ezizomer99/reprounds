import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull, max, or } from 'drizzle-orm';
import { createDb } from '../db';
import {
  disciplines,
  exercises,
  routineItems,
  routines,
  sessionEntries,
  sessions,
  strengthSets,
} from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CompleteSessionRequest,
  CreateSessionEntryRequest,
  CreateSessionRequest,
  CreateStrengthSetRequest,
  SessionEntryWithSets,
  SessionWithEntries,
  StrengthSet,
  UpdateSessionEntryRequest,
  UpdateSessionRequest,
  UpdateStrengthSetRequest,
} from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
  };
  Variables: {
    userId: string;
  };
};

const sessionRoutes = new Hono<Env>();

sessionRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
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
  if (body.kind === 'exercise' && !body.exerciseId) {
    return 'exerciseId is required when kind is exercise';
  }
  if (body.kind === 'martial_arts' && !body.disciplineId) {
    return 'disciplineId is required when kind is martial_arts';
  }
  return null;
}

// GET /sessions
sessionRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);

  const rows = await db
    .select()
    .from(sessions)
    .where(
      status
        ? and(eq(sessions.userId, userId), eq(sessions.status, status as 'planned' | 'in_progress' | 'completed' | 'skipped'))
        : eq(sessions.userId, userId),
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

  if (!body.date) {
    return c.json({ error: 'date is required' }, 400);
  }

  // The routine the session is created from must belong to the caller —
  // otherwise the prefill below would read (and echo back) another user's
  // routine structure from a leaked UUID.
  if (body.routineId) {
    const [ownedRoutine] = await db
      .select({ id: routines.id })
      .from(routines)
      .where(and(eq(routines.id, body.routineId), eq(routines.userId, userId)))
      .limit(1);
    if (!ownedRoutine) {
      return c.json({ error: 'Not found' }, 404);
    }
  }

  const [existing] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.status, 'in_progress')))
    .limit(1);

  if (existing) {
    return c.json({ error: 'active_session_exists', sessionId: existing.id }, 409);
  }

  const newSession = await db.transaction(async (tx) => {
    const [sess] = await tx
      .insert(sessions)
      .values({
        userId,
        routineId: body.routineId ?? null,
        date: body.date,
        status: 'in_progress',
        startedAt: new Date(),
        notes: body.notes ?? null,
      })
      .returning();

    if (body.routineId) {
      const items = await tx
        .select()
        .from(routineItems)
        .where(eq(routineItems.routineId, body.routineId))
        .orderBy(asc(routineItems.orderIndex));

      for (const item of items) {
        const [entry] = await tx
          .insert(sessionEntries)
          .values({
            sessionId: sess.id,
            kind: item.kind,
            exerciseId: item.exerciseId ?? null,
            disciplineId: item.disciplineId ?? null,
            orderIndex: item.orderIndex,
            supersetGroup: item.supersetGroup ?? null,
            restSeconds: item.defaultRestSeconds ?? null,
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

  const updates: Partial<typeof sessions.$inferInsert> = {};
  if ('name' in body) updates.name = body.name ?? null;
  if ('notes' in body) updates.notes = body.notes ?? null;
  if ('durationMinutes' in body) updates.durationMinutes = body.durationMinutes ?? null;

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

// POST /sessions/:id/complete
sessionRoutes.post('/:id/complete', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
    .limit(1);

  if (existing.length === 0) return c.json({ error: 'Not found' }, 404);

  let body: CompleteSessionRequest = {};
  try {
    body = await c.req.json();
  } catch {
    // body is optional
  }

  const updates: Partial<typeof sessions.$inferInsert> = {
    status: 'completed',
    completedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name ?? null;
  if (body.durationMinutes !== undefined) updates.durationMinutes = body.durationMinutes ?? null;
  if (body.notes !== undefined) updates.notes = body.notes ?? null;
  if (body.date !== undefined) updates.date = body.date;

  await db
    .update(sessions)
    .set(updates)
    .where(and(eq(sessions.id, id), eq(sessions.userId, userId)));

  const session = await fetchSessionWithEntries(db, id, userId);
  return c.json({ session });
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

  const [inserted] = await db
    .insert(sessionEntries)
    .values({
      sessionId,
      kind: body.kind,
      exerciseId: body.exerciseId ?? null,
      disciplineId: body.disciplineId ?? null,
      gi: body.gi ?? null,
      orderIndex: nextIndex,
      restSeconds: body.restSeconds ?? null,
      details: body.details ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  const entry = await fetchEntryWithSets(db, inserted.id);
  return c.json({ entry }, 201);
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
    const [exRow] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.id, body.exerciseId),
          or(isNull(exercises.userId), eq(exercises.userId, userId))!,
        ),
      )
      .limit(1);
    if (!exRow) return c.json({ error: 'Exercise not found' }, 404);
    updates.exerciseId = body.exerciseId;
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
