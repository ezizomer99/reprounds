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
import type { TrainingTotalsResponse } from '@app/shared';
import { statsRoutes } from './stats';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-totals';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const dialect = new PgDialect();

/** The rendered SQL of the nth db.execute call, whitespace-collapsed. */
function issuedQuery(index: number): { sql: string; params: unknown[] } {
  const q = dialect.sqlToQuery(mock.execute.mock.calls[index]?.[0] as SQL);
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

async function callTotals(query = '') {
  const res = await makeApp().request(`/stats/totals${query}`, { headers: await bearer() }, env);
  return { res, body: (await res.json()) as TrainingTotalsResponse };
}

/** Queues the totals row then the volume row, in the order the handler asks. */
function queueRows(
  totals: Partial<{
    sessions: number;
    gym_sessions: number;
    mat_sessions: number;
    first_session_date: string | null;
  }> = {},
  volumeKg = 0,
) {
  mock.execute
    .mockResolvedValueOnce([
      {
        sessions: 0,
        gym_sessions: 0,
        mat_sessions: 0,
        first_session_date: null,
        ...totals,
      },
    ])
    .mockResolvedValueOnce([{ volume_kg: volumeKg }]);
}

beforeEach(() => {
  for (const fn of [mock.findFirst, mock.execute, mock.select, mock.selectDistinct]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.execute.mockResolvedValue([]);
});

describe('GET /stats/totals', () => {
  it('requires authentication', async () => {
    const res = await makeApp().request('/stats/totals', {}, env);
    expect(res.status).toBe(401);
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it('returns the counts the Profile card needs', async () => {
    queueRows(
      { sessions: 412, gym_sessions: 300, mat_sessions: 130, first_session_date: '2024-03-04' },
      1_234_567,
    );
    const { res, body } = await callTotals();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      sessions: 412,
      gymSessions: 300,
      matSessions: 130,
      volumeKg: 1_234_567,
      firstSessionDate: '2024-03-04',
    });
  });

  it('counts past 200, which is the whole reason this endpoint exists', async () => {
    // The client-side version read GET /sessions, which caps at 200 rows.
    queueRows({ sessions: 987 });
    const { body } = await callTotals();
    expect(body.sessions).toBe(987);
  });

  it('scopes every query to the caller', async () => {
    queueRows();
    await callTotals();
    for (const i of [0, 1]) {
      expect(issuedQuery(i).sql).toContain('s.user_id');
      expect(issuedQuery(i).params).toContain(USER_ID);
    }
  });

  it('counts only completed sessions', async () => {
    queueRows();
    await callTotals();
    for (const i of [0, 1]) {
      expect(issuedQuery(i).sql).toContain("s.status = 'completed'");
    }
  });

  it('counts only completed sets towards volume', async () => {
    queueRows();
    await callTotals();
    expect(issuedQuery(1).sql).toContain('ss.completed = true');
  });

  it('bounds both queries above when until is given', async () => {
    // sessions.date takes dates arbitrarily far ahead, so an unbounded top
    // lets a mistyped year inflate a lifetime total permanently.
    queueRows();
    await callTotals('?until=2026-08-10');
    for (const i of [0, 1]) {
      expect(issuedQuery(i).sql).toContain('s.date <');
      expect(issuedQuery(i).params).toContain('2026-08-10');
    }
  });

  it('ignores a malformed until rather than passing it through', async () => {
    queueRows();
    await callTotals('?until=10-08-2026');
    expect(issuedQuery(0).sql).not.toContain('s.date <');
    expect(issuedQuery(0).params).not.toContain('10-08-2026');
  });

  it('reports zeroes for an account that has never trained', async () => {
    queueRows();
    const { body } = await callTotals();
    expect(body).toEqual({
      sessions: 0,
      gymSessions: 0,
      matSessions: 0,
      volumeKg: 0,
      firstSessionDate: null,
    });
  });

  it('survives an empty result set without producing NaN', async () => {
    mock.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const { body } = await callTotals();
    expect(body.sessions).toBe(0);
    expect(body.volumeKg).toBe(0);
    expect(Number.isNaN(body.volumeKg)).toBe(false);
  });
});
