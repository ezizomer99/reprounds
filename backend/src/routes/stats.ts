import { Hono } from 'hono';
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { partners, sessionEntries, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { aggregateMatStats, type MatEntryRow } from '../lib/matStats';
import { addDaysISO, buildWeeklyBuckets } from '../lib/weeklyStats';
import { aggregatePartnerStats } from '../lib/partnerStats';
import { mondayOfISO, weekStreak } from '../lib/streak';
import { epleyE1rmSql } from '../lib/e1rm';
import { isIsoDate } from '../lib/validate';
import { E1RM_MAX_REPS } from '@app/shared';
import type {
  MuscleSummaryResponse,
  PartnerStatsResponse,
  PersonalRecordsResponse,
  TopLiftsResponse,
  TrainingTotalsResponse,
  WeeklyStatsResponse,
  WeekStreakResponse,
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
 * Parse a `since`/`until` pair for the endpoints that take explicit dates.
 *
 * `until` is exclusive and optional, but callers showing a bounded window should
 * always send it. Session dates are accepted arbitrarily far into the future, so
 * an open-ended top bound means a workout logged with a mistyped year counts as
 * current — showing up as a top lift, or sorted first in the PR feed because the
 * feed orders by date descending. /stats/muscles was fixed for exactly this; the
 * endpoints beside it were not.
 *
 * An absent or malformed `until` keeps the old open-ended behaviour rather than
 * inventing a ceiling: a client that doesn't send one is asking for everything
 * from `since` onward, and silently truncating that would be the worse surprise.
 */
function dateWindow(
  sinceParam: string | undefined,
  untilParam: string | undefined,
  fallbackSince: () => string,
): { since: string; until: string | null } {
  return {
    since: isIsoDate(sinceParam) ? sinceParam : fallbackSince(),
    until: isIsoDate(untilParam) ? untilParam : null,
  };
}

/** `days` before today, as a `YYYY-MM-DD` — the shape every `since` default uses. */
function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

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

  // `until` is the exclusive end of the window, computed here rather than in SQL
  // — see addDaysISO for why adding to a date in SQL broke this endpoint.
  if (isIsoDate(sinceParam)) {
    return { since: sinceParam, until: addDaysISO(sinceParam, weeks * 7), weeks };
  }

  // Default: UTC Monday of the week (weeks - 1) weeks back. Callers should send
  // their local Monday — this fallback can be a day off for a device far from
  // UTC, which is why the client always passes one.
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - (weeks - 1) * 7);
  const since = monday.toISOString().slice(0, 10);
  return { since, until: addDaysISO(since, weeks * 7), weeks };
}

// GET /stats/muscles?since=YYYY-MM-DD&until=YYYY-MM-DD
// Muscle groups trained in completed sessions over [since, until), weighted by
// the completed sets logged against each.
statsRoutes.get('/muscles', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  // Bounded at both ends, exclusive at the top — see dateWindow. The `since`
  // fallback also matters on its own: this endpoint used to pass the raw param
  // straight into a date comparison, so a malformed value was a 500 rather than
  // a default window.
  const { since, until } = dateWindow(c.req.query('since'), c.req.query('until'), () =>
    daysAgoISO(7),
  );

  // Weight per muscle grouping = completed sets, not row count. This was a
  // selectDistinct, so a single set of curls and eight sets of bench produced
  // one row each and coloured the heat map identically. Sets (not tonnage) is
  // the weight: tonnage is dominated by the squat/deadlift pattern and would
  // paint every user's legs red regardless of how they actually trained.
  //
  // The inner query rolls up per entry so an entry with no strength_sets at all
  // (conditioning work) still lands with a floor of one set instead of dropping
  // out through the LEFT JOIN.
  // A user who has re-tagged a seeded exercise's muscles gets their override
  // instead of the catalogue value — the whole tagging, not a merge, matching
  // how GET /exercises resolves it. `mo.secondary_muscles` is NOT NULL on the
  // override table, so it doubles as the "an override exists" test; COALESCE
  // alone would be wrong for an override that deliberately sets no secondaries.
  const rows = await db.execute(sql`
    SELECT
      x.muscle_group,
      x.secondary_muscles,
      SUM(x.sets)::int         AS sets,
      SUM(x.volume_kg)::float  AS volume_kg
    FROM (
      SELECT
        COALESCE(mo.muscle_group, e.muscle_group) AS muscle_group,
        CASE WHEN mo.secondary_muscles IS NULL
             THEN e.secondary_muscles
             ELSE mo.secondary_muscles END        AS secondary_muscles,
        -- Working sets, not every set: warm-ups are excluded here exactly as
        -- they are in /top-lifts, /prs and the per-exercise PR query. Counting
        -- them made the heat map a picture of warm-up habits — five ramp-up
        -- sets on bench and none on rows reported 8 vs 3 for equal work, and
        -- aggregateMuscles normalises against the max, so the difference became
        -- a colour. MuscleSummaryItem.sets has always been documented as
        -- "completed *working* sets"; the SQL just didn't say so.
        --
        -- The GREATEST floor stays: an entry with no strength_sets at all is
        -- conditioning work, and it should still colour the muscle it trains
        -- rather than drop out through the LEFT JOIN.
        GREATEST(COUNT(ss.id) FILTER (WHERE ss.completed AND ss.set_type <> 'warmup'), 1) AS sets,
        COALESCE(
          SUM(ss.weight * ss.reps) FILTER (WHERE ss.completed AND ss.set_type <> 'warmup'), 0
        ) AS volume_kg
      FROM session_entries se
      JOIN sessions  s ON se.session_id  = s.id
      JOIN exercises e ON se.exercise_id = e.id
      LEFT JOIN exercise_muscle_overrides mo
             ON mo.exercise_id = e.id AND mo.user_id = s.user_id
      LEFT JOIN strength_sets ss ON ss.session_entry_id = se.id
      WHERE s.user_id = ${userId}
        AND s.status  = 'completed'
        AND s.date   >= ${since}
        ${until ? sql`AND s.date < ${until}` : sql``}
        AND se.kind   = 'exercise'
        AND COALESCE(mo.muscle_group, e.muscle_group) IS NOT NULL
      GROUP BY se.id, mo.muscle_group, e.muscle_group, mo.secondary_muscles, e.secondary_muscles
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

// GET /stats/top-lifts?since=YYYY-MM-DD&until=YYYY-MM-DD
// Returns the top 10 exercises by estimated 1RM (Epley formula: w*(1+reps/30)).
statsRoutes.get('/top-lifts', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  // Bound the scan: default to the last two years so the join chain doesn't
  // traverse a power user's entire training history on every stats view.
  const { since, until } = dateWindow(c.req.query('since'), c.req.query('until'), () =>
    daysAgoISO(2 * 365.25),
  );

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
        ${until ? sql`AND s.date < ${until}` : sql``}
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

// GET /stats/prs?since=YYYY-MM-DD
// Lifts whose best estimated 1RM inside the window beats their best from before
// it — "what you actually improved this month", which no other endpoint answers.
statsRoutes.get('/prs', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const { since, until } = dateWindow(c.req.query('since'), c.req.query('until'), () =>
    daysAgoISO(28),
  );

  // The rules every PR surface applies — completed sessions, completed
  // non-warm-up sets, reps within the estimable range — so a high-rep back-off
  // set can't be celebrated as a record. Defined once and interpolated into both
  // halves below so the two can't drift apart.
  //
  // They used to share a `qualifying` CTE instead, which read better but was the
  // expensive shape: the CTE had no date filter of its own (`since` was applied
  // only downstream) and was referenced twice, so Postgres materialised every
  // set the user had ever logged — name, date, weight and reps — on every call.
  // Splitting it lets `current` use the window and `prior` aggregate to two
  // columns. `prior` still reads all history before `since`, which is inherent
  // to "beat your best ever" and is why a plain date floor was not the fix.
  const e1rm = epleyE1rmSql(sql`ss.weight::numeric`, sql`ss.reps::numeric`);
  const qualifyingFrom = sql`
      FROM strength_sets ss
      JOIN session_entries se ON ss.session_entry_id = se.id
      JOIN sessions s         ON se.session_id = s.id
      JOIN exercises e        ON se.exercise_id = e.id`;
  const qualifyingWhere = sql`
        s.user_id    = ${userId}
        AND s.status     = 'completed'
        AND ss.completed = TRUE
        AND ss.set_type <> 'warmup'
        AND ss.weight    IS NOT NULL
        AND ss.reps      IS NOT NULL
        AND ss.reps     <= ${E1RM_MAX_REPS}`;

  // DISTINCT ON picks the single best set inside the window per exercise; the
  // LEFT JOIN against the pre-window max decides whether it beat anything. A
  // NULL there means no prior qualifying set at all, which counts as a record
  // (a first-ever lift) rather than being filtered out by the comparison.
  const rows = await db.execute(sql`
    WITH current AS (
      SELECT DISTINCT ON (e.id)
        e.id   AS exercise_id,
        e.name AS exercise_name,
        s.date AS date,
        ss.weight::numeric AS weight,
        ss.reps            AS reps,
        ${e1rm}            AS e1rm
      ${qualifyingFrom}
      WHERE ${qualifyingWhere}
        AND s.date >= ${since}
        ${until ? sql`AND s.date < ${until}` : sql``}
      ORDER BY e.id, (${e1rm}) DESC NULLS LAST, s.date ASC
    ),
    prior AS (
      SELECT e.id AS exercise_id, MAX(${e1rm}) AS best_e1rm
      ${qualifyingFrom}
      WHERE ${qualifyingWhere}
        AND s.date < ${since}
      GROUP BY e.id
    )
    SELECT
      c.exercise_id,
      c.exercise_name,
      c.date,
      c.weight::float AS weight,
      c.reps,
      c.e1rm::float   AS e1rm,
      p.best_e1rm::float AS previous_e1rm
    FROM current c
    LEFT JOIN prior p ON p.exercise_id = c.exercise_id
    WHERE p.best_e1rm IS NULL OR c.e1rm > p.best_e1rm
    ORDER BY c.date DESC, c.e1rm DESC
    LIMIT 20
  `);

  const result: PersonalRecordsResponse = {
    since,
    records: (rows as unknown as Array<{
      exercise_id: string;
      exercise_name: string;
      date: string;
      weight: number;
      reps: number;
      e1rm: number;
      previous_e1rm: number | null;
    }>).map((r) => ({
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      weight: r.weight,
      reps: r.reps,
      estimatedOneRepMax: r.e1rm,
      previousOneRepMax: r.previous_e1rm,
      date: r.date,
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

  const { since, until, weeks } = weekWindow(c.req.query('since'), c.req.query('weeks'));

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
      AND s.date    < ${until}::date
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

// GET /stats/totals?until=YYYY-MM-DD
//
// Lifetime training counts. Server-side for the same reason the streak is: the
// client's version read `GET /sessions`, which caps at 200 rows, so the Profile
// tab's "Workouts Completed" simply stopped counting past 200 — and downloaded
// 200 full session rows on every visit to render one integer.
//
// `until` is the exclusive top bound, and it matters even on an all-time total:
// `sessions.date` accepts dates arbitrarily far ahead, so a workout logged with
// a mistyped year would otherwise inflate the count forever. Absent, the window
// is open-ended, matching the other `until`-taking endpoints.
statsRoutes.get('/totals', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const untilParam = c.req.query('until');
  const until = isIsoDate(untilParam) ? untilParam : null;
  const dateBound = until ? sql`AND s.date < ${until}::date` : sql``;

  // One pass over the user's completed sessions. The two EXISTS filters give the
  // gym/mat split without a join that would multiply rows per entry.
  const [totalsRow] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS sessions,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM session_entries e
          WHERE e.session_id = s.id AND e.kind = 'exercise'
        )
      )::int AS gym_sessions,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM session_entries e
          WHERE e.session_id = s.id AND e.kind = 'martial_arts'
        )
      )::int AS mat_sessions,
      MIN(s.date)::text AS first_session_date
    FROM sessions s
    WHERE s.user_id = ${userId}
      AND s.status  = 'completed'
      ${dateBound}
  `)) as unknown as Array<{
    sessions: number;
    gym_sessions: number;
    mat_sessions: number;
    first_session_date: string | null;
  }>;

  // Counts every completed set, warm-ups included, to match
  // shared/src/calculators/volume.ts and the per-session figure on the session
  // list. The `set_type <> 'warmup'` rule in CLAUDE.md governs the aggregates
  // that *compare* lifts — muscles, top lifts, PRs — where a ramp-up would
  // distort the comparison. Total workload is not one of those.
  const [volumeRow] = (await db.execute(sql`
    SELECT COALESCE(SUM(ss.weight * ss.reps), 0)::float8 AS volume_kg
    FROM strength_sets ss
    JOIN session_entries se ON se.id = ss.session_entry_id
    JOIN sessions       s  ON s.id  = se.session_id
    WHERE s.user_id  = ${userId}
      AND s.status   = 'completed'
      AND ss.completed = true
      ${dateBound}
  `)) as unknown as Array<{ volume_kg: number }>;

  const result: TrainingTotalsResponse = {
    sessions: totalsRow?.sessions ?? 0,
    gymSessions: totalsRow?.gym_sessions ?? 0,
    matSessions: totalsRow?.mat_sessions ?? 0,
    volumeKg: Number(volumeRow?.volume_kg ?? 0),
    firstSessionDate: totalsRow?.first_session_date ?? null,
  };
  return c.json(result);
});

// GET /stats/streak?today=YYYY-MM-DD
// Consecutive Monday-aligned weeks with a completed session, ending at the
// caller's current week. `today` is the device's *local* date — week boundaries
// have to follow the device, same reason /stats/weekly takes a client-computed
// Monday rather than deriving one from UTC.
statsRoutes.get('/streak', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const todayParam = c.req.query('today');
  const today = isIsoDate(todayParam) ? todayParam : new Date().toISOString().slice(0, 10);
  const anchorWeek = mondayOfISO(today);

  // Distinct trained weeks, not sessions: the streak asks "did I train that
  // week", so collapsing in SQL keeps the payload to one short row per week
  // however many sessions each contains.
  //
  // `s.date::timestamp` is cast explicitly rather than left to an implicit
  // date → timestamp promotion: `date_trunc(text, timestamp)` and
  // `date_trunc(text, timestamptz)` are both reachable from `date`, and this
  // endpoint's neighbour already shipped one "operator is not unique" outage.
  // date_trunc('week') is Monday-aligned, matching the client's own week keys.
  //
  // Bounded above at the anchor week so a session dated years into the future —
  // which the schema allows — can't manufacture a streak, and below at the 520
  // weeks the walk can actually use.
  // Grouped rather than DISTINCT so each week can also say whether it held any
  // lifting and whether it held any mat work — the two EXISTS subqueries give
  // that split without a join that would multiply rows per entry, same shape as
  // /stats/totals above. A week that had both counts toward both streaks.
  //
  // These were computed on the client until now, over the 200 most recent
  // sessions, while the combined streak came from here — so one row of three
  // numbers was being served by two sources that could disagree, and did.
  const rows = await db.execute(sql`
    SELECT
      date_trunc('week', s.date::timestamp)::date AS week_start,
      bool_or(EXISTS (
        SELECT 1 FROM session_entries e
        WHERE e.session_id = s.id AND e.kind = 'exercise'
      )) AS has_gym,
      bool_or(EXISTS (
        SELECT 1 FROM session_entries e
        WHERE e.session_id = s.id AND e.kind = 'martial_arts'
      )) AS has_mat
    FROM sessions s
    WHERE s.user_id = ${userId}
      AND s.status  = 'completed'
      AND s.date   >= ${addDaysISO(anchorWeek, -520 * 7)}::date
      AND s.date    < ${addDaysISO(anchorWeek, 7)}::date
    GROUP BY week_start
    ORDER BY week_start DESC
  `);

  const weekRows = rows as unknown as Array<{
    week_start: string;
    has_gym: boolean;
    has_mat: boolean;
  }>;

  const result: WeekStreakResponse = {
    weeks: weekStreak(weekRows.map((r) => r.week_start), anchorWeek),
    anchorWeek,
    gymWeeks: weekStreak(
      weekRows.filter((r) => r.has_gym).map((r) => r.week_start),
      anchorWeek,
    ),
    matWeeks: weekStreak(
      weekRows.filter((r) => r.has_mat).map((r) => r.week_start),
      anchorWeek,
    ),
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

  const { since, until, weeks } = weekWindow(c.req.query('since'), c.req.query('weeks'));

  // The rounds payload is a discriminated jsonb union with a legacy variant,
  // so aggregation happens in TS (reusing the shared isRoundsSession guard)
  // rather than triple-implementing the schema in SQL. Volume is bounded by
  // the window: tens of entries, not thousands — which only holds because
  // `until` is passed. aggregateMatStats drops out-of-window rows anyway, so
  // omitting it was invisible in the response and expensive in the query.
  const entryRows = await fetchMatEntries(db, userId, since, until);

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

  const { since, until } = dateWindow(c.req.query('since'), c.req.query('until'), () =>
    daysAgoISO(365),
  );

  const [entryRows, partnerRows] = await Promise.all([
    fetchMatEntries(db, userId, since, until),
    db.select({ id: partners.id, name: partners.name }).from(partners).where(eq(partners.userId, userId)),
  ]);

  const result: PartnerStatsResponse = {
    since,
    partners: aggregatePartnerStats(entryRows, partnerRows),
  };
  return c.json(result);
});

/**
 * Completed martial-arts entries (with session date/duration) over [since, until).
 *
 * `until` is exclusive and worth passing whenever the caller has one: this pulls
 * whole `details` JSONB payloads across the wire into the Worker, and /stats/mat
 * then discards everything outside its buckets anyway. Left open-ended it means
 * `?since=1990-01-01&weeks=8` reads a user's entire mat history to render eight
 * weeks — and the follow-up `inArray` binds one parameter per session it found.
 */
function fetchMatEntries(
  db: ReturnType<typeof getDb>,
  userId: string,
  since: string,
  until: string | null = null,
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
        ...(until ? [lt(sessions.date, until)] : []),
      ),
    );
}

export { statsRoutes };
