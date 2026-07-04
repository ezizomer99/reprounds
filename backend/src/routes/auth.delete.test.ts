import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the delete().where() chain without a real database. findFirst backs
// the auth middleware's user-existence check.
const { deleteFn, deleteWhere, findFirst } = vi.hoisted(() => {
  const deleteWhere = vi.fn();
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));
  const findFirst = vi.fn(async () => ({ id: 'user-to-delete' }));
  return { deleteFn, deleteWhere, findFirst };
});

vi.mock('../db', () => ({
  createDb: () => ({ delete: deleteFn, query: { users: { findFirst } } }),
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

beforeEach(() => {
  deleteFn.mockClear();
  deleteWhere.mockClear();
});

describe('DELETE /auth/me', () => {
  it('rejects an unauthenticated request without deleting anything', async () => {
    const res = await makeApp().request('/auth/me', { method: 'DELETE' }, env);
    expect(res.status).toBe(401);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('deletes the authenticated user and returns 204', async () => {
    const token = await signJwt({ sub: 'user-to-delete' }, SECRET, 3600);
    const res = await makeApp().request(
      '/auth/me',
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(204);
    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
