/**
 * The /stats endpoints against a real Postgres.
 *
 * Every other stats test mocks `db.execute` and asserts on the rendered SQL
 * string, so no query is ever parsed, planned or run. That is a real gap, not a
 * theoretical one: `${since}::date + ${weeks * 7}` looked correct in the string
 * and failed on every single call against an actual server, because postgres-js
 * binds a JS number with an unspecified type OID and Postgres cannot resolve
 * `date + unknown`. The suite was green throughout.
 *
 * These tests only run when STATS_IT_DATABASE_URL points at a throwaway
 * database with the migrations applied:
 *
 *     backend/scripts/with-test-postgres.sh pnpm --filter backend test:integration
 *
 * Without it they skip, so `pnpm test` stays runnable anywhere.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type {
  MatStatsResponse,
  MuscleSummaryResponse,
  PersonalRecordsResponse,
  TopLiftsResponse,
  WeeklyStatsResponse,
  WeekStreakResponse,
} from '@app/shared';
import { statsRoutes } from './stats';
import { signJwt } from '../lib/jwt';
import { createDb } from '../db';

const DATABASE_URL = process.env.STATS_IT_DATABASE_URL;
const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

const suite = DATABASE_URL ? describe : describe.skip;

suite('/stats against a real database', () => {
  const db = createDb(DATABASE_URL ?? 'postgres://unused');
  const env = { JWT_SECRET: SECRET, DATABASE_URL };
  let userId = '';
  let benchId = '';
  let disciplineId = '';

  async function get<T>(path: string): Promise<{ status: number; body: T }> {
    const app = new Hono();
    app.route('/stats', statsRoutes);
    const token = await signJwt({ sub: userId }, SECRET, 3600);
    const res = await app.request(path, { headers: { Authorization: `Bearer ${token}` } }, env);
    return { status: res.status, body: (await res.json()) as T };
  }

  /** One completed session on `date` with the given sets against Bench Press. */
  async function logSession(
    date: string,
    sets: { weight: number; reps: number; type?: 'normal' | 'warmup' }[],
  ) {
    const [s] = (await db.execute(sql`
      INSERT INTO sessions (user_id, date, status) VALUES (${userId}, ${date}, 'completed')
      RETURNING id`)) as unknown as Array<{ id: string }>;
    const [e] = (await db.execute(sql`
      INSERT INTO session_entries (session_id, kind, exercise_id, order_index)
      VALUES (${s.id}, 'exercise', ${benchId}, 0) RETURNING id`)) as unknown as Array<{ id: string }>;
    let n = 0;
    for (const set of sets) {
      n += 1;
      await db.execute(sql`
        INSERT INTO strength_sets (session_entry_id, set_number, set_type, weight, reps, completed)
        VALUES (${e.id}, ${n}, ${set.type ?? 'normal'}, ${set.weight}, ${set.reps}, TRUE)`);
    }
    return s.id;
  }

  /** One completed martial-arts session on `date`. */
  async function logMatSession(date: string) {
    const [s] = (await db.execute(sql`
      INSERT INTO sessions (user_id, date, status) VALUES (${userId}, ${date}, 'completed')
      RETURNING id`)) as unknown as Array<{ id: string }>;
    await db.execute(sql`
      INSERT INTO session_entries (session_id, kind, discipline_id, order_index)
      VALUES (${s.id}, 'martial_arts', ${disciplineId}, 0)`);
    return s.id;
  }

  beforeAll(async () => {
    // client_min_messages: TRUNCATE ... CASCADE emits a NOTICE per cascaded
    // table, and postgres-js logs each one — a dozen lines of noise per run.
    await db.execute(sql`SET client_min_messages TO WARNING`);
    await db.execute(sql`TRUNCATE users, exercises RESTART IDENTITY CASCADE`);
    const [u] = (await db.execute(sql`
      INSERT INTO users (email, name) VALUES ('it@test.local', 'IT') RETURNING id`)) as unknown as Array<{ id: string }>;
    userId = u.id;
    const [ex] = (await db.execute(sql`
      INSERT INTO exercises (name, type, muscle_group, secondary_muscles)
      VALUES ('Bench Press', 'strength', 'Chest', ARRAY['Triceps'])
      RETURNING id`)) as unknown as Array<{ id: string }>;
    benchId = ex.id;
    const [d] = (await db.execute(sql`
      INSERT INTO disciplines (name, category) VALUES ('BJJ', 'grappling')
      RETURNING id`)) as unknown as Array<{ id: string }>;
    disciplineId = d.id;

    // Window is 2026-06-01 (a Monday) for four weeks → ends 2026-06-29.
    await logSession('2026-06-02', [
      { weight: 60, reps: 10, type: 'warmup' },
      { weight: 60, reps: 10, type: 'warmup' },
      { weight: 100, reps: 5 },
    ]);
    await logSession('2026-06-16', [{ weight: 105, reps: 5 }]);
    // Deliberately past the window's end — and dated years out, the shape a
    // mistyped year produces.
    await logSession('2030-08-01', [{ weight: 200, reps: 1 }]);
  });

  // The bug that started all of this. It is not enough to assert the SQL string;
  // the query has to reach the server and come back.
  it('GET /weekly buckets the window and excludes what falls outside it', async () => {
    const { status, body } = await get<WeeklyStatsResponse>(
      '/stats/weekly?since=2026-06-01&weeks=4',
    );
    expect(status).toBe(200);
    expect(body.weeks.map((w) => w.weekStart)).toEqual([
      '2026-06-01',
      '2026-06-08',
      '2026-06-15',
      '2026-06-22',
    ]);
    expect(body.weeks.map((w) => w.sessions)).toEqual([1, 0, 1, 0]);
    // Warm-ups still count toward tonnage and completed sets — /weekly measures
    // work done, not qualifying work. 60*10*2 + 100*5 = 1700.
    expect(body.weeks[0].volumeKg).toBe(1700);
    expect(body.weeks[0].completedSets).toBe(3);
  });

  it('GET /weekly survives every fallback path', async () => {
    for (const q of ['', '?weeks=', '?weeks=abc', '?since=2026-02-30', '?weeks=520']) {
      const { status } = await get<WeeklyStatsResponse>(`/stats/weekly${q}`);
      expect(status, `query ${q || '(none)'}`).toBe(200);
    }
  });

  // A 52-week window from 9999-12-01 crosses year 10000, where toISOString()
  // switches to the expanded `+010000-…` form; slicing that yielded a string
  // Postgres rejects as a date.
  it('GET /weekly does not 500 on a window that crosses year 10000', async () => {
    const { status } = await get<WeeklyStatsResponse>('/stats/weekly?since=9999-12-01&weeks=52');
    expect(status).toBe(200);
  });

  it('GET /muscles counts working sets only, not warm-ups', async () => {
    const { status, body } = await get<MuscleSummaryResponse>(
      '/stats/muscles?since=2026-06-01&until=2026-06-29',
    );
    expect(status).toBe(200);
    const chest = body.muscles.find((m) => m.muscleGroup === 'Chest');
    expect(chest).toBeDefined();
    // Two sessions, one working set each. The two warm-ups on 2026-06-02 used to
    // land here and make the heat map a picture of warm-up habits.
    expect(chest!.sets).toBe(2);
    expect(chest!.volumeKg).toBe(100 * 5 + 105 * 5);
    expect(chest!.secondaryMuscles).toEqual(['Triceps']);
  });

  it('GET /muscles bounds the window at the top', async () => {
    const bounded = await get<MuscleSummaryResponse>(
      '/stats/muscles?since=2026-06-01&until=2026-06-29',
    );
    const open = await get<MuscleSummaryResponse>('/stats/muscles?since=2026-06-01');
    const setsOf = (b: MuscleSummaryResponse) =>
      b.muscles.find((m) => m.muscleGroup === 'Chest')?.sets ?? 0;
    expect(setsOf(open.body)).toBeGreaterThan(setsOf(bounded.body));
  });

  it('GET /top-lifts keeps a future-dated session off the board', async () => {
    const bounded = await get<TopLiftsResponse>(
      '/stats/top-lifts?since=2026-06-01&until=2026-06-29',
    );
    expect(bounded.status).toBe(200);
    // 105 × 5 is the best qualifying lift inside the window; the 200 kg single
    // is dated 2030 and must not place.
    expect(bounded.body.lifts).toHaveLength(1);
    expect(bounded.body.lifts[0].weight).toBe(105);

    const open = await get<TopLiftsResponse>('/stats/top-lifts?since=2026-06-01');
    expect(open.body.lifts[0].weight).toBe(200);
  });

  it('GET /prs compares the window against everything before it', async () => {
    // 2026-06-16's 105×5 beats 2026-06-02's 100×5.
    const { status, body } = await get<PersonalRecordsResponse>(
      '/stats/prs?since=2026-06-10&until=2026-06-29',
    );
    expect(status).toBe(200);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].weight).toBe(105);
    expect(body.records[0].previousOneRepMax).toBeGreaterThan(0);
  });

  it('GET /prs reports a first-ever qualifying lift as a record', async () => {
    const { body } = await get<PersonalRecordsResponse>(
      '/stats/prs?since=2026-06-01&until=2026-06-29',
    );
    expect(body.records[0].previousOneRepMax).toBeNull();
  });

  it('GET /prs keeps a future-dated session out of the current window', async () => {
    const bounded = await get<PersonalRecordsResponse>(
      '/stats/prs?since=2026-06-01&until=2026-06-29',
    );
    expect(bounded.body.records.some((r) => r.date.startsWith('2030'))).toBe(false);

    // Unbounded, the mistyped year is the newest "PR" and sorts first.
    const open = await get<PersonalRecordsResponse>('/stats/prs?since=2026-06-01');
    expect(open.body.records[0].date.startsWith('2030')).toBe(true);
  });

  it('GET /mat returns an empty window rather than erroring with no mat entries', async () => {
    const { status, body } = await get<MatStatsResponse>('/stats/mat?since=2026-06-01&weeks=4');
    expect(status).toBe(200);
    expect(body.weeks).toHaveLength(4);
    expect(body.totals.sessions).toBe(0);
    // The four declared keys and nothing else.
    expect(Object.keys(body.intensity).sort()).toEqual(['hard', 'light', 'medium', 'unspecified']);
  });

  it('GET /partners answers without a partner row', async () => {
    const { status } = await get<{ partners: unknown[] }>('/stats/partners?since=2026-06-01');
    expect(status).toBe(200);
  });

  // date_trunc('week', …) has to agree with the client's Monday-aligned keys,
  // and the explicit ::timestamp cast has to resolve — `date` promotes to both
  // timestamp and timestamptz, which is the same ambiguity class as the bug
  // above.
  it('GET /streak counts Monday-aligned weeks with the grace rule', async () => {
    // Sessions exist in the weeks of 2026-06-01 and 2026-06-15. Anchoring on the
    // week of 2026-06-15 gives that week plus grace-free 06-08 → breaks at 1.
    const broken = await get<WeekStreakResponse>('/stats/streak?today=2026-06-17');
    expect(broken.status).toBe(200);
    expect(broken.body.anchorWeek).toBe('2026-06-15');
    expect(broken.body.weeks).toBe(1);

    // Anchoring a week later: nothing that week, grace covers it, then 06-15
    // counts and 06-08 is empty → 1.
    const graced = await get<WeekStreakResponse>('/stats/streak?today=2026-06-24');
    expect(graced.body.weeks).toBe(1);

    // Two weeks on, grace covers the current week but the one before it is
    // empty, so the run is over.
    const over = await get<WeekStreakResponse>('/stats/streak?today=2026-07-01');
    expect(over.body.weeks).toBe(0);
  });

  it('GET /streak counts consecutive weeks', async () => {
    for (const d of ['2026-06-08', '2026-06-22']) await logSession(d, [{ weight: 80, reps: 5 }]);
    const { body } = await get<WeekStreakResponse>('/stats/streak?today=2026-06-24');
    // Weeks of 06-22, 06-15, 06-08, 06-01 are now all trained.
    expect(body.weeks).toBe(4);
  });

  // bool_or over a GROUP BY with two correlated EXISTS subqueries — none of
  // which the mocked stats tests can exercise, since they only assert on the
  // rendered SQL string.
  it('GET /streak splits the run into gym and mat weeks', async () => {
    // Mat work in the weeks of 06-15 and 06-22 only; gym work in all four.
    for (const d of ['2026-06-16', '2026-06-23']) await logMatSession(d);

    const { body } = await get<WeekStreakResponse>('/stats/streak?today=2026-06-24');
    expect(body.weeks).toBe(4);
    expect(body.gymWeeks).toBe(4);
    expect(body.matWeeks).toBe(2);
  });

  it('GET /streak reports zero rather than omitting a kind never trained', async () => {
    // Anchored on a week with no mat work behind it, matWeeks must be a real 0 —
    // the client renders a dash for `undefined`, which would be a lie here.
    const { body } = await get<WeekStreakResponse>('/stats/streak?today=2026-06-10');
    expect(body.gymWeeks).toBe(2);
    expect(body.matWeeks).toBe(0);
  });

  it('every endpoint requires auth', async () => {
    const app = new Hono();
    app.route('/stats', statsRoutes);
    for (const path of ['/stats/weekly', '/stats/muscles', '/stats/top-lifts', '/stats/prs', '/stats/mat', '/stats/partners', '/stats/streak']) {
      const res = await app.request(path, {}, env);
      expect(res.status, path).toBe(401);
    }
  });
});
