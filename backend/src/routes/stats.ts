import { Hono } from 'hono';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { partners, sessionEntries, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { aggregateMatStats, type MatEntryRow } from '../lib/matStats';
import { buildWeeklyBuckets } from '../lib/weeklyStats';
import { aggregatePartnerStats } from '../lib/partnerStats';
import { epleyE1rmSql } from '../lib/e1rm';
import { isIsoDate } from '../lib/validate';
import { E1RM_MAX_REPS } from '@app/shared';
import type {
  MuscleSummaryResponse,
  PartnerStatsResponse,
  TopLiftsResponse,
  WeeklyStatsResponse,
} from '@app/shared';

type Env = AppEnv;

const statsRoutes = new Hono<Env>();

statsRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

/**
 * Longest window the weekly endpoints will aggregate: one year, matching the
 * widest range the stats tab offers. Was 26, which silently served six months
 * of data to anything asking for a year.
 */
const MAX_WEEKS = 52;
const DEFAULT_WEEKS = 8;

/**
 * Parse the `since`/`weeks` pair shared by /stats/weekly and /stats/mat.
 *
 * `weeks` is deliberately parsed from the raw string rather than via Number():
 * `Number('')` is 0, which passes Number.isInteger and clamped to a one-week
 * window, so `?weeks=` returned a single bucket instead of the default.
 */
function weekWindow(sinceParam: string | undefined, weeksParam: string | undefined) {
  const parsedWeeks = weeksParam !== undefined && weeksParam !== '' ? Number(weeksParam) : NaN;
  const weeks = Number.isInteger(parsedWeeks)
    ? Math.min(Math.max(parsedWeeks, 1), MAX_WEEKS)
    : DEFAULT_WEEKS;

  if (isIsoDate(sinceParam)) return { since: sinceParam, weeks };

  // Default: UTC Monday of the week (weeks - 1) weeks back. Callers should send
  // their local Monday — this fallback can be a day off for a device far from
  // UTC, which is why the client always passes one.
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
  return { since: monday.toISOString().slice(0, 10), weeks };
}

// GET /stats/muscles?since=YYYY-MM-DD&until=YYYY-MM-DD
// Muscle groups trained in completed sessions over [since, until), weighted by
// the completed sets logged against each.
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

  // Bounded at both ends, exclusive at the top. `>= since` alone counted a
  // completed session dated *ahead* of the window — session dates are accepted
  // years into the future — so a workout logged forward showed up in "Muscles
  // This Week". The client's own sessionsThisWeek was fixed for exactly this;
  // the endpoint it sits next to was not. An absent/invalid `until` keeps the
  // old open-ended behaviour rather than inventing a ceiling.
  const untilParam = c.req.query('until');
  const until = isIsoDate(untilParam) ? untilParam : null;

  // Weight per muscle grouping = completed sets, not row count. This was a
  // selectDistinct, so a single set of curls and eight sets of bench produced
  // one row each and coloured the heat map identically. Sets (not tonnage) is
  // the weight: tonnage is dominated by the squat/deadlift pattern and would
  // paint every user's legs red regardless of how they actually trained.
  //
  // The inner query rolls up per entry so an entry with no strength_sets at all
  // (conditioning work) still lands with a floor of one set instead of dropping
  // out through the LEFT JOIN.
  const rows = await db.execute(sql`
    SELECT
      x.muscle_group,
      x.secondary_muscles,
      SUM(x.sets)::int         AS sets,
      SUM(x.volume_kg)::float  AS volume_kg
    FROM (
      SELECT
        e.muscle_group,
        e.secondary_muscles,
        GREATEST(COUNT(ss.id) FILTER (WHERE ss.completed), 1) AS sets,
        COALESCE(SUM(ss.weight * ss.reps) FILTER (WHERE ss.completed), 0) AS volume_kg
      FROM session_entries se
      JOIN sessions  s ON se.session_id  = s.id
      JOIN exercises e ON se.exercise_id = e.id
      LEFT JOIN strength_sets ss ON ss.session_entry_id = se.id
      WHERE s.user_id = ${userId}
        AND s.status  = 'completed'
        AND s.date   >= ${since}
        ${until ? sql`AND s.date < ${until}` : sql``}
        AND se.kind   = 'exercise'
        AND e.muscle_group IS NOT NULL
      GROUP BY se.id, e.muscle_group, e.secondary_muscles
    ) x
    GROUP BY x.muscle_group, x.secondary_muscles
  `);

  const result: MuscleSummaryResponse = {
    muscles: (rows as unknown as Array<{
      muscle_group: string;
      secondary_muscles: string[] | null;
      sets: number;
      volume_kg: number;
    }>).map((r) => ({
      muscleGroup: r.muscle_group,
      secondaryMuscles: r.secondary_muscles ?? [],
      sets: r.sets,
      volumeKg: r.volume_kg,
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
  //
  // This is a leaderboard, so sets the estimate can't speak for are filtered out
  // in the WHERE rather than ranked last: an exercise trained only in high reps
  // simply doesn't place, and no NULL can reach TopLift.estimatedOneRepMax.
  // (The exercise's *own* PR card takes the opposite approach and keeps the set
  // while showing "—" — see /exercises/:id/prs.) NULLS LAST on both ORDER BYs
  // regardless: Postgres sorts NULLS FIRST for DESC, and a filter that later
  // loosens would otherwise silently promote exactly the wrong rows.
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
        AND ss.reps      <= ${E1RM_MAX_REPS}
        AND ss.set_type <> 'warmup'
      ORDER BY e.id, (${e1rm}) DESC NULLS LAST
    ) x
    ORDER BY x.estimated_1rm DESC NULLS LAST
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

// GET /stats/weekly?since=YYYY-MM-DD&weeks=8
// Per-week completed sessions, tonnage and set count over the window. `since`
// should be the Monday of the oldest bucket, computed client-side so week
// boundaries follow the device's timezone.
statsRoutes.get('/weekly', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const { since, weeks } = weekWindow(c.req.query('since'), c.req.query('weeks'));

  // Aggregated in SQL rather than rolled up on the client from GET /sessions:
  // that list caps at 200 rows ordered newest-first, so at a year and five
  // sessions a week the oldest buckets quietly undercounted. Bucketing on
  // `s.date - since` keeps this a single grouped scan over the window.
  //
  // COUNT(DISTINCT s.id) is required, not stylistic: the joins fan a session out
  // to one row per set, so a plain COUNT would report a heavy session as dozens.
  const rows = await db.execute(sql`
    SELECT
      (FLOOR((s.date - ${since}::date) / 7))::int                            AS bucket,
      COUNT(DISTINCT s.id)::int                                              AS sessions,
      COALESCE(SUM(ss.weight * ss.reps), 0)::float                           AS volume_kg,
      COUNT(ss.id)::int                                                      AS completed_sets
    FROM sessions s
    LEFT JOIN session_entries se ON se.session_id = s.id
    LEFT JOIN strength_sets  ss ON ss.session_entry_id = se.id AND ss.completed = TRUE
    WHERE s.user_id = ${userId}
      AND s.status  = 'completed'
      AND s.date   >= ${since}::date
      AND s.date    < (${since}::date + ${weeks * 7})
    GROUP BY bucket
  `);

  const parsed = (rows as unknown as Array<{
    bucket: number;
    sessions: number;
    volume_kg: number;
    completed_sets: number;
  }>).map((r) => ({
    bucket: r.bucket,
    sessions: r.sessions,
    volumeKg: r.volume_kg,
    completedSets: r.completed_sets,
  }));

  const result: WeeklyStatsResponse = { weeks: buildWeeklyBuckets(parsed, since, weeks) };
  return c.json(result);
});

// GET /stats/mat?since=YYYY-MM-DD&weeks=8
// Weekly rounds/mat-time buckets plus intensity and sparring aggregates over
// the window. `since` should be the Monday of the oldest bucket, computed
// client-side so week boundaries follow the device's timezone.
statsRoutes.get('/mat', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const { since, weeks } = weekWindow(c.req.query('since'), c.req.query('weeks'));

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
