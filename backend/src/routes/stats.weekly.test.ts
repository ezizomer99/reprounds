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
import type { WeeklyStatsResponse } from '@app/shared';
import { statsRoutes } from './stats';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-wk';
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

async function callWeekly(query = '?since=2026-06-01&weeks=8') {
  const res = await makeApp().request(`/stats/weekly${query}`, { headers: await bearer() }, env);
  return { res, body: (await res.json()) as WeeklyStatsResponse };
}

beforeEach(() => {
  for (const fn of [mock.findFirst, mock.execute, mock.select, mock.selectDistinct]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.execute.mockResolvedValue([]);
});

describe('GET /stats/weekly', () => {
  it('returns one bucket per requested week, oldest first', async () => {
    const { res, body } = await callWeekly();
    expect(res.status).toBe(200);
    expect(body.weeks).toHaveLength(8);
    expect(body.weeks[0].weekStart).toBe('2026-06-01');
  });

  // The mat endpoint clamped weeks to 26, so a one-year range was silently
  // served six months of data. Both weekly endpoints share the parser now.
  it('serves a full 52-week window', async () => {
    const { body } = await callWeekly('?since=2026-01-05&weeks=52');
    expect(body.weeks).toHaveLength(52);
  });

  it('clamps beyond a year rather than scanning further', async () => {
    const { body } = await callWeekly('?since=2026-01-05&weeks=520');
    expect(body.weeks).toHaveLength(52);
  });

  // Number('') is 0, which passes Number.isInteger and clamped to one week, so
  // `?weeks=` used to return a single bucket instead of the default.
  it('falls back to the default for a missing, empty or junk weeks param', async () => {
    for (const q of ['?since=2026-06-01', '?since=2026-06-01&weeks=', '?since=2026-06-01&weeks=abc']) {
      const { body } = await callWeekly(q);
      expect(body.weeks).toHaveLength(8);
    }
  });

  it('falls back to a real Monday when since is malformed', async () => {
    const { res, body } = await callWeekly('?since=2026-02-30&weeks=4');
    expect(res.status).toBe(200);
    expect(body.weeks).toHaveLength(4);
    const parsed = new Date(body.weeks[0].weekStart + 'T00:00:00Z');
    expect(parsed.getUTCDay()).toBe(1);
  });

  it('maps aggregated rows onto their buckets and zero-fills the rest', async () => {
    mock.execute.mockResolvedValue([
      { bucket: 0, sessions: 3, volume_kg: 5400.5, completed_sets: 42 },
      { bucket: 2, sessions: 1, volume_kg: 900, completed_sets: 8 },
    ]);
    const { body } = await callWeekly('?since=2026-06-01&weeks=4');
    expect(body.weeks.map((w) => w.sessions)).toEqual([3, 0, 1, 0]);
    expect(body.weeks[0].volumeKg).toBe(5400.5);
    expect(body.weeks[0].completedSets).toBe(42);
    expect(body.weeks[1]).toEqual({
      weekStart: '2026-06-08',
      sessions: 0,
      volumeKg: 0,
      completedSets: 0,
    });
  });

  // The joins fan a session out to one row per set, so a plain COUNT would
  // report a single heavy session as dozens of sessions.
  it('counts sessions distinctly and bounds the window at both ends', async () => {
    await callWeekly('?since=2026-06-01&weeks=4');
    const { sql, params } = issuedQuery();
    expect(sql).toContain('COUNT(DISTINCT s.id)');
    expect(sql).toContain('s.date >= $');
    expect(sql).toContain('s.date < ($');
    expect(params).toContain(28); // weeks * 7
  });

  it('scopes to the caller and to completed sessions, and counts only completed sets', async () => {
    await callWeekly();
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.user_id = $');
    expect(sql).toContain("s.status = 'completed'");
    expect(sql).toContain('ss.completed = TRUE');
    expect(params).toContain(USER_ID);
  });

  it('requires auth', async () => {
    const res = await makeApp().request('/stats/weekly', {}, env);
    expect(res.status).toBe(401);
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
