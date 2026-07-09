import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock, same shape as the other route tests: db.select() returns
// a thenable chain resolving to the next array popped from selectQueue.
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
import { focusRoutes } from './focuses';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-focus';
const FOCUS_ID = 'focus-xyz';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/focuses', focusRoutes);
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
    innerJoin: () => Chain;
    groupBy: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    groupBy: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
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
});

// ---------------------------------------------------------------------------
// GET /focuses
// ---------------------------------------------------------------------------
describe('GET /focuses', () => {
  it('returns an empty list without querying stats when the user has none', async () => {
    mock.selectQueue.push([]); // focuses list: empty → early return

    const res = await makeApp().request('/focuses', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    expect((await res.json() as { focuses: unknown[] }).focuses).toEqual([]);
    // Only the list query ran; the stats aggregate is skipped.
    expect(mock.select).toHaveBeenCalledTimes(1);
  });

  it('merges computed sessionCount and lastWorkedDate onto each focus', async () => {
    mock.selectQueue.push([
      {
        id: FOCUS_ID,
        userId: USER_ID,
        disciplineId: 'disc-1',
        title: 'Better strangle submissions',
        notes: null,
        status: 'active',
        achievedAt: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        disciplineName: 'BJJ',
      },
    ]);
    // Postgres COUNT comes back as a string — the route must coerce it.
    mock.selectQueue.push([
      { focusId: FOCUS_ID, sessionCount: '8', lastWorkedDate: '2026-07-07' },
    ]);

    const res = await makeApp().request('/focuses', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    const { focuses } = await res.json() as { focuses: Array<Record<string, unknown>> };
    expect(focuses).toHaveLength(1);
    expect(focuses[0].sessionCount).toBe(8);
    expect(focuses[0].lastWorkedDate).toBe('2026-07-07');
    expect(focuses[0].disciplineName).toBe('BJJ');
  });
});

// ---------------------------------------------------------------------------
// POST /focuses
// ---------------------------------------------------------------------------
describe('POST /focuses', () => {
  it('returns 400 without touching the DB when title is blank', async () => {
    const res = await makeApp().request('/focuses', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('title is required');
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('returns 400 when the discipline is not visible to the caller', async () => {
    mock.selectQueue.push([]); // discipline visibility check: not found

    const res = await makeApp().request('/focuses', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Guard retention', disciplineId: 'foreign-disc' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid disciplineId');
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('creates a global focus and returns it with zeroed stats', async () => {
    mock.insertedRow = {
      id: FOCUS_ID,
      userId: USER_ID,
      disciplineId: null,
      title: 'Improve cardio',
      notes: null,
      status: 'active',
      achievedAt: null,
      createdAt: new Date('2026-07-08T00:00:00Z'),
    };

    const res = await makeApp().request('/focuses', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Improve cardio' }),
    }, env);

    expect(res.status).toBe(201);
    const { focus } = await res.json() as { focus: Record<string, unknown> };
    expect(focus.id).toBe(FOCUS_ID);
    expect(focus.status).toBe('active');
    expect(focus.sessionCount).toBe(0);
    expect(focus.lastWorkedDate).toBeNull();
    // A null disciplineId short-circuits the visibility check — no select needed.
    expect(mock.select).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH /focuses/:id
// ---------------------------------------------------------------------------
describe('PATCH /focuses/:id', () => {
  it('returns 404 for a focus owned by a different user', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'achieved' }),
    }, env);

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });

  it('returns 400 for an invalid status value', async () => {
    mock.selectQueue.push([{ id: FOCUS_ID }]); // owner check ✓

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid status');
  });

  it('updates an owned focus and returns success', async () => {
    mock.selectQueue.push([{ id: FOCUS_ID }]); // owner check ✓

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'achieved' }),
    }, env);

    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect((await res.json() as { success: boolean }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /focuses/:id
// ---------------------------------------------------------------------------
describe('DELETE /focuses/:id', () => {
  it('returns 404 for a focus not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(404);
  });

  it('deletes an owned focus and returns success', async () => {
    mock.selectQueue.push([{ id: FOCUS_ID }]); // owner check ✓

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(200);
    expect(mock.delete).toHaveBeenCalledTimes(1);
    expect((await res.json() as { success: boolean }).success).toBe(true);
  });
});
