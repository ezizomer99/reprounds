import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB: authMiddleware does one users.findFirst (existence), then the handler
// does another (to read the password hash). update() is a no-op chain.
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
import { authRoutes } from './auth';
import { signJwt } from '../lib/jwt';
import { hashPassword, verifyPassword } from '../lib/password';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-1';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

async function patch(path: string, body: unknown) {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return makeApp().request(
    path,
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

describe('PATCH /auth/password', () => {
  it('rejects a short new password', async () => {
    mock.findFirstResults = [{ id: USER_ID }]; // authMiddleware existence check
    const res = await patch('/auth/password', { currentPassword: 'whatever1', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an account with no password (Google/guest)', async () => {
    mock.findFirstResults = [
      { id: USER_ID }, // authMiddleware
      { id: USER_ID, passwordHash: null }, // handler lookup
    ];
    const res = await patch('/auth/password', {
      currentPassword: 'whatever1',
      newPassword: 'newPassword1',
    });
    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns 401 when the current password is wrong', async () => {
    const storedHash = await hashPassword('theRealPassword1');
    mock.findFirstResults = [
      { id: USER_ID },
      { id: USER_ID, passwordHash: storedHash },
    ];
    const res = await patch('/auth/password', {
      currentPassword: 'wrongPassword9',
      newPassword: 'newPassword1',
    });
    expect(res.status).toBe(401);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('updates to a fresh, verifiable hash on success', async () => {
    const storedHash = await hashPassword('theRealPassword1');
    mock.findFirstResults = [
      { id: USER_ID },
      { id: USER_ID, passwordHash: storedHash },
    ];
    const res = await patch('/auth/password', {
      currentPassword: 'theRealPassword1',
      newPassword: 'brandNewPass2',
    });
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
    const written = (mock.updatedSet as { passwordHash: string }).passwordHash;
    expect(written).not.toBe(storedHash);
    expect(await verifyPassword('brandNewPass2', written)).toBe(true);
  });
});
