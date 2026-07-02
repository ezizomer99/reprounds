import { Hono } from 'hono';
import { and, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { exercises, sessionEntries, sessions, strengthSets } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { MuscleSummaryResponse, TopLiftsResponse } from '@app/shared';

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

const statsRoutes = new Hono<Env>();

statsRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

// GET /stats/muscles?since=YYYY-MM-DD
// Returns distinct muscle groups from exercises done in completed sessions since the given date.
statsRoutes.get('/muscles', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const defaultSince = new Date();
  defaultSince.setDate(defaultSince.getDate() - 7);
  const since = c.req.query('since') ?? defaultSince.toISOString().slice(0, 10);

  const rows = await db
    .selectDistinct({
      muscleGroup: exercises.muscleGroup,
      secondaryMuscles: exercises.secondaryMuscles,
    })
    .from(sessionEntries)
    .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id))
    .innerJoin(exercises, eq(sessionEntries.exerciseId, exercises.id))
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, 'completed'),
        gte(sessions.date, since),
        eq(sessionEntries.kind, 'exercise'),
        isNotNull(exercises.muscleGroup),
      ),
    );

  const result: MuscleSummaryResponse = {
    muscles: rows.map((r) => ({
      muscleGroup: r.muscleGroup,
      secondaryMuscles: r.secondaryMuscles ?? [],
    })),
  };
  return c.json(result);
});

// GET /stats/top-lifts
// Returns the top 10 exercises by estimated 1RM (Epley formula: w*(1+reps/30)).
statsRoutes.get('/top-lifts', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  // DISTINCT ON picks the best set per exercise (highest estimated 1RM), then we
  // sort across exercises and take the top 10.
  const rows = await db.execute(sql`
    SELECT x.exercise_id, x.exercise_name, x.weight::float AS weight, x.reps,
           x.estimated_1rm::float AS estimated_1rm
    FROM (
      SELECT DISTINCT ON (e.id)
        e.id          AS exercise_id,
        e.name        AS exercise_name,
        ss.weight::numeric AS weight,
        ss.reps,
        ss.weight::numeric * (1.0 + ss.reps::numeric / 30.0) AS estimated_1rm
      FROM strength_sets ss
      JOIN session_entries se ON ss.session_entry_id = se.id
      JOIN sessions s         ON se.session_id = s.id
      JOIN exercises e        ON se.exercise_id = e.id
      WHERE s.user_id    = ${userId}
        AND s.status     = 'completed'
        AND ss.completed = TRUE
        AND ss.weight    IS NOT NULL
        AND ss.reps      IS NOT NULL
      ORDER BY e.id, (ss.weight::numeric * (1.0 + ss.reps::numeric / 30.0)) DESC
    ) x
    ORDER BY x.estimated_1rm DESC
    LIMIT 10
  `);

  const result: TopLiftsResponse = {
    lifts: (rows as unknown as Array<{
      exercise_id: string;
      exercise_name: string;
      weight: number;
      reps: number;
      estimated_1rm: number;
    }>).map((r) => ({
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      weight: r.weight,
      reps: r.reps,
      estimatedOneRepMax: r.estimated_1rm,
    })),
  };
  return c.json(result);
});

export { statsRoutes };
