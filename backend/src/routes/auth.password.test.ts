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

async function patch(path: string, body: unknown, overrideEnv: Record<string, unknown> = {}) {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return makeApp().request(
    path,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { ...env, ...overrideEnv },
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

// This was the one credential-verifying route with no limiter. Being behind
// authMiddleware bounds *who* can try, not how often, and every attempt costs a
// 100,000-iteration PBKDF2 verify.
describe('PATCH /auth/password rate limiting', () => {
  it('429s before verifying anything when the limiter rejects', async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    mock.findFirstResults = [{ id: USER_ID }]; // authMiddleware existence check
    const res = await patch(
      '/auth/password',
      { currentPassword: 'whatever1', newPassword: 'newPassword1' },
      { AUTH_RATE_LIMITER: { limit } },
    );

    expect(res.status).toBe(429);
    expect(mock.update).not.toHaveBeenCalled();
    // Only authMiddleware's lookup ran. The handler's own hash lookup — and the
    // PBKDF2 verify behind it, which is the expensive part — never happened.
    expect(mock.findFirst).toHaveBeenCalledTimes(1);
  });

  it('keys the limiter on its own route so it has its own budget', async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    mock.findFirstResults = [{ id: USER_ID }];
    await patch(
      '/auth/password',
      { currentPassword: 'whatever1', newPassword: 'short' },
      { AUTH_RATE_LIMITER: { limit } },
    );

    expect(limit).toHaveBeenCalledTimes(1);
    expect((limit.mock.calls[0][0] as { key: string }).key).toMatch(/^password:/);
  });

  it('proceeds normally when the limiter allows the attempt', async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    mock.findFirstResults = [{ id: USER_ID }];
    const res = await patch(
      '/auth/password',
      { currentPassword: 'whatever1', newPassword: 'short' },
      { AUTH_RATE_LIMITER: { limit } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /auth/password', () => {
  it('rejects a short new password', async () => {
    mock.findFirstResults = [{ id: USER_ID }]; // authMiddleware existence check
    const res = await patch('/auth/password', { currentPassword: 'whatever1', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an account with no email to sign in with', async () => {
    // A guest row has no email, and login looks accounts up by email — so a
    // password here could never actually be used.
    mock.findFirstResults = [
      { id: USER_ID }, // authMiddleware
      { id: USER_ID, passwordHash: null, email: null }, // handler lookup
    ];
    const res = await patch('/auth/password', {
      currentPassword: 'whatever1',
      newPassword: 'newPassword1',
    });
    expect(res.status).toBe(400);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('sets a first password on a Google account without asking for a current one', async () => {
    // A Google user had no credential fallback if they lost access to that
    // Google account. There is no current password to verify, so the session
    // itself is the proof.
    mock.findFirstResults = [
      { id: USER_ID },
      { id: USER_ID, passwordHash: null, email: 'sam@example.com' },
    ];
    const res = await patch('/auth/password', { newPassword: 'newPassword1' });
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalled();
    await expect(
      verifyPassword('newPassword1', (mock.updatedSet as { passwordHash: string }).passwordHash),
    ).resolves.toBe(true);
  });

  it('409s when setting a password collides with an existing credential account', async () => {
    // The email uniqueness index is partial (WHERE password_hash IS NOT NULL),
    // so a Google account only enters it at the moment it gains a password.
    mock.findFirstResults = [
      { id: USER_ID },
      { id: USER_ID, passwordHash: null, email: 'taken@example.com' },
    ];
    mock.update.mockImplementation(() => ({
      set: () => ({
        where: async () => {
          throw new Error('duplicate key value violates unique constraint');
        },
      }),
    }));
    const res = await patch('/auth/password', { newPassword: 'newPassword1' });
    expect(res.status).toBe(409);
  });

  it('still requires the current password when one already exists', async () => {
    const storedHash = await hashPassword('theRealPassword1');
    mock.findFirstResults = [
      { id: USER_ID },
      { id: USER_ID, passwordHash: storedHash, email: 'sam@example.com' },
    ];
    const res = await patch('/auth/password', { newPassword: 'newPassword1' });
    expect(res.status).toBe(401);
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
