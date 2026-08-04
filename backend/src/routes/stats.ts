import { Hono } from 'hono';
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { exercises, partners, sessionEntries, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { aggregateMatStats, type MatEntryRow } from '../lib/matStats';
import { aggregatePartnerStats } from '../lib/partnerStats';
import { epleyE1rmSql } from '../lib/e1rm';
import { isIsoDate } from '../lib/validate';
import type { MuscleSummaryResponse, PartnerStatsResponse, TopLiftsResponse } from '@app/shared';

type Env = AppEnv;

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
  // The other three stats endpoints validate `since` and fall back on garbage;
  // this one passed the raw param straight into a date comparison, so a bad
  // value was a 500 instead of a default window.
  const sinceParam = c.req.query('since');
  const since = isIsoDate(sinceParam) ? sinceParam : defaultSince.toISOString().slice(0, 10);

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

  // Bound the scan: default to the last two years so the join chain doesn't
  // traverse a power user's entire training history on every stats view.
  const sinceParam = c.req.query('since');
  const since =
    isIsoDate(sinceParam)
      ? sinceParam
      : new Date(Date.now() - 2 * 365.25 * 86_400_000).toISOString().slice(0, 10);

  // DISTINCT ON picks the best set per exercise (highest estimated 1RM), then we
  // sort across exercises and take the top 10. The CASE mirrors the shared
  // estimatedOneRepMax calculator (Epley, reps=1 → weight).
  const e1rm = epleyE1rmSql(sql`ss.weight::numeric`, sql`ss.reps::numeric`);
  const rows = await db.execute(sql`
    SELECT x.exercise_id, x.exercise_name, x.weight::float AS weight, x.reps,
           x.estimated_1rm::float AS estimated_1rm
    FROM (
      SELECT DISTINCT ON (e.id)
        e.id          AS exercise_id,
        e.name        AS exercise_name,
        ss.weight::numeric AS weight,
        ss.reps,
        ${e1rm} AS estimated_1rm
      FROM strength_sets ss
      JOIN session_entries se ON ss.session_entry_id = se.id
      JOIN sessions s         ON se.session_id = s.id
      JOIN exercises e        ON se.exercise_id = e.id
      WHERE s.user_id    = ${userId}
        AND s.status     = 'completed'
        AND s.date       >= ${since}
        AND ss.completed = TRUE
        AND ss.weight    IS NOT NULL
        AND ss.reps      IS NOT NULL
      ORDER BY e.id, (${e1rm}) DESC
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

// GET /stats/mat?since=YYYY-MM-DD&weeks=8
// Weekly rounds/mat-time buckets plus intensity and sparring aggregates over
// the window. `since` should be the Monday of the oldest bucket, computed
// client-side so week boundaries follow the device's timezone.
statsRoutes.get('/mat', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const weeksParam = Number(c.req.query('weeks'));
  const weeks = Number.isInteger(weeksParam) ? Math.min(Math.max(weeksParam, 1), 26) : 8;

  const sinceParam = c.req.query('since');
  let since: string;
  if (isIsoDate(sinceParam)) {
    since = sinceParam;
  } else {
    // Default: UTC Monday of the week (weeks - 1) weeks back.
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
    since = monday.toISOString().slice(0, 10);
  }

  // The rounds payload is a discriminated jsonb union with a legacy variant,
  // so aggregation happens in TS (reusing the shared isRoundsSession guard)
  // rather than triple-implementing the schema in SQL. Volume is bounded by
  // the window: tens of entries, not thousands.
  const entryRows = await fetchMatEntries(db, userId, since);

  // Sessions that also contain gym entries must not attribute their whole
  // duration to mat time when rounds carry no durations of their own.
  const sessionIds = [...new Set(entryRows.map((r) => r.sessionId))];
  const mixedSessionIds = new Set<string>();
  if (sessionIds.length > 0) {
    const mixedRows = await db
      .selectDistinct({ sessionId: sessionEntries.sessionId })
      .from(sessionEntries)
      .where(
        and(
          inArray(sessionEntries.sessionId, sessionIds),
          eq(sessionEntries.kind, 'exercise'),
        ),
      );
    for (const r of mixedRows) mixedSessionIds.add(r.sessionId);
  }

  return c.json(aggregateMatStats(entryRows, mixedSessionIds, since, weeks));
});

// GET /stats/partners?since=YYYY-MM-DD
// Per-training-partner sparring breakdown over the window (default ~1 year).
statsRoutes.get('/partners', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const sinceParam = c.req.query('since');
  const since =
    isIsoDate(sinceParam)
      ? sinceParam
      : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

  const [entryRows, partnerRows] = await Promise.all([
    fetchMatEntries(db, userId, since),
    db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.userId, userId)),
  ]);

  const result: PartnerStatsResponse = {
    since,
    partners: aggregatePartnerStats(entryRows, partnerRows),
  };
  return c.json(result);
});

// Completed martial-arts entries (with session date/duration) since a date.
function fetchMatEntries(
  db: ReturnType<typeof getDb>,
  userId: string,
  since: string,
): Promise<MatEntryRow[]> {
  return db
    .select({
      sessionId: sessionEntries.sessionId,
      sessionDate: sessions.date,
      sessionDurationMinutes: sessions.durationMinutes,
      details: sessionEntries.details,
    })
    .from(sessionEntries)
    .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.status, 'completed'),
        eq(sessionEntries.kind, 'martial_arts'),
        gte(sessions.date, since),
      ),
    );
}

export { statsRoutes };
