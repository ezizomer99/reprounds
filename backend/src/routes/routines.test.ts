import { describe, it, expect, vi, beforeEach } from 'vitest';

// Note: GET /routines/:id does not exist in the route file — there is no
// single-resource GET endpoint for routines. Tests that require ownership
// scoping on individual routines exercise PATCH /:id and DELETE /:id instead.

const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  selectQueue: [] as unknown[][],
  insertedRow: null as unknown,
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    insert: mock.insert,
    update: mock.update,
    delete: mock.delete,
    transaction: mock.transaction,
  }),
}));

import { Hono } from 'hono';
import { routineRoutes } from './routines';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-xyz';
const ROUTINE_ID = 'routine-xyz';
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
    select: makeSelectChain,
    insert: () => ({ values: () => ({ returning: async () => [mock.insertedRow] }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  };
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.insertedRow = null;
  for (const fn of [
    mock.findFirst, mock.select, mock.insert,
    mock.update, mock.delete, mock.transaction,
  ]) {
    fn.mockReset();
  }

  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
  mock.update.mockImplementation(() => ({ set: () => ({ where: () => Promise.resolve() }) }));
  mock.delete.mockImplementation(() => ({ where: () => Promise.resolve() }));
  mock.insert.mockImplementation(() => ({
    values: () => ({ returning: async () => [mock.insertedRow] }),
  }));
  mock.transaction.mockImplementation(
    async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx()),
  );
});

// ---------------------------------------------------------------------------
// GET /routines — list endpoint (the path that 500s on schema/DB drift)
// ---------------------------------------------------------------------------
describe('GET /routines', () => {
  it('returns 200 with the caller\'s routines and their items', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    mock.selectQueue.push([
      { id: ROUTINE_ID, userId: USER_ID, name: 'Push Day', dayLabel: 'Mon', notes: null, createdAt },
    ]); // routines list
    mock.selectQueue.push([
      {
        id: 'item-1', routineId: ROUTINE_ID, kind: 'exercise', exerciseId: 'ex-1',
        disciplineId: null, orderIndex: 0, supersetGroup: null, defaultRestSeconds: null,
        target: null, exerciseName: 'Bench Press', disciplineName: null,
      },
    ]); // items for those routines

    const res = await makeApp().request('/routines', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      routines: Array<{ id: string; name: string; createdAt: string; items: unknown[] }>;
    };
    expect(body.routines).toHaveLength(1);
    expect(body.routines[0].id).toBe(ROUTINE_ID);
    expect(body.routines[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(body.routines[0].items).toHaveLength(1);
  });

  it('returns an empty list (200) when the caller has no routines', async () => {
    mock.selectQueue.push([]); // no routines — handler must short-circuit, not error

    const res = await makeApp().request('/routines', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    expect((await res.json() as { routines: unknown[] }).routines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DELETE /routines/:id
// ---------------------------------------------------------------------------
describe('DELETE /routines/:id', () => {
  it('returns 404 for a routine not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/routines/${ROUTINE_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(404);
  });

  it('detaches sessions (update) before deleting the routine, in that order', async () => {
    const callOrder: string[] = [];
    mock.selectQueue.push([{ id: ROUTINE_ID }]); // owner check ✓

    mock.update.mockImplementation(() => {
      callOrder.push('update');
      return { set: () => ({ where: () => Promise.resolve() }) };
    });
    mock.delete.mockImplementation(() => {
      callOrder.push('delete');
      return { where: () => Promise.resolve() };
    });

    const res = await makeApp().request(`/routines/${ROUTINE_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(200);
    // Both operations must have run, update preceding delete.
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(mock.delete).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['update', 'delete']);
  });
});

// ---------------------------------------------------------------------------
// PATCH /routines/:id — ownership check (there is no GET /routines/:id)
// ---------------------------------------------------------------------------
describe('PATCH /routines/:id', () => {
  it('returns 404 for a routine owned by a different user', async () => {
    mock.selectQueue.push([]); // owner check: not found for this user

    const res = await makeApp().request(`/routines/${ROUTINE_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Stolen Update' }),
    }, env);

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// PUT /routines/:id/items/order
// ---------------------------------------------------------------------------
describe('PUT /routines/:id/items/order', () => {
  it('returns 404 when the routine is not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/routines/${ROUTINE_ID}/items/order`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ['item-1', 'item-2'] }),
    }, env);

    expect(res.status).toBe(404);
  });

  it('returns 400 when order is an empty array', async () => {
    mock.selectQueue.push([{ id: ROUTINE_ID }]); // owner check ✓

    const res = await makeApp().request(`/routines/${ROUTINE_ID}/items/order`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: [] }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe(
      'order must be a non-empty array of item IDs',
    );
  });
});
