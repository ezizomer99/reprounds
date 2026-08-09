import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  selectQueue: [] as unknown[][],
  insertedRow: null as unknown,
  updatedRow: null as unknown,
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
import { weightRoutes } from './weights';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-w';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };
const ROW = {
  id: '77777777-7777-4777-8777-777777777777',
  userId: USER_ID,
  date: '2026-07-01',
  weightKg: '80',
  notes: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
};

function makeApp() {
  const app = new Hono();
  app.route('/weights', weightRoutes);
  return app;
}

async function bearer() {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy']) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown[]) => void) =>
    resolve(mock.selectQueue.shift() ?? []);
  return chain;
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.insertedRow = ROW;
  mock.updatedRow = ROW;
  for (const fn of [mock.findFirst, mock.select, mock.insert, mock.update, mock.delete]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
  mock.insert.mockImplementation(() => ({ values: () => ({ returning: async () => [mock.insertedRow] }) }));
  mock.update.mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [mock.updatedRow] }) }) }));
  mock.delete.mockImplementation(() => ({ where: () => ({ returning: async () => [{ id: ROW.id }] }) }));
});

describe('POST /weights', () => {
  it('rejects a non-numeric or out-of-range weightKg with 400', async () => {
    const res = await makeApp().request(
      '/weights',
      { method: 'POST', headers: await bearer(), body: JSON.stringify({ date: '2026-07-01', weightKg: 5000 }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('inserts (201) when no entry exists for the date', async () => {
    mock.selectQueue.push([]); // no existing row for this date
    const res = await makeApp().request(
      '/weights',
      { method: 'POST', headers: await bearer(), body: JSON.stringify({ date: '2026-07-01', weightKg: 80 }) },
      env,
    );
    expect(res.status).toBe(201);
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('updates (200) the existing entry for the same date instead of duplicating', async () => {
    mock.selectQueue.push([{ id: '77777777-7777-4777-8777-777777777777' }]); // existing row for this date
    const res = await makeApp().request(
      '/weights',
      { method: 'POST', headers: await bearer(), body: JSON.stringify({ date: '2026-07-01', weightKg: 81 }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

describe('PATCH /weights/:id', () => {
  it('updates fields and returns the row', async () => {
    const res = await makeApp().request(
      '/weights/77777777-7777-4777-8777-777777777777',
      { method: 'PATCH', headers: await bearer(), body: JSON.stringify({ weightKg: 79.5 }) },
      env,
    );
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
  });

  it('rejects an out-of-range weightKg with 400', async () => {
    const res = await makeApp().request(
      '/weights/77777777-7777-4777-8777-777777777777',
      { method: 'PATCH', headers: await bearer(), body: JSON.stringify({ weightKg: -3 }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });
});
