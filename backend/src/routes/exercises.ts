import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines, exercises, sessionEntries, sessions, strengthSets } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { estimatedOneRepMax } from '@app/shared';
import type {
  CreateExerciseRequest,
  Exercise,
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  ExercisePRsResponse,
  ExerciseListResponse,
  SessionEntryWithSets,
  StrengthSet,
  UpdateExerciseRequest,
} from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
    EXERCISES_BUCKET: R2Bucket;
    R2_PUBLIC_BASE_URL: string;
  };
  Variables: {
    userId: string;
  };
};

const exerciseRoutes = new Hono<Env>();

exerciseRoutes.use('*', authMiddleware);

type ExerciseRow = typeof exercises.$inferSelect;

function mapExercise(r: ExerciseRow, includeHeavy = false): Exercise {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    type: r.type as Exercise['type'],
    createdAt: r.createdAt.toISOString(),
    category: r.category,
    bodyPart: r.bodyPart,
    equipment: r.equipment,
    muscleGroup: r.muscleGroup,
    secondaryMuscles: r.secondaryMuscles,
    target: r.target,
    imageUrl: r.imageUrl,
    instructions: includeHeavy ? r.instructions : null,
    instructionSteps: includeHeavy ? (r.instructionSteps as string[] | null) : null,
  };
}

// GET /exercises
exerciseRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const typeFilter = c.req.query('type') as string | undefined;
  const search = c.req.query('search');
  const categoryFilter = c.req.query('category');
  const equipmentFilter = c.req.query('equipment');

  const conditions = [or(isNull(exercises.userId), eq(exercises.userId, userId))!];

  if (typeFilter) {
    conditions.push(eq(exercises.type, typeFilter as 'strength' | 'conditioning' | 'martial_arts'));
  }
  if (search) {
    // % and _ are LIKE wildcards — escape them so a literal search can't
    // degenerate into a match-everything scan.
    const escaped = search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    conditions.push(ilike(exercises.name, `%${escaped}%`));
  }
  if (categoryFilter) {
    conditions.push(eq(exercises.category, categoryFilter));
  }
  if (equipmentFilter) {
    conditions.push(eq(exercises.equipment, equipmentFilter));
  }

  // Hard ceiling so the response can't grow unboundedly with custom
  // exercises; the app browses the full (seeded ~800-row) catalog today, so
  // the default stays permissive. Clients can page with limit/offset.
  const limitParam = Number(c.req.query('limit'));
  const offsetParam = Number(c.req.query('offset'));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 1000;
  const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(exercises.name)
    .limit(limit)
    .offset(offset);

  const result: ExerciseListResponse = {
    exercises: rows.map((r) => mapExercise(r, false)),
  };

  return c.json(result);
});

// POST /exercises
exerciseRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateExerciseRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.name || !body.type) {
    return c.json({ error: 'name and type are required' }, 400);
  }

  const [row] = await db
    .insert(exercises)
    .values({
      userId,
      name: body.name,
      type: body.type,
      target: body.target ?? null,
      muscleGroup: body.muscleGroup ?? null,
      equipment: body.equipment ?? null,
    })
    .returning();

  return c.json({ exercise: mapExercise(row) }, 201);
});

// GET /exercises/:id  — full detail including instructions
exerciseRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), or(isNull(exercises.userId), eq(exercises.userId, userId))!))
    .limit(1);

  if (!row) return c.json({ error: 'Not found' }, 404);

  return c.json({ exercise: mapExercise(row, true) });
});

// PATCH /exercises/:id
exerciseRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const existing = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateExerciseRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const updates: Partial<typeof exercises.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if ('target' in body) updates.target = body.target ?? null;

  if (Object.keys(updates).length === 0) {
    return c.json({ exercise: mapExercise(existing[0]) });
  }

  const [row] = await db
    .update(exercises)
    .set(updates)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning();

  return c.json({ exercise: mapExercise(row) });
});

// DELETE /exercises/:id
exerciseRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const existing = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  // session_entries.exercise_id is ON DELETE NO ACTION — without this check
  // the delete would surface as a raw FK 500 once the exercise has been logged.
  const [logged] = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(eq(sessionEntries.exerciseId, id))
    .limit(1);
  if (logged) {
    return c.json(
      { error: 'This exercise has logged sessions and cannot be deleted' },
      409,
    );
  }

  await db
    .delete(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)));

  return c.json({ success: true });
});

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

// GET /exercises/:id/history
exerciseRoutes.get('/:id/history', async (c) => {
  const userId = c.get('userId');
  const exerciseId = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const entryRows = await db
    .select({
      entryId: sessionEntries.id,
      sessionId: sessionEntries.sessionId,
      kind: sessionEntries.kind,
      exerciseId: sessionEntries.exerciseId,
      disciplineId: sessionEntries.disciplineId,
      gi: sessionEntries.gi,
      orderIndex: sessionEntries.orderIndex,
      supersetGroup: sessionEntries.supersetGroup,
      restSeconds: sessionEntries.restSeconds,
      details: sessionEntries.details,
      entryNotes: sessionEntries.notes,
      sessionDate: sessions.date,
      exerciseName: exercises.name,
      disciplineName: disciplines.name,
    })
    .from(sessionEntries)
    .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id))
    .leftJoin(exercises, eq(sessionEntries.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(sessionEntries.disciplineId, disciplines.id))
    .where(
      and(
        eq(sessionEntries.exerciseId, exerciseId),
        eq(sessions.userId, userId),
        eq(sessions.status, 'completed'),
      ),
    )
    .orderBy(desc(sessions.date))
    .limit(5);

  if (entryRows.length === 0) {
    const result: ExerciseHistoryResponse = { history: [] };
    return c.json(result);
  }

  const entryIds = entryRows.map((r) => r.entryId);
  const allSets = await db
    .select()
    .from(strengthSets)
    .where(inArray(strengthSets.sessionEntryId, entryIds))
    .orderBy(asc(strengthSets.setNumber));

  const setsByEntryId = new Map<string, StrengthSet[]>();
  for (const set of allSets) {
    const list = setsByEntryId.get(set.sessionEntryId) ?? [];
    list.push(mapSet(set));
    setsByEntryId.set(set.sessionEntryId, list);
  }

  const history: ExerciseHistoryEntry[] = entryRows.map((row) => {
    const entry: SessionEntryWithSets = {
      id: row.entryId,
      sessionId: row.sessionId,
      kind: row.kind,
      exerciseId: row.exerciseId,
      disciplineId: row.disciplineId,
      gi: row.gi,
      orderIndex: row.orderIndex,
      supersetGroup: row.supersetGroup,
      restSeconds: row.restSeconds,
      details: row.details as Record<string, unknown> | null,
      notes: row.entryNotes,
      sets: setsByEntryId.get(row.entryId) ?? [],
      exerciseName: row.exerciseName ?? null,
      disciplineName: row.disciplineName ?? null,
    };
    return { sessionId: row.sessionId, date: row.sessionDate, entry };
  });

  const result: ExerciseHistoryResponse = { history };
  return c.json(result);
});

// GET /exercises/:id/prs
exerciseRoutes.get('/:id/prs', async (c) => {
  const userId = c.get('userId');
  const exerciseId = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  // The PR is a max — compute it in the database instead of shipping every
  // completed set ever logged into the Worker (grows unboundedly with
  // training history). Mirrors estimatedOneRepMax: Epley, reps=1 → weight.
  const e1rmExpr = sql`CASE WHEN ${strengthSets.reps} = 1 THEN ${strengthSets.weight} ELSE ${strengthSets.weight} * (1 + ${strengthSets.reps} / 30.0) END`;

  const baseJoin = () =>
    db
      .select({
        id: strengthSets.id,
        sessionEntryId: strengthSets.sessionEntryId,
        setNumber: strengthSets.setNumber,
        setType: strengthSets.setType,
        reps: strengthSets.reps,
        weight: strengthSets.weight,
        rpe: strengthSets.rpe,
        rir: strengthSets.rir,
        completed: strengthSets.completed,
        notes: strengthSets.notes,
      })
      .from(strengthSets)
      .innerJoin(sessionEntries, eq(strengthSets.sessionEntryId, sessionEntries.id))
      .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id));

  const [bestRow] = await baseJoin()
    .where(
      and(
        eq(sessionEntries.exerciseId, exerciseId),
        eq(sessions.userId, userId),
        eq(strengthSets.completed, true),
        isNotNull(strengthSets.weight),
        isNotNull(strengthSets.reps),
      ),
    )
    .orderBy(sql`${e1rmExpr} DESC`)
    .limit(1);

  const [countRow] = await db
    .select({ totalSessions: sql<number>`COUNT(DISTINCT ${sessions.id})::int` })
    .from(strengthSets)
    .innerJoin(sessionEntries, eq(strengthSets.sessionEntryId, sessionEntries.id))
    .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id))
    .where(
      and(
        eq(sessionEntries.exerciseId, exerciseId),
        eq(sessions.userId, userId),
        eq(strengthSets.completed, true),
      ),
    );

  const bestSetResult: StrengthSet | null = bestRow ? mapSet(bestRow) : null;
  const bestEstimated1RM =
    bestSetResult && bestSetResult.weight !== null && bestSetResult.reps !== null
      ? estimatedOneRepMax(bestSetResult.weight, bestSetResult.reps)
      : null;

  const result: ExercisePRsResponse = {
    estimatedOneRepMax: bestEstimated1RM,
    bestSet: bestSetResult,
    totalSessions: countRow?.totalSessions ?? 0,
  };

  return c.json(result);
});

export { exerciseRoutes };
