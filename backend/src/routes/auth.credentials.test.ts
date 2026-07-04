import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable mock database. Each test configures findFirst results and the row
// returned by insert().values().returning(). We don't hit a real Postgres.
const mock = vi.hoisted(() => {
  return {
    findFirstResults: [] as unknown[],
    insertedRow: null as unknown,
    insertShouldThrow: false,
    findFirst: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
});

vi.mock('../db', () => ({
  createDb: () => ({
    query: {
      users: {
        // Return queued results in order (register does up to 2 lookups;
        // login does 1).
        findFirst: mock.findFirst,
      },
    },
    insert: mock.insert,
    update: mock.update,
    delete: mock.delete,
  }),
}));

import { Hono } from 'hono';
import { authRoutes } from './auth';
import { verifyPassword } from '../lib/password';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

function post(path: string, body: unknown) {
  return makeApp().request(
    path,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    env,
  );
}

beforeEach(() => {
  mock.findFirstResults = [];
  mock.insertedRow = null;
  mock.insertShouldThrow = false;
  mock.findFirst.mockReset();
  mock.insert.mockReset();
  mock.update.mockReset();
  mock.delete.mockReset();

  // findFirst returns queued results in FIFO order, defaulting to undefined.
  mock.findFirst.mockImplementation(async () => mock.findFirstResults.shift());

  // insert().values().returning() → [insertedRow]
  mock.insert.mockImplementation(() => ({
    values: () => ({
      returning: async () => {
        if (mock.insertShouldThrow) throw new Error('duplicate key value');
        return [mock.insertedRow];
      },
    }),
  }));
});

describe('POST /auth/register', () => {
  it('rejects an invalid email', async () => {
    const res = await post('/auth/register', { email: 'notanemail', password: 'longenough1' });
    expect(res.status).toBe(400);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('rejects a short password', async () => {
    const res = await post('/auth/register', { email: 'a@b.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('rejects when the email is already a Google account', async () => {
    mock.findFirstResults = [{ id: 'g1', isGuest: false, googleSub: 'sub123', passwordHash: null }];
    const res = await post('/auth/register', { email: 'taken@gmail.com', password: 'longenough1' });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/Google/i);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('rejects a duplicate credential account', async () => {
    // 1st lookup: no google account; 2nd lookup: existing credential account
    mock.findFirstResults = [undefined, { id: 'c1', passwordHash: 'pbkdf2-sha256$1$aa$bb' }];
    const res = await post('/auth/register', { email: 'dupe@example.com', password: 'longenough1' });
    expect(res.status).toBe(409);
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('creates a new credential account and returns a session', async () => {
    mock.findFirstResults = [undefined, undefined];
    mock.insertedRow = {
      id: 'new-user',
      email: 'new@example.com',
      name: 'New User',
      avatarUrl: null,
      isGuest: false,
    };
    const res = await post('/auth/register', {
      email: 'New@Example.com',
      password: 'longenough1',
      name: 'New User',
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { sessionToken: string; user: { id: string; email: string } };
    expect(json.sessionToken).toBeTruthy();
    expect(json.user.id).toBe('new-user');
    expect(mock.insert).toHaveBeenCalledTimes(1);
  });

  it('normalizes email to lowercase and hashes the password before insert', async () => {
    mock.findFirstResults = [undefined, undefined];
    mock.insertedRow = { id: 'u2', email: 'mixed@case.com', name: null, avatarUrl: null, isGuest: false };
    let capturedValues: Record<string, unknown> | undefined;
    mock.insert.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        return { returning: async () => [mock.insertedRow] };
      },
    }));

    const res = await post('/auth/register', { email: '  Mixed@Case.COM ', password: 'plaintextpw1' });
    expect(res.status).toBe(200);
    expect(capturedValues?.email).toBe('mixed@case.com');
    // stored value is a hash, not the plaintext
    const stored = capturedValues?.passwordHash as string;
    expect(stored).not.toContain('plaintextpw1');
    await expect(verifyPassword('plaintextpw1', stored)).resolves.toBe(true);
  });

  it('returns 409 if the insert hits a unique-index race', async () => {
    mock.findFirstResults = [undefined, undefined];
    mock.insertShouldThrow = true;
    const res = await post('/auth/register', { email: 'race@example.com', password: 'longenough1' });
    expect(res.status).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('returns a uniform 401 for an unknown email', async () => {
    mock.findFirstResults = [undefined];
    const res = await post('/auth/login', { email: 'ghost@example.com', password: 'longenough1' });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid email or password');
  });

  it('returns a uniform 401 for a wrong password', async () => {
    // real hash of a *different* password
    const { hashPassword } = await import('../lib/password');
    const storedHash = await hashPassword('theRealPassword1');
    mock.findFirstResults = [{ id: 'u1', email: 'user@example.com', name: null, avatarUrl: null, isGuest: false, passwordHash: storedHash }];
    const res = await post('/auth/login', { email: 'user@example.com', password: 'wrongPassword9' });
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('Invalid email or password');
  });

  it('rejects a short password without a DB lookup', async () => {
    const res = await post('/auth/login', { email: 'user@example.com', password: 'short' });
    expect(res.status).toBe(401);
    expect(mock.findFirst).not.toHaveBeenCalled();
  });

  it('signs in with a correct password', async () => {
    const { hashPassword } = await import('../lib/password');
    const storedHash = await hashPassword('theRealPassword1');
    mock.findFirstResults = [{ id: 'u1', email: 'user@example.com', name: 'User', avatarUrl: null, isGuest: false, passwordHash: storedHash }];
    const res = await post('/auth/login', { email: 'User@Example.com', password: 'theRealPassword1' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { sessionToken: string; user: { id: string } };
    expect(json.sessionToken).toBeTruthy();
    expect(json.user.id).toBe('u1');
  });
});
