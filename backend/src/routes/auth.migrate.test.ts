import { describe, it, expect, vi, beforeEach } from 'vitest';

// Records which tables migrateGuestData reassigns. The guest row is deleted at
// the end of the merge and every user-owned table cascades off it, so a table
// missing from the reassignment list is silent data loss — that is exactly what
// happened to training_focuses and techniques, and what these tests pin down.
const mock = vi.hoisted(() => ({
  guestUser: null as unknown,
  updatedTables: [] as string[],
  deletedTables: [] as string[],
  transactionCalls: 0,
  insertedRow: null as unknown,
  txShouldThrowOn: null as string | null,
}));

// Drizzle table objects carry their name on a symbol; in the mock we only need
// a stable identifier, so the fake update()/delete() read a plain marker the
// schema mock attaches.
function tableName(table: unknown): string {
  return (table as { _mockName?: string })?._mockName ?? 'unknown';
}

function makeTx() {
  return {
    query: { users: { findFirst: async () => mock.guestUser } },
    update: (table: unknown) => ({
      set: () => ({
        where: async () => {
          const name = tableName(table);
          if (mock.txShouldThrowOn === name) throw new Error(`boom on ${name}`);
          mock.updatedTables.push(name);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async () => {
        mock.deletedTables.push(tableName(table));
      },
    }),
  };
}

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: async () => undefined } },
    insert: () => ({ values: () => ({ returning: async () => [mock.insertedRow] }) }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
    transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<void>) => {
      mock.transactionCalls++;
      // A real transaction rolls back on throw; the assertion that matters here
      // is that the throw propagates rather than leaving a half-merged account.
      return fn(makeTx());
    },
  }),
}));

// Tag each schema table with a name the fake tx can report back.
vi.mock('../db/schema', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const tagged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(actual)) {
    if (value && typeof value === 'object') {
      tagged[key] = new Proxy(value as object, {
        get: (target, prop) =>
          prop === '_mockName' ? key : Reflect.get(target, prop),
      });
    } else {
      tagged[key] = value;
    }
  }
  return tagged;
});

import { Hono } from 'hono';
import { authRoutes } from './auth';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

const GUEST_ID = 'guest-user-id';
const REAL_ID = 'real-user-id';

function makeApp() {
  const app = new Hono();
  app.route('/auth', authRoutes);
  return app;
}

async function registerWithGuest() {
  const guestToken = await signJwt({ sub: GUEST_ID }, SECRET, 3600);
  return makeApp().request(
    '/auth/register',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'convert@example.com',
        password: 'longenough1',
        guestToken,
      }),
    },
    env,
  );
}

beforeEach(() => {
  mock.guestUser = { id: GUEST_ID, isGuest: true };
  mock.updatedTables = [];
  mock.deletedTables = [];
  mock.transactionCalls = 0;
  mock.txShouldThrowOn = null;
  mock.insertedRow = {
    id: REAL_ID,
    email: 'convert@example.com',
    name: null,
    avatarUrl: null,
    isGuest: false,
  };
});

describe('migrateGuestData', () => {
  // The regression this suite exists for: a guest who set up Training Focuses
  // or custom techniques lost all of them at signup, because neither table was
  // reassigned before the cascading delete of the guest row.
  it('reassigns training focuses', async () => {
    const res = await registerWithGuest();
    expect(res.status).toBe(200);
    expect(mock.updatedTables).toContain('trainingFocuses');
  });

  it('reassigns custom techniques', async () => {
    const res = await registerWithGuest();
    expect(res.status).toBe(200);
    expect(mock.updatedTables).toContain('techniques');
  });

  it('reassigns every user-owned table before deleting the guest', async () => {
    const res = await registerWithGuest();
    expect(res.status).toBe(200);
    // Each table that carries its own user_id column. session_entries,
    // strength_sets and session_focuses have none — they cascade through their
    // parents — so they are deliberately absent.
    expect(new Set(mock.updatedTables)).toEqual(
      new Set([
        'exercises',
        'disciplines',
        'partners',
        'fights',
        'rankPromotions',
        'weightLogs',
        'routines',
        'sessions',
        'trainingFocuses',
        'techniques',
      ]),
    );
    expect(mock.deletedTables).toEqual(['users']);
  });

  it('runs the whole merge inside one transaction', async () => {
    await registerWithGuest();
    expect(mock.transactionCalls).toBe(1);
  });

  it('propagates a mid-merge failure instead of half-migrating', async () => {
    // A failure on the 4th table must not leave the guest row deleted with the
    // remaining tables stranded — the transaction rolls the whole thing back.
    mock.txShouldThrowOn = 'fights';
    const res = await registerWithGuest();
    expect(res.status).toBe(500);
    expect(mock.deletedTables).not.toContain('users');
  });

  it('is a no-op when the token belongs to a non-guest account', async () => {
    mock.guestUser = { id: GUEST_ID, isGuest: false };
    const res = await registerWithGuest();
    expect(res.status).toBe(200);
    expect(mock.updatedTables).toEqual([]);
    expect(mock.deletedTables).toEqual([]);
  });

  it('is a no-op when the guest id equals the real user id', async () => {
    mock.guestUser = { id: REAL_ID, isGuest: true };
    const res = await registerWithGuest();
    expect(res.status).toBe(200);
    expect(mock.updatedTables).toEqual([]);
    expect(mock.deletedTables).toEqual([]);
  });
});
