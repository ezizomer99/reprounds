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
import { statsRoutes } from './stats';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-tl';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const dialect = new PgDialect();

function issuedQuery(): { sql: string; params: unknown[] } {
  const arg = mock.execute.mock.calls[0]?.[0] as SQL;
  const q = dialect.sqlToQuery(arg);
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

async function callTopLifts(query = '') {
  return makeApp().request(`/stats/top-lifts${query}`, { headers: await bearer() }, env);
}

beforeEach(() => {
  for (const fn of [mock.findFirst, mock.execute, mock.select, mock.selectDistinct]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.execute.mockResolvedValue([]);
});

describe('GET /stats/top-lifts', () => {
  // Epley is a low-rep extrapolation. Unbounded, it valued a 60kg x 20 back-off
  // set at 100kg — above a genuine 100kg x 3 — and put it at the top of the board.
  it('excludes sets above the rep cap from the leaderboard', async () => {
    await callTopLifts();
    const { sql, params } = issuedQuery();
    expect(sql).toContain('ss.reps <= $');
    expect(params).toContain(E1RM_MAX_REPS);
  });

  it('excludes warm-up sets', async () => {
    await callTopLifts();
    expect(issuedQuery().sql).toContain("ss.set_type <> 'warmup'");
  });

  // Session dates are accepted arbitrarily far into the future, so an open-ended
  // top bound let a workout logged with a mistyped year onto the board. The
  // board is range-scoped, so the client sends both ends.
  it('bounds the window at the top when until is given', async () => {
    await callTopLifts('?since=2026-06-01&until=2026-06-29');
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.date >= $');
    expect(sql).toContain('s.date < $');
    expect(params).toContain('2026-06-01');
    expect(params).toContain('2026-06-29');
  });

  it('stays open-ended when until is absent or malformed', async () => {
    for (const q of ['?since=2026-06-01', '?since=2026-06-01&until=2026-02-30']) {
      await callTopLifts(q);
      const { sql } = issuedQuery();
      expect(sql).toContain('s.date >= $');
      expect(sql).not.toContain('s.date < $');
    }
  });

  // Postgres sorts NULLS FIRST on a DESC order. Without this the unestimable
  // sets — the exact rows the cap exists to reject — sort to the very top.
  it('orders NULLS LAST on both the per-exercise pick and the final ranking', async () => {
    await callTopLifts();
    const { sql } = issuedQuery();
    const orderings = sql.match(/DESC(?! NULLS LAST)/g) ?? [];
    expect(orderings).toHaveLength(0);
    expect(sql).toContain('ORDER BY e.id, (CASE');
    expect((sql.match(/DESC NULLS LAST/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('still scopes to the caller and to completed sessions', async () => {
    await callTopLifts();
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.user_id = $');
    expect(sql).toContain("s.status = 'completed'");
    // Positional indexing would be wrong here: the e1rm CASE is interpolated
    // into the SELECT list, so its rep cap binds ahead of the user id.
    expect(params).toContain(USER_ID);
  });

  it('caps the board at 10 and maps rows through', async () => {
    mock.execute.mockResolvedValue([
      { exercise_id: 'e1', exercise_name: 'Squat', weight: 140, reps: 3, estimated_1rm: 154 },
    ]);
    const res = await callTopLifts();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      lifts: [
        {
          exerciseId: 'e1',
          exerciseName: 'Squat',
          weight: 140,
          reps: 3,
          estimatedOneRepMax: 154,
        },
      ],
    });
    expect(issuedQuery().sql).toContain('LIMIT 10');
  });

  it('requires auth', async () => {
    const res = await makeApp().request('/stats/top-lifts', {}, env);
    expect(res.status).toBe(401);
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
