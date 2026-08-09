import { describe, it, expect, vi, beforeEach } from 'vitest';

// Partners was the only user-owned route with no test file at all — weights,
// focuses, notes, fights, routines and sessions all have one.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  selectQueue: [] as unknown[][],
  insertedValues: null as unknown,
  updatedValues: null as unknown,
  updatedRow: null as unknown,
  deletedRow: null as unknown,
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
import { NAME_MAX_LENGTH } from '@app/shared';
import { partnerRoutes } from './partners';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-p';
const PARTNER_ID = '66666666-6666-4666-8666-666666666666';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };
const ROW = {
  id: PARTNER_ID,
  userId: USER_ID,
  name: 'Sam',
  createdAt: new Date('2026-07-01T00:00:00Z'),
};

function makeApp() {
  const app = new Hono();
  app.route('/partners', partnerRoutes);
  return app;
}

async function bearer() {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function send(method: string, path: string, body?: unknown) {
  return makeApp().request(
    path,
    {
      method,
      headers: await bearer(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
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
  mock.insertedValues = null;
  mock.updatedValues = null;
  mock.updatedRow = ROW;
  mock.deletedRow = { id: ROW.id };
  for (const fn of [mock.findFirst, mock.select, mock.insert, mock.update, mock.delete]) fn.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
  mock.insert.mockImplementation(() => ({
    values: (v: unknown) => {
      mock.insertedValues = v;
      return { returning: async () => [{ ...ROW, ...(v as object) }] };
    },
  }));
  mock.update.mockImplementation(() => ({
    set: (v: unknown) => {
      mock.updatedValues = v;
      return { where: () => ({ returning: async () => (mock.updatedRow ? [mock.updatedRow] : []) }) };
    },
  }));
  mock.delete.mockImplementation(() => ({
    where: () => ({ returning: async () => (mock.deletedRow ? [mock.deletedRow] : []) }),
  }));
});

describe('authentication', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await makeApp().request('/partners', {}, env);
    expect(res.status).toBe(401);
    expect(mock.select).not.toHaveBeenCalled();
  });
});

describe('POST /partners', () => {
  it('creates a partner with a trimmed name', async () => {
    const res = await send('POST', '/partners', { name: '  Sam  ' });
    expect(res.status).toBe(201);
    expect((mock.insertedValues as { name: string }).name).toBe('Sam');
    expect((mock.insertedValues as { userId: string }).userId).toBe(USER_ID);
  });

  it('rejects an empty or whitespace-only name', async () => {
    for (const name of ['', '   ']) {
      const res = await send('POST', '/partners', { name });
      expect(res.status).toBe(400);
    }
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('rejects a missing body', async () => {
    const res = await send('POST', '/partners', {});
    expect(res.status).toBe(400);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('caps the name length', async () => {
    // The column is unbounded `text`, so without this an arbitrarily long name
    // went straight into the DB and back out into every partner list.
    const res = await send('POST', '/partners', { name: 'x'.repeat(NAME_MAX_LENGTH + 1) });
    expect(res.status).toBe(400);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('accepts a name exactly at the cap', async () => {
    const res = await send('POST', '/partners', { name: 'x'.repeat(NAME_MAX_LENGTH) });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /partners/:id', () => {
  it('renames a partner', async () => {
    const res = await send('PATCH', `/partners/${PARTNER_ID}`, { name: ' Alex ' });
    expect(res.status).toBe(200);
    expect((mock.updatedValues as { name: string }).name).toBe('Alex');
  });

  it('404s when the row belongs to someone else', async () => {
    // The WHERE is scoped by userId, so a foreign id simply updates nothing.
    mock.updatedRow = null;
    const res = await send('PATCH', `/partners/${PARTNER_ID}`, { name: 'Alex' });
    expect(res.status).toBe(404);
  });

  it('rejects an empty name and an over-length name', async () => {
    for (const name of ['  ', 'x'.repeat(NAME_MAX_LENGTH + 1)]) {
      const res = await send('PATCH', `/partners/${PARTNER_ID}`, { name });
      expect(res.status).toBe(400);
    }
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('404s on a non-UUID id instead of 500ing', async () => {
    // The raw param used to reach `eq(partners.id, 'nope')`, where Postgres
    // raises `invalid input syntax for type uuid` — a 500 for a stale URL.
    const res = await send('PATCH', '/partners/not-a-uuid', { name: 'Alex' });
    expect(res.status).toBe(404);
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /partners/:id', () => {
  it('deletes a partner the caller owns', async () => {
    const res = await send('DELETE', `/partners/${PARTNER_ID}`);
    expect(res.status).toBe(200);
    expect(mock.delete).toHaveBeenCalled();
  });

  it("404s when the row isn't the caller's", async () => {
    mock.deletedRow = null;
    const res = await send('DELETE', `/partners/${PARTNER_ID}`);
    expect(res.status).toBe(404);
  });

  it('404s on a non-UUID id instead of 500ing', async () => {
    const res = await send('DELETE', '/partners/not-a-uuid');
    expect(res.status).toBe(404);
    expect(mock.delete).not.toHaveBeenCalled();
  });
});

describe('GET /partners', () => {
  it('returns the caller’s partners', async () => {
    mock.selectQueue.push([ROW]);
    const res = await send('GET', '/partners');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partners: { id: string; name: string }[] };
    expect(body.partners).toHaveLength(1);
    expect(body.partners[0].name).toBe('Sam');
  });

  it('returns an empty list rather than erroring when there are none', async () => {
    const res = await send('GET', '/partners');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { partners: unknown[] };
    expect(body.partners).toEqual([]);
  });
});
