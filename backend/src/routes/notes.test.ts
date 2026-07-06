import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock (same pattern as sessions.test.ts): db.execute pops raw
// SQL results from executeQueue; db.select chains pop from selectQueue.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  execute: vi.fn(),
  selectQueue: [] as unknown[][],
  executeQueue: [] as unknown[][],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    execute: mock.execute,
  }),
}));

import { Hono } from 'hono';
import { notesRoutes } from './notes';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/notes', notesRoutes);
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
    orderBy: () => Chain;
    leftJoin: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.executeQueue.length = 0;
  mock.findFirst.mockReset().mockResolvedValue({ id: USER_ID });
  mock.select.mockReset().mockImplementation(makeSelectChain);
  mock.execute.mockReset().mockImplementation(() =>
    Promise.resolve(mock.executeQueue.shift() ?? []),
  );
});

describe('GET /notes', () => {
  it('returns a session-notes-only group', async () => {
    mock.executeQueue.push([{ id: S1, date: '2026-07-01', name: 'Push day', notes: 'Felt strong' }]);
    mock.selectQueue.push([]); // no entries

    const res = await makeApp().request('/notes', { headers: await bearer() }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      groups: [
        {
          sessionId: S1,
          date: '2026-07-01',
          sessionName: 'Push day',
          kinds: [],
          notes: [{ source: { type: 'session' }, label: 'Session notes', text: 'Felt strong' }],
        },
      ],
      nextCursor: null,
    });
  });

  it('labels entry, technique, and round notes with source info', async () => {
    mock.executeQueue.push([{ id: S1, date: '2026-07-02', name: null, notes: null }]);
    mock.selectQueue.push([
      {
        id: 'entry-1',
        sessionId: S1,
        kind: 'martial_arts',
        details: {
          schema: 'rounds.v1',
          category: 'grappling',
          techniqueNotes: 'Worked on knee cuts',
          rounds: [
            { id: 'r1' },
            { id: 'r2', notes: 'Caught a triangle' },
          ],
        },
        notes: 'Great class',
        exerciseName: null,
        disciplineName: 'BJJ',
      },
      {
        id: 'entry-2',
        sessionId: S1,
        kind: 'exercise',
        details: null,
        notes: 'Elbow twinge on last set',
        exerciseName: 'Bench Press',
        disciplineName: null,
      },
    ]);

    const res = await makeApp().request('/notes', { headers: await bearer() }, env);
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].kinds).toEqual(['martial_arts', 'exercise']);
    expect(body.groups[0].notes).toEqual([
      { source: { type: 'entry', entryId: 'entry-1' }, label: 'BJJ', text: 'Great class' },
      {
        source: { type: 'technique', entryId: 'entry-1' },
        label: 'BJJ — Technique',
        text: 'Worked on knee cuts',
      },
      {
        source: { type: 'round', entryId: 'entry-1', roundNumber: 2 },
        label: 'BJJ — Round 2',
        text: 'Caught a triangle',
      },
      {
        source: { type: 'entry', entryId: 'entry-2' },
        label: 'Bench Press',
        text: 'Elbow twinge on last set',
      },
    ]);
  });

  it('drops groups whose notes are whitespace-only after trimming', async () => {
    mock.executeQueue.push([{ id: S1, date: '2026-07-01', name: null, notes: '   ' }]);
    mock.selectQueue.push([]);

    const res = await makeApp().request('/notes', { headers: await bearer() }, env);
    const body = await res.json();
    expect(body.groups).toEqual([]);
  });

  it('paginates with a keyset cursor', async () => {
    // limit=1 → route fetches limit+1=2 rows; extra row signals hasMore.
    mock.executeQueue.push([
      { id: S1, date: '2026-07-03', name: null, notes: 'a' },
      { id: S2, date: '2026-07-02', name: null, notes: 'b' },
    ]);
    mock.selectQueue.push([]);

    const res = await makeApp().request('/notes?limit=1', { headers: await bearer() }, env);
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].sessionId).toBe(S1);
    expect(body.nextCursor).toBe(`2026-07-03_${S1}`);

    // Follow the cursor: exactly one row left → no further cursor.
    mock.executeQueue.push([{ id: S2, date: '2026-07-02', name: null, notes: 'b' }]);
    mock.selectQueue.push([]);
    const res2 = await makeApp().request(
      `/notes?limit=1&cursor=${body.nextCursor}`,
      { headers: await bearer() },
      env,
    );
    const body2 = await res2.json();
    expect(body2.groups[0].sessionId).toBe(S2);
    expect(body2.nextCursor).toBeNull();
  });

  it('rejects malformed cursors', async () => {
    const res = await makeApp().request(
      '/notes?cursor=not-a-cursor',
      { headers: await bearer() },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('requires auth', async () => {
    const res = await makeApp().request('/notes', {}, env);
    expect(res.status).toBe(401);
  });

  it('accepts tag and q filters together', async () => {
    mock.executeQueue.push([{ id: S1, date: '2026-07-02', name: null, notes: 'triangle from guard' }]);
    mock.selectQueue.push([]);
    const res = await makeApp().request(
      '/notes?tag=triangle&q=guard',
      { headers: await bearer() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
  });
});

describe('GET /notes/tags', () => {
  it('returns tags with counts', async () => {
    mock.executeQueue.push([
      { tag: 'triangle', count: 5 },
      { tag: 'knee cut', count: 3 },
    ]);
    const res = await makeApp().request('/notes/tags', { headers: await bearer() }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tags: [
        { tag: 'triangle', count: 5 },
        { tag: 'knee cut', count: 3 },
      ],
    });
  });

  it('requires auth', async () => {
    const res = await makeApp().request('/notes/tags', {}, env);
    expect(res.status).toBe(401);
  });
});
