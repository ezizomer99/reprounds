import { describe, it, expect, vi, beforeEach } from 'vitest';

// Captures the SQL each select chain is handed so the WHERE/ORDER BY can be
// asserted — these fixes live entirely in query predicates, so a test that only
// checked the JSON would pass with every one of them reverted.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  selectQueue: [] as unknown[][],
  wheres: [] as unknown[],
  orderBys: [] as unknown[],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
  }),
}));

import { Hono } from 'hono';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { E1RM_MAX_REPS } from '@app/shared';
import { exerciseRoutes } from './exercises';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-pr';
const EXERCISE_ID = '33333333-3333-4333-8333-333333333333';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const dialect = new PgDialect();

function flatten(fragment: unknown): string {
  return dialect.sqlToQuery(fragment as SQL).sql.replace(/\s+/g, ' ').trim();
}

/** The WHERE of the best-set query (the first select the route issues). */
function bestSetWhere(): string {
  return flatten(mock.wheres[0]);
}

/** The WHERE of the totalSessions count (the second select). */
function countWhere(): string {
  return flatten(mock.wheres[1]);
}

function bestSetOrderBy(): string {
  return flatten(mock.orderBys[0]);
}

function makeSelectChain() {
  type Chain = {
    from: () => Chain;
    innerJoin: () => Chain;
    where: (arg: unknown) => Chain;
    orderBy: (arg: unknown) => Chain;
    limit: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: (arg) => {
      mock.wheres.push(arg);
      return chain;
    },
    orderBy: (arg) => {
      mock.orderBys.push(arg);
      return chain;
    },
    limit: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

function setRow(over: Record<string, unknown> = {}) {
  return {
    id: 'set-1',
    sessionEntryId: 'entry-1',
    setNumber: 1,
    setType: 'normal',
    reps: 3,
    weight: '100',
    rpe: null,
    rir: null,
    completed: true,
    notes: null,
    ...over,
  };
}

function makeApp() {
  const app = new Hono();
  app.route('/exercises', exerciseRoutes);
  return app;
}

async function bearer() {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

async function callPRs() {
  return makeApp().request(`/exercises/${EXERCISE_ID}/prs`, { headers: await bearer() }, env);
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.wheres.length = 0;
  mock.orderBys.length = 0;
  mock.findFirst.mockReset();
  mock.select.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
});

describe('GET /exercises/:id/prs', () => {
  // This route was the only one of the three that never checked session status —
  // /history and /progression both did. A set logged in a session the user never
  // finished, or later skipped, counted as a personal record permanently.
  it('counts only sets from completed sessions', async () => {
    mock.selectQueue.push([setRow()], [{ totalSessions: 4 }]);
    await callPRs();
    expect(bestSetWhere()).toContain('"status" = $');
  });

  it('counts only completed sessions in totalSessions', async () => {
    mock.selectQueue.push([setRow()], [{ totalSessions: 4 }]);
    await callPRs();
    expect(countWhere()).toContain('"status" = $');
  });

  it('excludes warm-up sets from the PR', async () => {
    mock.selectQueue.push([setRow()], [{ totalSessions: 1 }]);
    await callPRs();
    expect(bestSetWhere()).toContain('<> $');
  });

  // Postgres sorts NULLS FIRST on DESC, so without this the route would rank the
  // unestimable sets top — the exact rows the rep cap exists to reject.
  it('orders by e1rm NULLS LAST, then heaviest, then most reps', async () => {
    mock.selectQueue.push([setRow()], [{ totalSessions: 1 }]);
    await callPRs();
    const order = bestSetOrderBy();
    expect(order).toContain('DESC NULLS LAST');
    expect(order).toMatch(/"weight" desc/i);
    expect(order).toMatch(/"reps" desc/i);
  });

  it('applies the rep cap inside the ordering expression', async () => {
    mock.selectQueue.push([setRow()], [{ totalSessions: 1 }]);
    await callPRs();
    expect(dialect.sqlToQuery(mock.orderBys[0] as SQL).params).toContain(E1RM_MAX_REPS);
  });

  it('returns an estimate for a set inside the cap', async () => {
    mock.selectQueue.push([setRow({ reps: 3, weight: '100' })], [{ totalSessions: 2 }]);
    const res = await callPRs();
    const body = (await res.json()) as { estimatedOneRepMax: number | null; totalSessions: number };
    expect(body.estimatedOneRepMax).toBeCloseTo(110, 5);
    expect(body.totalSessions).toBe(2);
  });

  // The cap removes the estimate, not the set. Blanking the card for someone who
  // only trains in high reps would be worse than the wrong number it removes.
  it('keeps the best set but nulls the estimate above the cap', async () => {
    mock.selectQueue.push(
      [setRow({ reps: E1RM_MAX_REPS + 8, weight: '60' })],
      [{ totalSessions: 1 }],
    );
    const res = await callPRs();
    const body = (await res.json()) as {
      estimatedOneRepMax: number | null;
      bestSet: { weight: number; reps: number } | null;
    };
    expect(body.estimatedOneRepMax).toBeNull();
    expect(body.bestSet).not.toBeNull();
    expect(body.bestSet!.weight).toBe(60);
  });

  it('returns nulls and a zero count when nothing has been logged', async () => {
    mock.selectQueue.push([], []);
    const res = await callPRs();
    expect(await res.json()).toEqual({
      estimatedOneRepMax: null,
      bestSet: null,
      totalSessions: 0,
    });
  });

  it('requires auth', async () => {
    const res = await makeApp().request(`/exercises/${EXERCISE_ID}/prs`, {}, env);
    expect(res.status).toBe(401);
    expect(mock.select).not.toHaveBeenCalled();
  });
});
