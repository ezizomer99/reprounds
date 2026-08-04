import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock (same pattern as sessions.reorder.test.ts): select chains
// pop from selectQueue; the transaction passes a tx that logs each update's
// values *and* its where-clause, so the user scoping can be asserted.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  selectQueue: [] as unknown[][],
  updates: [] as { orderIndex: number }[],
  wheres: [] as unknown[],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    transaction: mock.transaction,
  }),
}));

import { Hono } from 'hono';
import { routineRoutes } from './routines';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/routines', routineRoutes);
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
        return {
          where: (condition: unknown) => {
            mock.wheres.push(condition);
            return Promise.resolve();
          },
        };
      },
    }),
  };
}

// Walks a Drizzle SQL condition and collects the names of every column it
// references, so a test can prove which predicates are actually applied.
function columnNames(node: unknown, seen = new Set<unknown>()): string[] {
  if (node === null || typeof node !== 'object' || seen.has(node)) return [];
  seen.add(node);
  const record = node as Record<string, unknown>;
  if (typeof record.name === 'string' && 'table' in record) return [record.name];
  return Object.values(record).flatMap((value) =>
    Array.isArray(value)
      ? value.flatMap((entry) => columnNames(entry, seen))
      : columnNames(value, seen),
  );
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.updates.length = 0;
  mock.wheres.length = 0;
  mock.findFirst.mockReset().mockResolvedValue({ id: USER_ID });
  mock.select.mockReset().mockImplementation(makeSelectChain);
  mock.transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    await fn(makeTx());
  });
});

async function reorder(order: unknown, sub = USER_ID) {
  return makeApp().request(
    '/routines/order',
    {
      method: 'PUT',
      headers: { ...(await bearer(sub)), 'Content-Type': 'application/json' },
      body: JSON.stringify(order === undefined ? {} : { order }),
    },
    env,
  );
}

describe('PUT /routines/order', () => {
  it('writes sequential orderIndex values in the given routine order', async () => {
    const res = await reorder(['ba333333-3333-4333-8333-333333333333', 'ba111111-1111-4111-8111-111111111111', 'ba222222-2222-4222-8222-222222222222']);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mock.updates).toEqual([{ orderIndex: 0 }, { orderIndex: 1 }, { orderIndex: 2 }]);
  });

  it('scopes every update by user_id so one user cannot reindex another\'s routines', async () => {
    await reorder(['ba111111-1111-4111-8111-111111111111', 'ba222222-2222-4222-8222-222222222222']);

    expect(mock.wheres).toHaveLength(2);
    for (const where of mock.wheres) {
      const cols = columnNames(where);
      expect(cols).toContain('user_id');
      expect(cols).toContain('id');
    }
  });

  it('rejects an empty, missing, or non-string order array', async () => {
    expect((await reorder([])).status).toBe(400);
    expect((await reorder(undefined)).status).toBe(400);
    expect((await reorder('ba111111-1111-4111-8111-111111111111')).status).toBe(400);
    expect((await reorder([1, 2])).status).toBe(400);
    expect(mock.updates).toEqual([]);
  });

  it('rejects an oversized order array before touching the database', async () => {
    const res = await reorder(Array.from({ length: 501 }, (_, i) => `r${i}`));

    expect(res.status).toBe(400);
    expect(mock.updates).toEqual([]);
  });

  it('requires authentication', async () => {
    const res = await makeApp().request(
      '/routines/order',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: ['ba111111-1111-4111-8111-111111111111'] }),
      },
      env,
    );

    expect(res.status).toBe(401);
    expect(mock.updates).toEqual([]);
  });
});
