import { Hono } from 'hono';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { createDb } from '../db';
import {
  disciplines,
  exerciseMuscleOverrides,
  exercises,
  sessionEntries,
  sessions,
  strengthSets,
} from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { estimatedOneRepMax, MAX_CUSTOM_EXERCISES_PER_USER, NAME_MAX_LENGTH } from '@app/shared';
import { epleyE1rmSql } from '../lib/e1rm';
import { parseMuscleSelection } from '../lib/muscles';
import { isIsoDate, isWithinLength } from '../lib/validate';
import type {
  CreateExerciseRequest,
  Exercise,
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  ExercisePRsResponse,
  ExerciseProgressionPoint,
  ExerciseProgressionResponse,
  ExerciseListResponse,
  SessionEntryWithSets,
  StrengthSet,
  UpdateExerciseRequest,
} from '@app/shared';

type Env = AppEnv;

const exerciseRoutes = new Hono<Env>();

exerciseRoutes.use('*', authMiddleware);

type ExerciseRow = typeof exercises.$inferSelect;

/** The caller's override of a seeded exercise's muscles, when they have one. */
type OverrideRow = { muscleGroup: string | null; secondaryMuscles: string[] } | null;

function mapExercise(r: ExerciseRow, override?: OverrideRow): Exercise {
  return {
    id: r.id,
    userId: r.userId,
    name: r.name,
    type: r.type as Exercise['type'],
    createdAt: r.createdAt.toISOString(),
    category: r.category,
    bodyPart: r.bodyPart,
    equipment: r.equipment,
    // An override replaces the catalogue tagging wholesale rather than merging
    // into it — the user is saying what the lift works, not adding to a list.
    muscleGroup: override ? override.muscleGroup : r.muscleGroup,
    secondaryMuscles: override ? override.secondaryMuscles : r.secondaryMuscles,
    target: r.target,
  };
}

/**
 * Rows shaped for `mapExercise` with the caller's muscle override attached.
 * A LEFT JOIN, so an exercise with no override still comes back.
 */
function selectExercisesForUser(
  db: ReturnType<typeof createDb>,
  userId: string,
) {
  return db
    .select({
      exercise: exercises,
      override: {
        muscleGroup: exerciseMuscleOverrides.muscleGroup,
        secondaryMuscles: exerciseMuscleOverrides.secondaryMuscles,
      },
    })
    .from(exercises)
    .leftJoin(
      exerciseMuscleOverrides,
      and(
        eq(exerciseMuscleOverrides.exerciseId, exercises.id),
        eq(exerciseMuscleOverrides.userId, userId),
      ),
    );
}

/**
 * "Did an override row match?" — the question the LEFT JOIN above leaves open.
 * Drizzle can express a miss either as a null nested object or as an object of
 * nulls depending on how the selection is shaped, so both are treated as absent.
 * The test on a NOT NULL column (`secondary_muscles`) is what makes the second
 * case unambiguous: an override that deliberately clears the muscles still has
 * an array there, so it stays distinguishable from having no override at all.
 */
function overrideOf(row: { override: { muscleGroup: string | null; secondaryMuscles: string[] | null } | null }): OverrideRow {
  const o = row.override;
  if (!o || o.secondaryMuscles === null) return null;
  return { muscleGroup: o.muscleGroup, secondaryMuscles: o.secondaryMuscles };
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

  const rows = await selectExercisesForUser(db, userId)
    .where(and(...conditions))
    .orderBy(exercises.name)
    .limit(limit)
    .offset(offset);

  const result: ExerciseListResponse = {
    exercises: rows.map((r) => mapExercise(r.exercise, overrideOf(r))),
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
  // Exercises are strength or conditioning only — martial_arts is a discipline.
  if (body.type !== 'strength' && body.type !== 'conditioning') {
    return c.json({ error: 'type must be "strength" or "conditioning"' }, 400);
  }
  if (!isWithinLength(body.name, NAME_MAX_LENGTH)) {
    return c.json({ error: `name must be ${NAME_MAX_LENGTH} characters or fewer` }, 400);
  }

  const muscles = parseMuscleSelection(body);
  if ('error' in muscles) return c.json({ error: muscles.error }, 400);

  // Abuse ceiling, not the paywall — see the note on FREE_CUSTOM_EXERCISE_LIMIT
  // in @app/shared. The Worker can't distinguish a paying Pro user from a free
  // one, so this sits far above any real usage and only bounds a scripted
  // client inserting in a loop.
  const [{ count: customCount }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(exercises)
    .where(eq(exercises.userId, userId));

  if (Number(customCount) >= MAX_CUSTOM_EXERCISES_PER_USER) {
    return c.json(
      { error: `You've reached the maximum of ${MAX_CUSTOM_EXERCISES_PER_USER} custom exercises` },
      409,
    );
  }

  const [row] = await db
    .insert(exercises)
    .values({
      userId,
      name: body.name,
      type: body.type,
      target: body.target ?? null,
      muscleGroup: muscles.value.muscleGroup,
      secondaryMuscles: muscles.value.secondaryMuscles,
      equipment: body.equipment ?? null,
    })
    .returning();

  return c.json({ exercise: mapExercise(row) }, 201);
});

// PUT /exercises/:id/muscles — replace an exercise's whole muscle tagging.
//
// Works on any exercise the caller can see, but by two different mechanisms:
// their own row is updated in place, while a seeded global row (user_id NULL,
// shared by every user) gets a per-user override instead. See the note on
// exercise_muscle_overrides in the schema for why it isn't a copied row.
exerciseRoutes.put('/:id/muscles', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const muscles = parseMuscleSelection(body);
  if ('error' in muscles) return c.json({ error: muscles.error }, 400);
  const { muscleGroup, secondaryMuscles } = muscles.value;

  // Same visibility predicate as GET /:id — own rows plus the global catalogue.
  const [existing] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), or(isNull(exercises.userId), eq(exercises.userId, userId))!))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  if (existing.userId === userId) {
    const [row] = await db
      .update(exercises)
      .set({ muscleGroup, secondaryMuscles })
      .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
      .returning();

    return c.json({ exercise: mapExercise(row) });
  }

  await db
    .insert(exerciseMuscleOverrides)
    .values({ userId, exerciseId: id, muscleGroup, secondaryMuscles })
    .onConflictDoUpdate({
      target: [exerciseMuscleOverrides.userId, exerciseMuscleOverrides.exerciseId],
      set: { muscleGroup: sql`excluded.muscle_group`, secondaryMuscles: sql`excluded.secondary_muscles` },
    });

  return c.json({ exercise: mapExercise(existing, { muscleGroup, secondaryMuscles }) });
});

// DELETE /exercises/:id/muscles — drop the caller's override, restoring the
// catalogue tagging. Idempotent, and a no-op on an exercise they own: that row
// holds the muscles directly, so there is nothing to restore it to.
exerciseRoutes.delete('/:id/muscles', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [existing] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), or(isNull(exercises.userId), eq(exercises.userId, userId))!))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  await db
    .delete(exerciseMuscleOverrides)
    .where(
      and(
        eq(exerciseMuscleOverrides.exerciseId, id),
        eq(exerciseMuscleOverrides.userId, userId),
      ),
    );

  return c.json({ exercise: mapExercise(existing) });
});

// GET /exercises/:id  — single exercise with its metadata
exerciseRoutes.get('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await selectExercisesForUser(db, userId)
    .where(and(eq(exercises.id, id), or(isNull(exercises.userId), eq(exercises.userId, userId))!))
    .limit(1);

  if (!row) return c.json({ error: 'Not found' }, 404);

  return c.json({ exercise: mapExercise(row.exercise, overrideOf(row)) });
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

  if (body.type !== undefined && body.type !== 'strength' && body.type !== 'conditioning') {
    return c.json({ error: 'type must be "strength" or "conditioning"' }, 400);
  }
  if (!isWithinLength(body.name, NAME_MAX_LENGTH)) {
    return c.json({ error: `name must be ${NAME_MAX_LENGTH} characters or fewer` }, 400);
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
  //
  // Unlike the Top Lifts leaderboard, over-cap sets are NOT filtered out here.
  // This is the exercise's own page: excluding them would blank the card for
  // someone who only trains in high reps, when what they want is "your heaviest
  // set was X" with the 1RM estimate reading "—". The ordering below keeps that
  // working — see the NULLS LAST note.
  const e1rmExpr = epleyE1rmSql(sql`${strengthSets.weight}`, sql`${strengthSets.reps}`);

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
        // This route was the only one of the three that never checked the
        // session's status (/history and /progression both do), so a set logged
        // in an in-progress session — or one later skipped and abandoned —
        // counted as a personal record permanently.
        eq(sessions.status, 'completed'),
        eq(strengthSets.completed, true),
        // A warm-up ticked off is not a lift.
        ne(strengthSets.setType, 'warmup'),
        isNotNull(strengthSets.weight),
        isNotNull(strengthSets.reps),
      ),
    )
    // NULLS LAST or Postgres puts the unestimable sets first on a DESC sort —
    // the exact rows the rep cap exists to reject. The weight/reps tiebreak is
    // what makes the "keep the set, drop the estimate" behaviour work: when no
    // set is estimable every e1rm is NULL, and the heaviest should still win.
    .orderBy(sql`${e1rmExpr} DESC NULLS LAST, ${strengthSets.weight} DESC, ${strengthSets.reps} DESC`)
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
        // Same omission as the query above: "total sessions" was counting
        // sessions the user started and never finished.
        eq(sessions.status, 'completed'),
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

// GET /exercises/:id/progression?since=YYYY-MM-DD
// One point per completed session (oldest-first) with the best Epley e1RM, top
// weight, and total volume for this exercise that session — the long-run trend
// the 5-entry /history endpoint can't provide. Aggregated in the DB so a power
// user's full history isn't shipped into the Worker; bounded to a window and a
// point cap. The CASE mirrors the shared estimatedOneRepMax calculator (Epley).
//
// MAX() skips NULLs, so a session of nothing but high-rep work yields a null
// bestEstimatedOneRepMax while keeping its topWeight and totalVolume — the
// session still charts on the other two series, it just contributes no point to
// the 1RM trend. Hence the nullable field on ExerciseProgressionPoint.
exerciseRoutes.get('/:id/progression', async (c) => {
  const userId = c.get('userId');
  const exerciseId = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const sinceParam = c.req.query('since');
  const since =
    isIsoDate(sinceParam)
      ? sinceParam
      : new Date(Date.now() - 2 * 365.25 * 86_400_000).toISOString().slice(0, 10);

  const rows = await db.execute(sql`
    SELECT s.date AS date,
           MAX(${epleyE1rmSql(sql`ss.weight::numeric`, sql`ss.reps::numeric`)})::float AS best_e1rm,
           MAX(ss.weight)::float AS top_weight,
           SUM(ss.weight::numeric * ss.reps::numeric)::float AS total_volume
    FROM strength_sets ss
    JOIN session_entries se ON ss.session_entry_id = se.id
    JOIN sessions s         ON se.session_id = s.id
    WHERE se.exercise_id = ${exerciseId}
      AND s.user_id      = ${userId}
      AND s.status       = 'completed'
      AND s.date         >= ${since}
      AND ss.completed   = TRUE
      AND ss.set_type   <> 'warmup'
      AND ss.weight      IS NOT NULL
      AND ss.reps        IS NOT NULL
    GROUP BY s.id, s.date
    ORDER BY s.date ASC
    LIMIT 200
  `);

  const points: ExerciseProgressionPoint[] = (rows as unknown as Array<{
    date: string;
    best_e1rm: number;
    top_weight: number;
    total_volume: number;
  }>).map((r) => ({
    date: r.date,
    bestEstimatedOneRepMax: r.best_e1rm,
    topWeight: r.top_weight,
    totalVolume: r.total_volume,
  }));

  const result: ExerciseProgressionResponse = { points };
  return c.json(result);
});

export { exerciseRoutes };
