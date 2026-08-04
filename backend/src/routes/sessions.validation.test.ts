import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every case here used to reach Postgres and come back as a generic 500: a
// malformed date, a fractional index, an int4 overflow, an unbounded JSONB
// blob, a non-UUID id. The assertion that matters is 400 *without* a DB call —
// the value must be rejected at the edge, not by the driver.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  selectQueue: [] as unknown[][],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    insert: mock.insert,
    update: mock.update,
    transaction: mock.transaction,
  }),
}));

import { Hono } from 'hono';
import { sessionRoutes } from './sessions';
import { signJwt } from '../lib/jwt';
import { DETAILS_MAX_BYTES, MAX_REORDER_IDS, NOTES_MAX_LENGTH } from '@app/shared';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const EXERCISE_ID = '55555555-5555-4555-8555-555555555555';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/sessions', sessionRoutes);
  return app;
}

async function bearer() {
  return { Authorization: `Bearer ${await signJwt({ sub: USER_ID }, SECRET, 3600)}` };
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy', 'groupBy', 'leftJoin', 'innerJoin']) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) =>
    Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
  return chain;
}

async function send(method: string, path: string, body: unknown) {
  return makeApp().request(
    path,
    {
      method,
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

/** Queues the owner (and entry) lookups a nested route makes before validating. */
function ownedSession(status = 'in_progress') {
  mock.selectQueue.push([{ id: SESSION_ID, status }]);
}
function ownedEntry() {
  mock.selectQueue.push([{ id: ENTRY_ID }]);
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.findFirst.mockReset().mockResolvedValue({ id: USER_ID });
  mock.select.mockReset().mockImplementation(makeSelectChain);
  mock.insert.mockReset();
  mock.update.mockReset();
  mock.transaction.mockReset();
});

describe('POST /sessions validation', () => {
  it('rejects a malformed date without touching the DB', async () => {
    const res = await send('POST', '/sessions', { date: '3/7/2026' });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('date must be YYYY-MM-DD');
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('rejects a calendar-invalid date', async () => {
    const res = await send('POST', '/sessions', { date: '2026-02-30' });
    expect(res.status).toBe(400);
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID routineId', async () => {
    const res = await send('POST', '/sessions', { date: '2026-07-03', routineId: 'routine-1' });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid routineId');
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('rejects an over-long notes field', async () => {
    const res = await send('POST', '/sessions', {
      date: '2026-07-03',
      notes: 'x'.repeat(NOTES_MAX_LENGTH + 1),
    });
    expect(res.status).toBe(400);
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range durationMinutes', async () => {
    for (const durationMinutes of [-1, 1441, 4.5]) {
      mock.select.mockClear();
      const res = await send('POST', '/sessions', { date: '2026-07-03', durationMinutes });
      expect(res.status).toBe(400);
      expect(mock.select).not.toHaveBeenCalled();
    }
  });
});

describe('POST /sessions/:id/entries validation', () => {
  it('rejects a non-UUID exerciseId before the visibility lookup', async () => {
    ownedSession();
    const res = await send('POST', `/sessions/${SESSION_ID}/entries`, {
      kind: 'exercise',
      exerciseId: 'ex-1',
    });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid exerciseId');
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('rejects a fractional or overflowing orderIndex', async () => {
    for (const orderIndex of [1.5, -1, 2_147_483_648]) {
      ownedSession();
      const res = await send('POST', `/sessions/${SESSION_ID}/entries`, {
        kind: 'exercise',
        exerciseId: EXERCISE_ID,
        orderIndex,
      });
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe('Invalid orderIndex');
      expect(mock.insert).not.toHaveBeenCalled();
    }
  });

  it('rejects an out-of-range restSeconds', async () => {
    for (const restSeconds of [-1, 601, 12.5]) {
      ownedSession();
      const res = await send('POST', `/sessions/${SESSION_ID}/entries`, {
        kind: 'exercise',
        exerciseId: EXERCISE_ID,
        restSeconds,
      });
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe('Invalid restSeconds');
    }
  });

  // 0 means the "Off" preset, so it must survive validation even though the
  // custom-duration input range starts at 1.
  it('accepts restSeconds 0 ("Off")', async () => {
    ownedSession();
    mock.selectQueue.push([{ id: EXERCISE_ID }]); // exercise visible
    mock.selectQueue.push([]);                     // no existing entries (kind check)
    mock.selectQueue.push([{ maxOrder: null }]);   // max orderIndex
    mock.insert.mockImplementation(() => ({
      values: () => ({ returning: async () => [{ id: ENTRY_ID }] }),
    }));
    mock.selectQueue.push([]); // fetchEntryWithSets

    const res = await send('POST', `/sessions/${SESSION_ID}/entries`, {
      kind: 'exercise',
      exerciseId: EXERCISE_ID,
      restSeconds: 0,
    });
    expect(res.status).not.toBe(400);
  });

  it('rejects a details payload over the size cap', async () => {
    ownedSession();
    const res = await send('POST', `/sessions/${SESSION_ID}/entries`, {
      kind: 'exercise',
      exerciseId: EXERCISE_ID,
      details: { rounds: 'x'.repeat(DETAILS_MAX_BYTES) },
    });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('details payload is too large');
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

describe('POST /sessions/:id/entries/:entryId/sets validation', () => {
  it('rejects a fractional or out-of-range setNumber', async () => {
    for (const setNumber of [0, 1.5, 1001]) {
      ownedSession();
      ownedEntry();
      const res = await send(
        'POST',
        `/sessions/${SESSION_ID}/entries/${ENTRY_ID}/sets`,
        { setNumber },
      );
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe('Invalid setNumber');
      expect(mock.insert).not.toHaveBeenCalled();
    }
  });
});

describe('PUT /sessions/:id/entries/order validation', () => {
  it('rejects a non-UUID element', async () => {
    ownedSession();
    const res = await send('PUT', `/sessions/${SESSION_ID}/entries/order`, {
      order: [ENTRY_ID, 'e2'],
    });
    expect(res.status).toBe(400);
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  // Each id is one round-trip inside the transaction; the routines endpoints
  // have always capped this and the sessions one did not.
  it('rejects an oversized order array before opening a transaction', async () => {
    ownedSession();
    const res = await send('PUT', `/sessions/${SESSION_ID}/entries/order`, {
      order: Array(MAX_REORDER_IDS + 1).fill(ENTRY_ID),
    });
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toMatch(/too large/);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

describe('PUT /sessions/:id/focuses validation', () => {
  it('rejects a non-UUID focusId before the ownership lookup', async () => {
    ownedSession();
    const res = await send('PUT', `/sessions/${SESSION_ID}/focuses`, {
      focusIds: ['focus-1'],
    });
    expect(res.status).toBe(400);
    expect(mock.transaction).not.toHaveBeenCalled();
  });
});

describe('POST /sessions/:id/skip', () => {
  // 'skipped' has been in the enum and rendered by the UI since the first
  // migration, but nothing could set it — a planned workout the user didn't do
  // stayed "Overdue" forever, and deleting it was the only way out.
  it('marks a planned session skipped', async () => {
    ownedSession('planned');
    mock.update.mockImplementation(() => ({ set: () => ({ where: async () => {} }) }));
    mock.selectQueue.push([{
      id: SESSION_ID,
      userId: USER_ID,
      status: 'skipped',
      date: '2026-07-03',
      createdAt: new Date(),
      routineId: null,
      name: null,
      startedAt: null,
      completedAt: null,
      durationMinutes: null,
      notes: null,
    }]);
    mock.selectQueue.push([]); // entries
    mock.selectQueue.push([]); // focus links

    const res = await send('POST', `/sessions/${SESSION_ID}/skip`, {});
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
    const json = await res.json() as { session: { status: string } };
    expect(json.session.status).toBe('skipped');
  });

  it('409s on a session that is in progress — that is a delete, not a skip', async () => {
    ownedSession('in_progress');
    const res = await send('POST', `/sessions/${SESSION_ID}/skip`, {});
    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toBe('not_planned');
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('409s on a completed session', async () => {
    ownedSession('completed');
    const res = await send('POST', `/sessions/${SESSION_ID}/skip`, {});
    expect(res.status).toBe(409);
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('404s when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]);
    const res = await send('POST', `/sessions/${SESSION_ID}/skip`, {});
    expect(res.status).toBe(404);
    expect(mock.update).not.toHaveBeenCalled();
  });
});

describe('POST /sessions/:id/start accepts a skipped session', () => {
  // Skipping is a dismissal, not a deletion, so changing your mind has to lead
  // back into the logger.
  it('starts a session that was previously skipped', async () => {
    mock.selectQueue.push([{ id: SESSION_ID, status: 'skipped' }]); // target
    mock.selectQueue.push([]);                                       // no active session
    mock.update.mockImplementation(() => ({ set: () => ({ where: async () => {} }) }));
    mock.selectQueue.push([{
      id: SESSION_ID,
      userId: USER_ID,
      status: 'in_progress',
      date: '2026-07-03',
      createdAt: new Date(),
      routineId: null,
      name: null,
      startedAt: new Date(),
      completedAt: null,
      durationMinutes: null,
      notes: null,
    }]);
    mock.selectQueue.push([]);
    mock.selectQueue.push([]);

    const res = await send('POST', `/sessions/${SESSION_ID}/start`, {});
    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
  });

  it('still 409s on a completed session', async () => {
    mock.selectQueue.push([{ id: SESSION_ID, status: 'completed' }]);
    const res = await send('POST', `/sessions/${SESSION_ID}/start`, {});
    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toBe('not_planned');
  });
});

describe('POST /sessions/:id/complete status guard', () => {
  // A double-tap on Finish over a slow connection used to re-stamp completedAt
  // on a session that was already done.
  it('409s when the session is already completed', async () => {
    ownedSession('completed');
    const res = await send('POST', `/sessions/${SESSION_ID}/complete`, {});
    expect(res.status).toBe(409);
    const json = await res.json() as { error: string; status: string };
    expect(json.error).toBe('not_in_progress');
    expect(json.status).toBe('completed');
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('409s when the session is still planned, rather than skipping startedAt', async () => {
    ownedSession('planned');
    const res = await send('POST', `/sessions/${SESSION_ID}/complete`, {});
    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toBe('not_in_progress');
    expect(mock.update).not.toHaveBeenCalled();
  });
});
