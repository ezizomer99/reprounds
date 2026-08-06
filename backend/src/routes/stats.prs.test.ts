import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  execute: vi.fn(),
  select: vi.fn(),
  selectDistinct: vi.fn(),
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    execute: mock.execute,
    select: mock.select,
    selectDistinct: mock.selectDistinct,
  }),
}));

import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { E1RM_MAX_REPS } from '@app/shared';
import type { PersonalRecordsResponse } from '@app/shared';
import { statsRoutes } from './stats';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-pr-feed';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const dialect = new PgDialect();

function issuedQuery(): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(mock.execute.mock.calls[0]?.[0] as SQL);
  return { sql: q.sql.replace(/\s+/g, ' ').trim(), params: q.params };
}

function makeApp() {
  const app = new Hono();
  app.route('/stats', statsRoutes);
  return app;
}

async function bearer() {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

async function callPRs(query = '?since=2026-06-01') {
  const res = await makeApp().request(`/stats/prs${query}`, { headers: await bearer() }, env);
  return { res, body: (await res.json()) as PersonalRecordsResponse };
}

beforeEach(() => {
  for (const fn of [mock.findFirst, mock.execute, mock.select, mock.selectDistinct]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.execute.mockResolvedValue([]);
});

describe('GET /stats/prs', () => {
  it('maps rows through and echoes the window', async () => {
    mock.execute.mockResolvedValue([
      {
        exercise_id: 'e1',
        exercise_name: 'Bench Press',
        date: '2026-06-20',
        weight: 100,
        reps: 3,
        e1rm: 110,
        previous_e1rm: 105,
      },
    ]);
    const { res, body } = await callPRs();
    expect(res.status).toBe(200);
    expect(body.since).toBe('2026-06-01');
    expect(body.records).toEqual([
      {
        exerciseId: 'e1',
        exerciseName: 'Bench Press',
        weight: 100,
        reps: 3,
        estimatedOneRepMax: 110,
        previousOneRepMax: 105,
        date: '2026-06-20',
      },
    ]);
  });

  // A first-ever lift has no prior max to beat. Comparing NULL with > would drop
  // it silently, so the WHERE has to admit it explicitly.
  it('treats a first-ever qualifying lift as a record', async () => {
    mock.execute.mockResolvedValue([
      {
        exercise_id: 'e2',
        exercise_name: 'Front Squat',
        date: '2026-06-10',
        weight: 80,
        reps: 5,
        e1rm: 93.3,
        previous_e1rm: null,
      },
    ]);
    const { body } = await callPRs();
    expect(body.records[0].previousOneRepMax).toBeNull();
    expect(issuedQuery().sql).toContain('p.best_e1rm IS NULL OR c.e1rm > p.best_e1rm');
  });

  it('splits the window on since for the current and prior maxima', async () => {
    await callPRs('?since=2026-06-01');
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.date >= $');
    expect(sql).toContain('s.date < $');
    expect(params.filter((p) => p === '2026-06-01')).toHaveLength(2);
  });

  // `current` and `prior` used to share a `qualifying` CTE that had no date
  // filter of its own and was referenced twice, so Postgres materialised every
  // set the user had ever logged — name, date, weight, reps — on every call.
  // The rules now live in one interpolated fragment instead, so the two halves
  // still can't drift while each scans only what it needs.
  it('does not funnel both halves through one unbounded CTE', async () => {
    await callPRs('?since=2026-06-01');
    const { sql } = issuedQuery();
    expect(sql).not.toContain('qualifying');
    // Both halves carry the full qualifying predicate, not just one.
    expect(sql.match(/ss\.set_type <> 'warmup'/g)).toHaveLength(2);
    expect(sql.match(/s\.status = 'completed'/g)).toHaveLength(2);
  });

  // Session dates are accepted arbitrarily far into the future, so without a
  // ceiling a mistyped year becomes a brand-new PR — and lands first, because
  // the feed orders by date descending.
  it('bounds the current window at the top when until is given', async () => {
    await callPRs('?since=2026-06-01&until=2026-06-29');
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.date < $');
    expect(params).toContain('2026-06-29');
  });

  it('leaves the window open-ended when until is absent or invalid', async () => {
    for (const q of ['?since=2026-06-01', '?since=2026-06-01&until=nope']) {
      await callPRs(q);
      const { params } = issuedQuery();
      // Only `since`, bound once for `current` and once for `prior`.
      expect(params.filter((p) => typeof p === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p)))
        .toHaveLength(2);
    }
  });

  // Every other PR surface applies these; a feed that celebrated a warm-up or a
  // 20-rep back-off set as a record would be worse than no feed.
  it('applies the same qualifying rules as the other PR surfaces', async () => {
    await callPRs();
    const { sql, params } = issuedQuery();
    expect(sql).toContain("s.status = 'completed'");
    expect(sql).toContain('ss.completed = TRUE');
    expect(sql).toContain("ss.set_type <> 'warmup'");
    expect(sql).toContain('ss.reps <= $');
    expect(params).toContain(E1RM_MAX_REPS);
  });

  it('picks one row per exercise, best first, and bounds the result', async () => {
    await callPRs();
    const { sql } = issuedQuery();
    expect(sql).toContain('DISTINCT ON (e.id)');
    expect(sql).toContain('DESC NULLS LAST');
    expect(sql).toContain('LIMIT 20');
  });

  it('scopes to the caller', async () => {
    await callPRs();
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.user_id = $');
    expect(params).toContain(USER_ID);
  });

  it('falls back to a valid window when since is missing or malformed', async () => {
    for (const q of ['', '?since=not-a-date', '?since=2026-02-30']) {
      mock.execute.mockClear();
      const { res, body } = await callPRs(q);
      expect(res.status).toBe(200);
      expect(body.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns an empty list rather than erroring when nothing improved', async () => {
    const { res, body } = await callPRs();
    expect(res.status).toBe(200);
    expect(body.records).toEqual([]);
  });

  it('requires auth', async () => {
    const res = await makeApp().request('/stats/prs', {}, env);
    expect(res.status).toBe(401);
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
