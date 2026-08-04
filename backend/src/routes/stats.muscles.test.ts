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
import { statsRoutes } from './stats';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-m';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const dialect = new PgDialect();

/** The SQL the route handed the driver, flattened to text + bound params. */
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

beforeEach(() => {
  for (const fn of [mock.findFirst, mock.execute, mock.select, mock.selectDistinct]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.execute.mockResolvedValue([]);
});

describe('GET /stats/muscles', () => {
  it('maps sets and volume through to the response', async () => {
    mock.execute.mockResolvedValue([
      { muscle_group: 'Chest', secondary_muscles: ['Triceps'], sets: 8, volume_kg: 3200 },
      { muscle_group: 'Biceps', secondary_muscles: null, sets: 1, volume_kg: 150 },
    ]);

    const res = await makeApp().request('/stats/muscles?since=2026-08-03', { headers: await bearer() }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      muscles: [
        { muscleGroup: 'Chest', secondaryMuscles: ['Triceps'], sets: 8, volumeKg: 3200 },
        // A null secondary_muscles array becomes [], never null.
        { muscleGroup: 'Biceps', secondaryMuscles: [], sets: 1, volumeKg: 150 },
      ],
    });
  });

  // The whole point of the rewrite: this was a selectDistinct, so eight sets of
  // bench and one set of curls arrived as one row each and weighed the same.
  it('aggregates by completed sets rather than returning distinct rows', async () => {
    await makeApp().request('/stats/muscles?since=2026-08-03', { headers: await bearer() }, env);
    const { sql } = issuedQuery();
    expect(sql).toContain('FILTER (WHERE ss.completed)');
    expect(sql).toContain('GROUP BY se.id, e.muscle_group, e.secondary_muscles');
    expect(mock.selectDistinct).not.toHaveBeenCalled();
  });

  // An entry with no strength_sets at all (conditioning work) must survive the
  // LEFT JOIN with a floor of one set instead of dropping out of the map.
  it('floors an entry with no sets at 1', async () => {
    await makeApp().request('/stats/muscles?since=2026-08-03', { headers: await bearer() }, env);
    expect(issuedQuery().sql).toContain('GREATEST(COUNT(ss.id) FILTER (WHERE ss.completed), 1)');
  });

  it('bounds the window at both ends when until is given', async () => {
    await makeApp().request(
      '/stats/muscles?since=2026-08-03&until=2026-08-10',
      { headers: await bearer() },
      env,
    );
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.date >= $');
    // Exclusive: next Monday belongs to next week, not this one.
    expect(sql).toContain('s.date < $');
    expect(params).toContain('2026-08-03');
    expect(params).toContain('2026-08-10');
  });

  // `>= since` alone counted a completed session dated ahead of the window —
  // session dates are accepted years into the future — so a workout logged
  // forward showed up under "Muscles This Week".
  it('omits the upper bound when until is absent or invalid', async () => {
    await makeApp().request('/stats/muscles?since=2026-08-03', { headers: await bearer() }, env);
    expect(issuedQuery().sql).not.toContain('s.date < $');

    mock.execute.mockClear();
    await makeApp().request(
      '/stats/muscles?since=2026-08-03&until=2026-02-30',
      { headers: await bearer() },
      env,
    );
    expect(issuedQuery().sql).not.toContain('s.date < $');
  });

  it('falls back to a default window on a malformed since instead of 500ing', async () => {
    for (const bad of ['not-a-date', '2026-13-01', '2026-02-30', '']) {
      mock.execute.mockClear();
      const res = await makeApp().request(
        `/stats/muscles?since=${encodeURIComponent(bad)}`,
        { headers: await bearer() },
        env,
      );
      expect(res.status).toBe(200);
      // Whatever it fell back to, it must still be a real ISO date.
      const since = issuedQuery().params[1];
      expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('scopes to the caller and to completed sessions only', async () => {
    await makeApp().request('/stats/muscles?since=2026-08-03', { headers: await bearer() }, env);
    const { sql, params } = issuedQuery();
    expect(sql).toContain('s.user_id = $');
    expect(sql).toContain("s.status = 'completed'");
    expect(sql).toContain("se.kind = 'exercise'");
    expect(params[0]).toBe(USER_ID);
  });

  it('requires auth', async () => {
    const res = await makeApp().request('/stats/muscles', {}, env);
    expect(res.status).toBe(401);
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
