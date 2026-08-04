import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock (same pattern as sessions.test.ts): select chains pop
// from selectQueue; the transaction passes a tx whose update calls are logged.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  selectQueue: [] as unknown[][],
  updates: [] as { orderIndex: number }[],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    transaction: mock.transaction,
  }),
}));

import { Hono } from 'hono';
import { sessionRoutes } from './sessions';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/sessions', sessionRoutes);
  return app;
}

async function bearer(sub = USER_ID) {
  const token = await signJwt({ sub }, SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

function makeSelectChain() {
  type Chain = {
    from: () => Chain;
    where: () => Chain;
    limit: () => Chain;
    orderBy: () => Chain;
    leftJoin: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

function makeTx() {
  return {
    update: () => ({
      set: (values: { orderIndex: number }) => {
        mock.updates.push(values);
        return { where: () => Promise.resolve() };
      },
    }),
  };
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.updates.length = 0;
  mock.findFirst.mockReset().mockResolvedValue({ id: USER_ID });
  mock.select.mockReset().mockImplementation(makeSelectChain);
  mock.transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    await fn(makeTx());
  });
});

// Entry ids are real UUIDs: the endpoint now shape-checks the list before it
// reaches Postgres, the same way the routines reorder always has.
const E1 = 'e1111111-1111-4111-8111-111111111111';
const E2 = 'e2222222-2222-4222-8222-222222222222';
const E3 = 'e3333333-3333-4333-8333-333333333333';

describe('PUT /sessions/:id/entries/order', () => {
  it('writes sequential orderIndex values for the given entry order', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check passes

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/order`,
      {
        method: 'PUT',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: [E3, E1, E2] }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mock.updates).toEqual([{ orderIndex: 0 }, { orderIndex: 1 }, { orderIndex: 2 }]);
  });

  it("404s when the session isn't owned by the caller", async () => {
    mock.selectQueue.push([]); // owner check fails

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/order`,
      {
        method: 'PUT',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: [E1] }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect(mock.updates).toEqual([]);
  });

  it('rejects an empty or missing order array', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);
    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/order`,
      {
        method: 'PUT',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: [] }),
      },
      env,
    );
    expect(res.status).toBe(400);

    mock.selectQueue.push([{ id: SESSION_ID }]);
    const res2 = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/order`,
      {
        method: 'PUT',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(res2.status).toBe(400);
  });
});
