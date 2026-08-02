import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock. Each db.select() call returns a thenable chain that
// resolves to the next array popped from selectQueue when awaited.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  selectDistinct: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
  selectQueue: [] as unknown[][],
  insertedRow: null as unknown,
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    selectDistinct: mock.selectDistinct,
    insert: mock.insert,
    update: mock.update,
    delete: mock.delete,
    transaction: mock.transaction,
  }),
}));

import { Hono } from 'hono';
import { sessionRoutes } from './sessions';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const SESSION_ID = 'sess-abc';
const ENTRY_ID = 'entry-abc';
const SET_ID = 'set-abc';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/sessions', sessionRoutes);
  return app;
}

async function bearer(sub = USER_ID) {
  const token = await signJwt({ sub }, SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

// Returns a thenable Drizzle-style chain. Each method returns itself so callers
// can do .from().where().limit().orderBy() etc. When awaited, it pops the next
// result from the shared selectQueue.
function makeSelectChain() {
  type Chain = {
    from: () => Chain;
    where: () => Chain;
    limit: () => Chain;
    orderBy: () => Chain;
    groupBy: () => Chain;
    leftJoin: () => Chain;
    innerJoin: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

// Transaction mock passes a minimal tx object whose select also pops from the
// shared queue (in order with any outer selects).
function makeTx() {
  return {
    select: makeSelectChain,
    insert: () => ({ values: () => ({ returning: async () => [mock.insertedRow] }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  };
}

const fakeSessionRow = {
  id: SESSION_ID,
  userId: USER_ID,
  routineId: null,
  name: 'Test Session',
  date: '2026-07-03',
  status: 'in_progress' as const,
  startedAt: null,
  completedAt: null,
  durationMinutes: null,
  notes: null,
  createdAt: new Date('2026-07-03T00:00:00Z'),
};

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.insertedRow = null;
  for (const fn of [
    mock.findFirst, mock.select, mock.selectDistinct,
    mock.insert, mock.update, mock.delete, mock.transaction,
  ]) {
    fn.mockReset();
  }

  // Auth middleware user-existence check: always pass unless a test overrides.
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
  mock.selectDistinct.mockImplementation(makeSelectChain);
  mock.update.mockImplementation(() => ({ set: () => ({ where: () => Promise.resolve() }) }));
  mock.delete.mockImplementation(() => ({ where: () => Promise.resolve() }));
  mock.insert.mockImplementation(() => ({
    values: () => ({ returning: async () => [mock.insertedRow] }),
  }));
  mock.transaction.mockImplementation(
    async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx()),
  );
});

// ---------------------------------------------------------------------------
// GET /sessions/:id
// ---------------------------------------------------------------------------
describe('GET /sessions/:id', () => {
  it('returns 404 when the session does not belong to the caller', async () => {
    // fetchSessionWithEntries does a select that returns nothing → null → 404
    mock.selectQueue.push([]);

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}`,
      { headers: await bearer() },
      env,
    );
    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });

  it('returns 200 with session data for the authenticated owner', async () => {
    mock.selectQueue.push([fakeSessionRow]); // session found
    mock.selectQueue.push([]);               // entries (empty → skips sets query)

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}`,
      { headers: await bearer() },
      env,
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { session: { id: string; status: string } };
    expect(json.session.id).toBe(SESSION_ID);
    expect(json.session.status).toBe('in_progress');
  });
});

// ---------------------------------------------------------------------------
// POST /sessions
// ---------------------------------------------------------------------------
describe('POST /sessions', () => {
  it('returns 400 without touching the DB when date is absent', async () => {
    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'no date here' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('date is required');
    // The date check happens before any DB call.
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('returns 409 when an in-progress session already exists', async () => {
    mock.selectQueue.push([{ id: 'active-sess' }]); // active session found

    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-07-03' }),
    }, env);

    expect(res.status).toBe(409);
    const json = await res.json() as { error: string; sessionId: string };
    expect(json.error).toBe('active_session_exists');
    expect(json.sessionId).toBe('active-sess');
  });

  it('returns 400 without touching the DB when kind is invalid', async () => {
    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-07-03', kind: 'cardio' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe(
      'kind must be exercise or martial_arts',
    );
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('rejects a mixed-kind routine started without a kind (never a combined session)', async () => {
    mock.selectQueue.push([{ id: 'routine-1' }]); // routine ownership ✓
    mock.selectQueue.push([                        // routine items span both kinds
      { kind: 'exercise', exerciseId: 'ex-1', disciplineId: null, orderIndex: 0, supersetGroup: null, defaultRestSeconds: null, target: null },
      { kind: 'martial_arts', exerciseId: null, disciplineId: 'disc-1', orderIndex: 1, supersetGroup: null, defaultRestSeconds: null, target: null },
    ]);

    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-07-03', routineId: 'routine-1' }),
    }, env);

    expect(res.status).toBe(400);
    const json = await res.json() as { error: string; kinds: string[] };
    expect(json.error).toBe('mixed_routine_kind_required');
    expect(json.kinds.sort()).toEqual(['exercise', 'martial_arts']);
    // Rejected before the active-session check and before any insert.
    expect(mock.transaction).not.toHaveBeenCalled();
  });

  it('starts one part of a mixed-kind routine when a kind is given', async () => {
    mock.insertedRow = fakeSessionRow;
    mock.selectQueue.push([{ id: 'routine-1' }]); // routine ownership ✓
    mock.selectQueue.push([                        // routine items span both kinds
      { kind: 'exercise', exerciseId: 'ex-1', disciplineId: null, orderIndex: 0, supersetGroup: null, defaultRestSeconds: null, target: null },
      { kind: 'martial_arts', exerciseId: null, disciplineId: 'disc-1', orderIndex: 1, supersetGroup: null, defaultRestSeconds: null, target: null },
    ]);
    mock.selectQueue.push([]);                     // no active session
    mock.selectQueue.push([]);                     // rest-seconds history for ex-1 (none)
    mock.selectQueue.push([fakeSessionRow]);       // fetchSessionWithEntries: session row
    mock.selectQueue.push([]);                     // entries (empty)

    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-07-03', routineId: 'routine-1', kind: 'exercise' }),
    }, env);

    expect(res.status).toBe(201);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    const json = await res.json() as { session: { id: string } };
    expect(json.session.id).toBe(SESSION_ID);
  });
});

// ---------------------------------------------------------------------------
// PATCH /sessions/:id
// ---------------------------------------------------------------------------
describe('PATCH /sessions/:id', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/sessions/${SESSION_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'updated' }),
    }, env);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:id
// ---------------------------------------------------------------------------
describe('DELETE /sessions/:id', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/sessions/${SESSION_ID}`, {
      method: 'DELETE',
      headers: await bearer(),
    }, env);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /sessions/:id/entries/:entryId
// ---------------------------------------------------------------------------
describe('PATCH /sessions/:id/entries/:entryId', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // session owner check: not found

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      { method: 'PATCH', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });

  it('returns 404 when the entry belongs to a different session (parent-chain check)', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([]);                    // entry not found in this session

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      { method: 'PATCH', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Entry not found');
  });
});

// ---------------------------------------------------------------------------
// PATCH /sessions/:id/entries/:entryId/sets/:setId
// ---------------------------------------------------------------------------
describe('PATCH /sessions/:id/entries/:entryId/sets/:setId', () => {
  it("returns 404 when the set's sessionEntryId doesn't match the URL entry", async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);   // entry in this session ✓
    mock.selectQueue.push([]);                    // set not found under this entry

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}/sets/${SET_ID}`,
      {
        method: 'PATCH',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Set not found');
  });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:id/entries/:entryId/sets/:setId
// ---------------------------------------------------------------------------
describe('DELETE /sessions/:id/entries/:entryId/sets/:setId', () => {
  it("returns 404 when the set's sessionEntryId doesn't match the URL entry", async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);   // entry in this session ✓
    mock.selectQueue.push([]);                    // set not found under this entry

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}/sets/${SET_ID}`,
      { method: 'DELETE', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Set not found');
  });
});

// ---------------------------------------------------------------------------
// DELETE /sessions/:id/entries/:entryId
// ---------------------------------------------------------------------------
describe('DELETE /sessions/:id/entries/:entryId', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // session owner check: not found

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      { method: 'DELETE', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Not found');
  });

  it('returns 404 when the entry belongs to a different session', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([]);                    // entry not found in this session

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      { method: 'DELETE', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Entry not found');
  });

  it('deletes the entry and returns success', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);   // entry found ✓

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      { method: 'DELETE', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(200);
    expect(mock.delete).toHaveBeenCalledTimes(1);
    expect((await res.json() as { success: boolean }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PATCH /sessions/:id/entries/:entryId — exerciseId swap
// ---------------------------------------------------------------------------
describe('PATCH /sessions/:id/entries/:entryId — exerciseId swap', () => {
  const NEW_EXERCISE_ID = 'ex-new-abc';

  it('returns 400 when trying to swap exerciseId to null', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);   // entry found ✓

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      {
        method: 'PATCH',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: null }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe(
      'exerciseId cannot be null for exercise entries',
    );
  });

  it('returns 400 when the entry kind is not exercise', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);                  // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);                    // entry found ✓
    mock.selectQueue.push([{ kind: 'martial_arts' as const }]);   // kind re-fetch

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      {
        method: 'PATCH',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: NEW_EXERCISE_ID }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe(
      'exerciseId can only be updated on exercise entries',
    );
  });

  it('returns 404 when the new exercise is not visible to the user', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);                // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);                  // entry found ✓
    mock.selectQueue.push([{ kind: 'exercise' as const }]);     // kind re-fetch ✓
    mock.selectQueue.push([]);                                   // exercise not visible

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      {
        method: 'PATCH',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: NEW_EXERCISE_ID }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Exercise not found');
  });

  it('swaps the exercise and returns the updated entry', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);                // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);                  // entry found ✓
    mock.selectQueue.push([{ kind: 'exercise' as const }]);     // kind re-fetch ✓
    mock.selectQueue.push([{ id: NEW_EXERCISE_ID }]);           // exercise visible ✓
    mock.selectQueue.push([{ restSeconds: 90 }]);               // rest-seconds history reseed
    // fetchEntryWithSets: entry row then sets
    mock.selectQueue.push([{
      id: ENTRY_ID, sessionId: SESSION_ID, kind: 'exercise' as const,
      exerciseId: NEW_EXERCISE_ID, disciplineId: null, gi: null,
      orderIndex: 0, supersetGroup: null, restSeconds: null,
      details: null, notes: null,
      exerciseName: 'Bench Press', disciplineName: null,
    }]);
    mock.selectQueue.push([]); // sets (empty)

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}`,
      {
        method: 'PATCH',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId: NEW_EXERCISE_ID }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
    const json = await res.json() as { entry: { exerciseId: string; exerciseName: string } };
    expect(json.entry.exerciseId).toBe(NEW_EXERCISE_ID);
    expect(json.entry.exerciseName).toBe('Bench Press');
  });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/entries — ownership (IDOR) guards
// ---------------------------------------------------------------------------
describe('POST /sessions/:id/entries', () => {
  it("returns 404 when the exerciseId is not visible to the caller (IDOR guard)", async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([]);                   // exercise not visible

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries`,
      {
        method: 'POST',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'exercise', exerciseId: 'ex-other-user' }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Exercise not found');
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it("returns 404 when the disciplineId is not visible to the caller (IDOR guard)", async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([]);                   // discipline not visible

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries`,
      {
        method: 'POST',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'martial_arts', disciplineId: 'disc-other-user' }),
      },
      env,
    );

    expect(res.status).toBe(404);
    expect((await res.json() as { error: string }).error).toBe('Discipline not found');
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/entries/:entryId/sets — input validation
// ---------------------------------------------------------------------------
describe('POST /sessions/:id/entries/:entryId/sets', () => {
  it('returns 400 for an invalid setType instead of a 500', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);   // entry found ✓

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}/sets`,
      {
        method: 'POST',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ setNumber: 1, setType: 'superset' }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid setType');
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('returns 400 for an out-of-range rpe', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // session owned ✓
    mock.selectQueue.push([{ id: ENTRY_ID }]);   // entry found ✓

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/entries/${ENTRY_ID}/sets`,
      {
        method: 'POST',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ setNumber: 1, rpe: 99 }),
      },
      env,
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid rpe');
    expect(mock.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PUT /sessions/:id/focuses
// ---------------------------------------------------------------------------
describe('PUT /sessions/:id/focuses', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(`/sessions/${SESSION_ID}/focuses`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusIds: ['focus-1'] }),
    }, env);

    expect(res.status).toBe(404);
  });

  it('returns 400 when focusIds is not an array', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓

    const res = await makeApp().request(`/sessions/${SESSION_ID}/focuses`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusIds: 'nope' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe(
      'focusIds must be an array of focus IDs',
    );
  });

  it('returns 400 when a focusId does not belong to the caller', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓
    mock.selectQueue.push([]);                    // ownership of focuses: none match

    const res = await makeApp().request(`/sessions/${SESSION_ID}/focuses`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusIds: ['focus-foreign'] }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe(
      'One or more focusIds are invalid',
    );
  });

  it('replaces the links in a transaction and echoes the deduped focusIds', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);          // owner check ✓
    mock.selectQueue.push([{ id: 'focus-1' }]);           // both refs resolve to one owned focus

    const res = await makeApp().request(`/sessions/${SESSION_ID}/focuses`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusIds: ['focus-1', 'focus-1'] }),
    }, env);

    expect(res.status).toBe(200);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    expect((await res.json() as { focusIds: string[] }).focusIds).toEqual(['focus-1']);
  });

  it('clears all links for an empty focusIds array without an ownership query', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓

    const res = await makeApp().request(`/sessions/${SESSION_ID}/focuses`, {
      method: 'PUT',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ focusIds: [] }),
    }, env);

    expect(res.status).toBe(200);
    expect(mock.transaction).toHaveBeenCalledTimes(1);
    // Only the session owner check ran; no focus-ownership select for an empty set.
    expect(mock.select).toHaveBeenCalledTimes(1);
    expect((await res.json() as { focusIds: string[] }).focusIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/complete
// ---------------------------------------------------------------------------
describe('POST /sessions/:id/complete', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/complete`,
      { method: 'POST', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
  });

  it('issues an update and returns the session with status completed', async () => {
    const completedRow = {
      ...fakeSessionRow,
      status: 'completed' as const,
      completedAt: new Date('2026-07-03T12:00:00Z'),
    };

    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓
    // fetchSessionWithEntries after the update:
    mock.selectQueue.push([completedRow]);         // session row
    mock.selectQueue.push([]);                     // entries (empty → no sets query)

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/complete`,
      {
        method: 'POST',
        headers: { ...(await bearer()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMinutes: 45 }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(mock.update).toHaveBeenCalledTimes(1);
    const json = await res.json() as { session: { id: string; status: string } };
    expect(json.session.id).toBe(SESSION_ID);
    expect(json.session.status).toBe('completed');
  });

  it('returns 400 for a malformed backdate', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓

    const res = await makeApp().request(`/sessions/${SESSION_ID}/complete`, {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '3/7/2026' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('date must be YYYY-MM-DD');
    expect(mock.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /sessions — list filters
// ---------------------------------------------------------------------------
describe('GET /sessions (list filters)', () => {
  it('accepts a from/to date range', async () => {
    mock.selectQueue.push([fakeSessionRow]); // rows page
    mock.selectQueue.push([]);               // distinct entry kinds
    mock.selectQueue.push([]);               // volume aggregate

    const res = await makeApp().request(
      '/sessions?from=2026-07-01&to=2026-07-31',
      { headers: await bearer() },
      env,
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { sessions: { id: string }[] };
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0].id).toBe(SESSION_ID);
  });

  it('returns 400 without touching the DB when from is malformed', async () => {
    const res = await makeApp().request(
      '/sessions?from=7%2F1%2F2026',
      { headers: await bearer() },
      env,
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('from must be YYYY-MM-DD');
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('returns 400 without touching the DB when status is not a session status', async () => {
    const res = await makeApp().request(
      '/sessions?status=bogus',
      { headers: await bearer() },
      env,
    );

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('Invalid status');
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('returns volumeKg and completedSets as numbers, not numeric strings', async () => {
    mock.selectQueue.push([fakeSessionRow]); // rows page
    mock.selectQueue.push([]);               // distinct entry kinds
    // Postgres numeric comes back as a string — the route must convert it.
    mock.selectQueue.push([{ sessionId: SESSION_ID, volumeKg: '1618.5', completedSets: 12 }]);

    const res = await makeApp().request('/sessions', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    const json = await res.json() as { sessions: { volumeKg: number; completedSets: number }[] };
    expect(json.sessions[0].volumeKg).toBe(1618.5);
    expect(json.sessions[0].completedSets).toBe(12);
  });

  it('defaults volume and set count to 0 for a session with no completed sets', async () => {
    mock.selectQueue.push([fakeSessionRow]); // rows page
    mock.selectQueue.push([]);               // distinct entry kinds
    mock.selectQueue.push([]);               // aggregate omits sessions with no completed sets

    const res = await makeApp().request('/sessions', { headers: await bearer() }, env);

    expect(res.status).toBe(200);
    const json = await res.json() as { sessions: { volumeKg: number; completedSets: number }[] };
    expect(json.sessions[0].volumeKg).toBe(0);
    expect(json.sessions[0].completedSets).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /sessions — planned (scheduled) creation
// ---------------------------------------------------------------------------
describe('POST /sessions with status planned', () => {
  it('returns 400 for any explicit status other than planned', async () => {
    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-08-16', status: 'completed' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('status must be planned or omitted');
    expect(mock.select).not.toHaveBeenCalled();
  });

  it('creates a planned session with null startedAt, skipping the active-session guard', async () => {
    const plannedRow = {
      ...fakeSessionRow,
      status: 'planned' as const,
      date: '2026-08-16',
    };
    mock.insertedRow = plannedRow;

    const insertedValues: Array<Record<string, unknown>> = [];
    mock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: makeSelectChain,
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            insertedValues.push(v);
            return { returning: async () => [mock.insertedRow] };
          },
        }),
        update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
        delete: () => ({ where: () => Promise.resolve() }),
      }),
    );

    // Queue holds ONLY the post-insert fetch — if the active-session guard ran,
    // it would pop the session row as its own result and the test would fail.
    mock.selectQueue.push([plannedRow]); // fetchSessionWithEntries: session row
    mock.selectQueue.push([]);           // entries (empty)

    const res = await makeApp().request('/sessions', {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-08-16', status: 'planned' }),
    }, env);

    expect(res.status).toBe(201);
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0].status).toBe('planned');
    expect(insertedValues[0].startedAt).toBeNull();
    const json = await res.json() as { session: { status: string } };
    expect(json.session.status).toBe('planned');
  });
});

// ---------------------------------------------------------------------------
// POST /sessions/:id/start
// ---------------------------------------------------------------------------
describe('POST /sessions/:id/start', () => {
  it('returns 404 when the session is not owned by the caller', async () => {
    mock.selectQueue.push([]); // owner check: not found

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/start`,
      { method: 'POST', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(404);
  });

  it('returns 409 not_planned for a session that is not planned', async () => {
    mock.selectQueue.push([{ id: SESSION_ID, status: 'completed' }]);

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/start`,
      { method: 'POST', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toBe('not_planned');
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('returns 409 active_session_exists when another session is in progress', async () => {
    mock.selectQueue.push([{ id: SESSION_ID, status: 'planned' }]);
    mock.selectQueue.push([{ id: 'active-sess' }]); // active-session guard hit

    const res = await makeApp().request(
      `/sessions/${SESSION_ID}/start`,
      { method: 'POST', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(409);
    const json = await res.json() as { error: string; sessionId: string };
    expect(json.error).toBe('active_session_exists');
    expect(json.sessionId).toBe('active-sess');
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('flips a planned session to in_progress and snaps the date to client today', async () => {
    const startedRow = {
      ...fakeSessionRow,
      status: 'in_progress' as const,
      date: '2026-08-02',
      startedAt: new Date('2026-08-02T09:30:00Z'),
    };

    let capturedSet: Record<string, unknown> | null = null;
    mock.update.mockImplementation(() => ({
      set: (v: Record<string, unknown>) => {
        capturedSet = v;
        return { where: () => Promise.resolve() };
      },
    }));

    mock.selectQueue.push([{ id: SESSION_ID, status: 'planned' }]); // owner check ✓
    mock.selectQueue.push([]);            // no active session
    mock.selectQueue.push([startedRow]);  // fetchSessionWithEntries: session row
    mock.selectQueue.push([]);            // entries (empty)

    const res = await makeApp().request(`/sessions/${SESSION_ID}/start`, {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-08-02' }),
    }, env);

    expect(res.status).toBe(200);
    expect(capturedSet).not.toBeNull();
    expect(capturedSet!.status).toBe('in_progress');
    expect(capturedSet!.startedAt).toBeInstanceOf(Date);
    expect(capturedSet!.date).toBe('2026-08-02');
    const json = await res.json() as { session: { status: string } };
    expect(json.session.status).toBe('in_progress');
  });
});

// ---------------------------------------------------------------------------
// PATCH /sessions/:id — reschedule
// ---------------------------------------------------------------------------
describe('PATCH /sessions/:id date', () => {
  it('updates the session date when valid', async () => {
    let capturedSet: Record<string, unknown> | null = null;
    mock.update.mockImplementation(() => ({
      set: (v: Record<string, unknown>) => {
        capturedSet = v;
        return { where: () => Promise.resolve() };
      },
    }));

    const movedRow = { ...fakeSessionRow, status: 'planned' as const, date: '2026-08-20' };
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓
    mock.selectQueue.push([movedRow]);           // fetchSessionWithEntries: session row
    mock.selectQueue.push([]);                   // entries (empty)

    const res = await makeApp().request(`/sessions/${SESSION_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-08-20' }),
    }, env);

    expect(res.status).toBe(200);
    expect(capturedSet).not.toBeNull();
    expect(capturedSet!.date).toBe('2026-08-20');
  });

  it('returns 400 for a malformed date', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check ✓

    const res = await makeApp().request(`/sessions/${SESSION_ID}`, {
      method: 'PATCH',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '8/20/2026' }),
    }, env);

    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe('date must be YYYY-MM-DD');
    expect(mock.update).not.toHaveBeenCalled();
  });
});
