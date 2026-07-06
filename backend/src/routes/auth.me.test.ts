import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the update().set().where().returning() chain and the auth middleware's
// user-existence findFirst.
const { updateFn, setFn, whereFn, returningFn, findFirst } = vi.hoisted(() => {
  const returningFn = vi.fn(async () => [
    { id: 'u1', email: 'a@b.com', name: null, avatarUrl: null, isGuest: false, onboardedAt: new Date('2026-07-05T00:00:00Z') },
  ]);
  const whereFn = vi.fn(() => ({ returning: returningFn }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  const updateFn = vi.fn(() => ({ set: setFn }));
  const findFirst = vi.fn(async () => ({ id: 'u1' }));
  return { updateFn, setFn, whereFn, returningFn, findFirst };
});

vi.mock('../db', () => ({
  createDb: () => ({ update: updateFn, query: { users: { findFirst } } }),
}));

import { Hono } from 'hono';
import { authRoutes } from './auth';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

async function auth() {
  const token = await signJwt({ sub: 'u1' }, SECRET, 3600);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

beforeEach(() => {
  updateFn.mockClear();
  setFn.mockClear();
  whereFn.mockClear();
  returningFn.mockClear();
});

describe('PATCH /auth/me', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await makeApp().request(
      '/auth/me',
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ onboarded: true }) },
      env,
    );
    expect(res.status).toBe(401);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it('sets onboardedAt when { onboarded: true } and returns the updated user', async () => {
    const res = await makeApp().request(
      '/auth/me',
      { method: 'PATCH', headers: await auth(), body: JSON.stringify({ onboarded: true }) },
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.onboardedAt).toBe('2026-07-05T00:00:00.000Z');
    expect(setFn).toHaveBeenCalledTimes(1);
    expect(setFn.mock.calls[0][0].onboardedAt).toBeInstanceOf(Date);
  });

  it('400s when no supported field is provided', async () => {
    const res = await makeApp().request(
      '/auth/me',
      { method: 'PATCH', headers: await auth(), body: JSON.stringify({}) },
      env,
    );
    expect(res.status).toBe(400);
    expect(updateFn).not.toHaveBeenCalled();
  });
});
