import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from './auth';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

function makeApp() {
  const app = new Hono();
  app.use('/protected', authMiddleware);
  app.get('/protected', (c) => c.json({ userId: c.get('userId') }));
  return app;
}

// Bindings passed to app.request as the env for the Worker handler.
const env = { JWT_SECRET: SECRET };

describe('authMiddleware', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await makeApp().request('/protected', {}, env);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the scheme is not Bearer', async () => {
    const res = await makeApp().request(
      '/protected',
      { headers: { Authorization: 'Basic abc' } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await makeApp().request(
      '/protected',
      { headers: { Authorization: 'Bearer not.a.valid.token' } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it('passes through and exposes userId for a valid token', async () => {
    const token = await signJwt({ sub: 'user-xyz' }, SECRET, 3600);
    const res = await makeApp().request(
      '/protected',
      { headers: { Authorization: `Bearer ${token}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-xyz' });
  });
});
