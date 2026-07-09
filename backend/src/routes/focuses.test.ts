import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  selectQueue: [] as unknown[][],
  insertedRow: null as unknown,
  updatedRows: [] as unknown[],
  deletedRows: [] as unknown[],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    insert: mock.insert,
    update: mock.update,
    delete: mock.delete,
  }),
}));

import { Hono } from 'hono';
import { focusRoutes } from './focuses';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-xyz';
const FOCUS_ID = 'focus-xyz';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/focuses', focusRoutes);
  return app;
}

async function bearer(sub = USER_ID) {
  const token = await signJwt({ sub }, SECRET, 3600);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy', 'leftJoin']) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => {
    Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
  };
  return chain;
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.insertedRow = null;
  mock.updatedRows = [];
  mock.deletedRows = [];
  for (const fn of [mock.findFirst, mock.select, mock.insert, mock.update, mock.delete]) {
    fn.mockReset();
  }

  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
  mock.insert.mockImplementation(() => ({
    values: () => ({ returning: async () => [mock.insertedRow] }),
  }));
  mock.update.mockImplementation(() => ({
    set: () => ({ where: () => ({ returning: async () => mock.updatedRows }) }),
  }));
  mock.delete.mockImplementation(() => ({
    where: () => ({ returning: async () => mock.deletedRows }),
  }));
});

function focusRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: FOCUS_ID,
    userId: USER_ID,
    title: 'Improve guard retention',
    notes: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /focuses
// ---------------------------------------------------------------------------
describe('GET /focuses', () => {
  it('returns an empty list for a user with no focuses', async () => {
    mock.selectQueue.push([]);

    const res = await makeApp().request('/focuses', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ focuses: [] });
  });

  it('maps rows into the Focus contract', async () => {
    mock.selectQueue.push([focusRow()]);

    const res = await makeApp().request('/focuses', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { focuses: Array<{ id: string; status: string }> };
    expect(body.focuses).toHaveLength(1);
    expect(body.focuses[0].id).toBe(FOCUS_ID);
    expect(body.focuses[0].status).toBe('active');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await makeApp().request('/focuses', {}, env);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /focuses
// ---------------------------------------------------------------------------
describe('POST /focuses', () => {
  it('creates a focus and returns 201', async () => {
    mock.insertedRow = focusRow();

    const res = await makeApp().request('/focuses', {
      method: 'POST',
      headers: await bearer(),
      body: JSON.stringify({ title: 'Improve guard retention' }),
    }, env);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { focus: { title: string } };
    expect(body.focus.title).toBe('Improve guard retention');
  });

  it('returns 400 when title is blank', async () => {
    const res = await makeApp().request('/focuses', {
      method: 'POST',
      headers: await bearer(),
      body: JSON.stringify({ title: '   ' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('title is required');
  });
});

// ---------------------------------------------------------------------------
// PATCH /focuses/:id
// ---------------------------------------------------------------------------
describe('PATCH /focuses/:id', () => {
  it('moves a focus to achieved', async () => {
    mock.updatedRows = [focusRow({ status: 'achieved' })];

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'PATCH',
      headers: await bearer(),
      body: JSON.stringify({ status: 'achieved' }),
    }, env);

    expect(res.status).toBe(200);
    expect((await res.json() as { focus: { status: string } }).focus.status).toBe('achieved');
  });

  it('rejects an invalid status', async () => {
    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'PATCH',
      headers: await bearer(),
      body: JSON.stringify({ status: 'bogus' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid status');
  });

  it('returns 404 for a focus owned by a different user', async () => {
    mock.updatedRows = []; // scoped update matched no row

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'PATCH',
      headers: await bearer(),
      body: JSON.stringify({ title: 'Stolen' }),
    }, env);

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });
});

// ---------------------------------------------------------------------------
// DELETE /focuses/:id
// ---------------------------------------------------------------------------
describe('DELETE /focuses/:id', () => {
  it('deletes an owned focus', async () => {
    mock.deletedRows = [{ id: FOCUS_ID }];

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('returns 404 when the focus is not owned by the caller', async () => {
    mock.deletedRows = []; // scoped delete matched no row

    const res = await makeApp().request(`/focuses/${FOCUS_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(404);
  });
});
