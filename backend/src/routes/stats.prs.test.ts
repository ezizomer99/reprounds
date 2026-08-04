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
    expect(sql).toContain('WHERE date >= $');
    expect(sql).toContain('WHERE date < $');
    expect(params.filter((p) => p === '2026-06-01')).toHaveLength(2);
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
    expect(sql).toContain('DISTINCT ON (exercise_id)');
    expect(sql).toContain('e1rm DESC NULLS LAST');
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
