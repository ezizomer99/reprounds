import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  findFirstResults: [] as unknown[],
  findFirst: vi.fn(),
  update: vi.fn(),
  updatedSet: null as unknown,
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    update: mock.update,
  }),
}));

import { Hono } from 'hono';
import { NAME_MAX_LENGTH } from '@app/shared';
import type { User } from '@app/shared';
import { authRoutes } from './auth';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-1';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const DB_USER = {
  id: USER_ID,
  email: 'sam@example.com',
  name: 'Sam Example',
  avatarUrl: null,
  isGuest: false,
  passwordHash: 'algo$1$a$b',
};

function makeApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

async function patchMe(body: unknown) {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return makeApp().request(
    '/auth/me',
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

beforeEach(() => {
  mock.findFirstResults = [];
  mock.updatedSet = null;
  mock.findFirst.mockReset();
  mock.update.mockReset();
  mock.findFirst.mockImplementation(async () => mock.findFirstResults.shift());
  mock.update.mockImplementation(() => ({
    set: (v: unknown) => {
      mock.updatedSet = v;
      return { where: async () => {} };
    },
  }));
});

describe('PATCH /auth/me', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await makeApp().request('/auth/me', { method: 'PATCH' }, env);
    expect(res.status).toBe(401);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('updates the display name and returns the fresh user', async () => {
    mock.findFirstResults = [{ id: USER_ID }, { ...DB_USER, name: 'Alex' }];
    const res = await patchMe({ name: '  Alex  ' });

    expect(res.status).toBe(200);
    expect((mock.updatedSet as { name: string }).name).toBe('Alex');
    const body = (await res.json()) as { user: User };
    expect(body.user.name).toBe('Alex');
  });

  it('clears the name on an empty string, without needing an explicit null', async () => {
    mock.findFirstResults = [{ id: USER_ID }, { ...DB_USER, name: null }];
    const res = await patchMe({ name: '   ' });

    expect(res.status).toBe(200);
    expect((mock.updatedSet as { name: string | null }).name).toBeNull();
  });

  it('accepts an explicit null', async () => {
    mock.findFirstResults = [{ id: USER_ID }, { ...DB_USER, name: null }];
    const res = await patchMe({ name: null });

    expect(res.status).toBe(200);
    expect((mock.updatedSet as { name: string | null }).name).toBeNull();
  });

  it('rejects an over-length name', async () => {
    mock.findFirstResults = [{ id: USER_ID }];
    const res = await patchMe({ name: 'x'.repeat(NAME_MAX_LENGTH + 1) });

    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('rejects a non-string name', async () => {
    mock.findFirstResults = [{ id: USER_ID }];
    const res = await patchMe({ name: 42 });

    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('is a no-op write when the body carries no known fields', async () => {
    mock.findFirstResults = [{ id: USER_ID }, DB_USER];
    const res = await patchMe({});

    expect(res.status).toBe(200);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it("never lets the body set fields it doesn't own", async () => {
    // Only `name` is read off the body — a client can't promote itself out of
    // guest mode or hand itself a comped email this way.
    mock.findFirstResults = [{ id: USER_ID }, DB_USER];
    const res = await patchMe({ name: 'Alex', isGuest: false, email: 'comped@example.com' });

    expect(res.status).toBe(200);
    expect(Object.keys(mock.updatedSet as object)).toEqual(['name']);
  });
});
