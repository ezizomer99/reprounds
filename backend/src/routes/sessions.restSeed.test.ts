import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock (same pattern as sessions.reorder.test.ts): select
// chains pop from selectQueue; insert().values().returning() captures the
// inserted values and echoes them back with an id.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  selectQueue: [] as unknown[][],
  insertedValues: [] as Record<string, unknown>[],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    insert: mock.insert,
  }),
}));

import { Hono } from 'hono';
import { sessionRoutes } from './sessions';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DISCIPLINE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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

function makeSelectChain() {
  type Chain = {
    from: () => Chain;
    where: () => Chain;
    limit: () => Chain;
    orderBy: () => Chain;
    leftJoin: () => Chain;
    innerJoin: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.insertedValues.length = 0;
  mock.findFirst.mockReset().mockResolvedValue({ id: USER_ID });
  mock.select.mockReset().mockImplementation(makeSelectChain);
  mock.insert.mockReset().mockImplementation(() => ({
    values: (v: Record<string, unknown>) => {
      mock.insertedValues.push(v);
      return { returning: async () => [{ id: 'entry-1', ...v }] };
    },
  }));
});

// The selects fetchEntryWithSets issues after the insert: the entry row with
// joined names, then its sets.
function queueFetchEntry(restSeconds: number | null, kind = 'exercise') {
  mock.selectQueue.push([
    {
      id: 'entry-1',
      sessionId: SESSION_ID,
      kind,
      exerciseId: kind === 'exercise' ? EXERCISE_ID : null,
      disciplineId: kind === 'exercise' ? null : DISCIPLINE_ID,
      gi: null,
      orderIndex: 0,
      supersetGroup: null,
      restSeconds,
      details: null,
      notes: null,
      exerciseName: kind === 'exercise' ? 'Bench Press' : null,
      disciplineName: kind === 'exercise' ? null : 'BJJ',
    },
  ]);
  mock.selectQueue.push([]); // sets
}

async function postEntry(body: Record<string, unknown>) {
  return makeApp().request(
    `/sessions/${SESSION_ID}/entries`,
    {
      method: 'POST',
      headers: { ...(await bearer()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe('POST /sessions/:id/entries rest-seconds seeding', () => {
  it('seeds restSeconds from the most recent prior entry for the exercise', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check
    mock.selectQueue.push([{ id: EXERCISE_ID }]); // exerciseVisible
    mock.selectQueue.push([]); // existing-kind check
    mock.selectQueue.push([{ maxOrder: null }]); // max orderIndex
    mock.selectQueue.push([{ restSeconds: 90 }]); // history lookup
    queueFetchEntry(90);

    const res = await postEntry({ kind: 'exercise', exerciseId: EXERCISE_ID });

    expect(res.status).toBe(201);
    expect(mock.insertedValues).toHaveLength(1);
    expect(mock.insertedValues[0].restSeconds).toBe(90);
  });

  it('falls back to 120 when the exercise has no history', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);
    mock.selectQueue.push([{ id: EXERCISE_ID }]);
    mock.selectQueue.push([]);
    mock.selectQueue.push([{ maxOrder: null }]);
    mock.selectQueue.push([]); // history lookup: nothing
    queueFetchEntry(120);

    const res = await postEntry({ kind: 'exercise', exerciseId: EXERCISE_ID });

    expect(res.status).toBe(201);
    expect(mock.insertedValues[0].restSeconds).toBe(120);
  });

  it('honors a remembered 0 ("Off") from history', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);
    mock.selectQueue.push([{ id: EXERCISE_ID }]);
    mock.selectQueue.push([]);
    mock.selectQueue.push([{ maxOrder: null }]);
    mock.selectQueue.push([{ restSeconds: 0 }]); // history lookup
    queueFetchEntry(0);

    const res = await postEntry({ kind: 'exercise', exerciseId: EXERCISE_ID });

    expect(res.status).toBe(201);
    expect(mock.insertedValues[0].restSeconds).toBe(0);
  });

  it('an explicit body restSeconds wins over history (no history lookup)', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]);
    mock.selectQueue.push([{ id: EXERCISE_ID }]);
    mock.selectQueue.push([]);
    mock.selectQueue.push([{ maxOrder: null }]);
    // no history-lookup select queued: the route must not issue one
    queueFetchEntry(45);

    const res = await postEntry({
      kind: 'exercise',
      exerciseId: EXERCISE_ID,
      restSeconds: 45,
    });

    expect(res.status).toBe(201);
    expect(mock.insertedValues[0].restSeconds).toBe(45);
  });

  it('martial_arts entries stay null and skip the history lookup', async () => {
    mock.selectQueue.push([{ id: SESSION_ID }]); // owner check
    mock.selectQueue.push([{ id: DISCIPLINE_ID }]); // disciplineVisible
    mock.selectQueue.push([]); // existing-kind check
    mock.selectQueue.push([{ maxOrder: null }]); // max orderIndex
    queueFetchEntry(null, 'martial_arts');

    const res = await postEntry({ kind: 'martial_arts', disciplineId: DISCIPLINE_ID });

    expect(res.status).toBe(201);
    expect(mock.insertedValues[0].restSeconds).toBeNull();
  });
});
