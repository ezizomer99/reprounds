import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
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
    conditions.push(ilike(exercises.name, `%${search}%`));
  }
  if (categoryFilter) {
    conditions.push(eq(exercises.category, categoryFilter));
  }
  if (equipmentFilter) {
    conditions.push(eq(exercises.equipment, equipmentFilter));
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(exercises.name);

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

  const allSetsRows = await db
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
      sessionId: sessions.id,
    })
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

  const mappedSets = allSetsRows.map((row) => mapSet(row));

  const completedWithWeightAndReps = mappedSets.filter(
    (s): s is StrengthSet & { weight: number; reps: number } =>
      s.weight !== null && s.reps !== null,
  );

  let bestEstimated1RM: number | null = null;
  let bestSetResult: StrengthSet | null = null;

  if (completedWithWeightAndReps.length > 0) {
    let bestE1RM = -Infinity;
    for (const s of completedWithWeightAndReps) {
      const e1rm = estimatedOneRepMax(s.weight, s.reps);
      if (e1rm > bestE1RM) {
        bestE1RM = e1rm;
        bestSetResult = s;
      }
    }
    bestEstimated1RM = bestE1RM === -Infinity ? null : bestE1RM;
  }

  const uniqueSessionIds = new Set(allSetsRows.map((r) => r.sessionId));

  const result: ExercisePRsResponse = {
    estimatedOneRepMax: bestEstimated1RM,
    bestSet: bestSetResult,
    totalSessions: uniqueSessionIds.size,
  };

  return c.json(result);
});

export { exerciseRoutes };
