import { describe, it, expect, vi, beforeEach } from 'vitest';

// Queue-based DB mock (same pattern as routines.reorder.test.ts): select chains
// pop from selectQueue. update/insert/delete record what they were handed so the
// two write paths — updating an owned row vs upserting an override for a shared
// seeded one — can be told apart.
const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  selectQueue: [] as unknown[][],
  updateValues: [] as Record<string, unknown>[],
  insertValues: [] as Record<string, unknown>[],
  deleteCalls: [] as unknown[],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
    insert: mock.insert,
    update: mock.update,
    delete: mock.delete,
  }),
}));

import { Hono } from 'hono';
import { exerciseRoutes } from './exercises';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-abc';
const EX_ID = 'ex-1';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

/** A row as `SELECT * FROM exercises` returns it. */
function exerciseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EX_ID,
    userId: null, // global/seeded by default
    name: 'Pull-up',
    type: 'strength',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceId: 'src-1',
    category: 'strength',
    bodyPart: 'back',
    equipment: 'Bodyweight',
    muscleGroup: 'Lats',
    secondaryMuscles: ['Biceps', 'Forearms'],
    target: 'lats',
    ...overrides,
  };
}

function makeApp() {
  const app = new Hono();
  app.route('/exercises', exerciseRoutes);
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
    offset: () => Chain;
    leftJoin: () => Chain;
    then: (resolve: (v: unknown[]) => void, reject: (e: unknown) => void) => void;
  };
  const chain: Chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    offset: () => chain,
    leftJoin: () => chain,
    then(resolve, reject) {
      Promise.resolve(mock.selectQueue.shift() ?? []).then(resolve, reject);
    },
  };
  return chain;
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.updateValues.length = 0;
  mock.insertValues.length = 0;
  mock.deleteCalls.length = 0;
  mock.findFirst.mockReset().mockResolvedValue({ id: USER_ID });
  mock.select.mockReset().mockImplementation(makeSelectChain);

  mock.update.mockReset().mockImplementation(() => ({
    set: (values: Record<string, unknown>) => {
      mock.updateValues.push(values);
      return { where: () => ({ returning: () => Promise.resolve(mock.selectQueue.shift() ?? []) }) };
    },
  }));

  mock.insert.mockReset().mockImplementation(() => ({
    values: (values: Record<string, unknown>) => {
      mock.insertValues.push(values);
      return {
        onConflictDoUpdate: () => Promise.resolve(),
        returning: () => Promise.resolve(mock.selectQueue.shift() ?? []),
      };
    },
  }));

  mock.delete.mockReset().mockImplementation(() => ({
    where: (condition: unknown) => {
      mock.deleteCalls.push(condition);
      return Promise.resolve();
    },
  }));
});

async function setMuscles(body: unknown, sub = USER_ID) {
  return makeApp().request(
    `/exercises/${EX_ID}/muscles`,
    {
      method: 'PUT',
      headers: { ...(await bearer(sub)), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

describe('PUT /exercises/:id/muscles', () => {
  it('updates an exercise the caller owns in place, with no override row', async () => {
    const owned = exerciseRow({ userId: USER_ID, muscleGroup: 'chest', secondaryMuscles: [] });
    mock.selectQueue.push([owned]); // visibility lookup
    mock.selectQueue.push([{ ...owned, muscleGroup: 'back', secondaryMuscles: ['biceps'] }]); // returning

    const res = await setMuscles({ muscleGroup: 'back', secondaryMuscles: ['biceps'] });

    expect(res.status).toBe(200);
    expect(mock.updateValues).toEqual([{ muscleGroup: 'back', secondaryMuscles: ['biceps'] }]);
    expect(mock.insertValues).toHaveLength(0);
    const body = await res.json() as { exercise: { muscleGroup: string; secondaryMuscles: string[] } };
    expect(body.exercise).toMatchObject({ muscleGroup: 'back', secondaryMuscles: ['biceps'] });
  });

  // The seeded catalogue is shared by every user, so re-tagging Pull-ups has to
  // land in the override table rather than on the row itself.
  it('stores a per-user override for a seeded global exercise', async () => {
    mock.selectQueue.push([exerciseRow()]);

    const res = await setMuscles({ muscleGroup: 'back', secondaryMuscles: ['biceps'] });

    expect(res.status).toBe(200);
    expect(mock.updateValues).toHaveLength(0);
    expect(mock.insertValues).toEqual([
      { userId: USER_ID, exerciseId: EX_ID, muscleGroup: 'back', secondaryMuscles: ['biceps'] },
    ]);
  });

  // The response has to reflect the override, not the catalogue row it shadows —
  // the client writes it straight back into its cache.
  it('returns the overridden tagging, not the catalogue tagging', async () => {
    mock.selectQueue.push([exerciseRow()]);

    const res = await setMuscles({ muscleGroup: 'back', secondaryMuscles: ['biceps'] });
    const body = await res.json() as { exercise: { muscleGroup: string; secondaryMuscles: string[] } };

    expect(body.exercise.muscleGroup).toBe('back');
    expect(body.exercise.secondaryMuscles).toEqual(['biceps']);
  });

  // Primary and secondary contribute to the heat map at different weights, so a
  // muscle listed as both would be counted twice for one exercise.
  it('strips the primary and any duplicates out of the secondaries', async () => {
    mock.selectQueue.push([exerciseRow()]);

    await setMuscles({ muscleGroup: 'back', secondaryMuscles: ['back', 'biceps', 'biceps'] });

    expect(mock.insertValues[0]).toMatchObject({ secondaryMuscles: ['biceps'] });
  });

  it('accepts clearing the tagging entirely', async () => {
    mock.selectQueue.push([exerciseRow()]);

    const res = await setMuscles({ muscleGroup: null, secondaryMuscles: [] });

    expect(res.status).toBe(200);
    expect(mock.insertValues[0]).toMatchObject({ muscleGroup: null, secondaryMuscles: [] });
  });

  // The column is bare text with no check constraint — an unknown value would be
  // stored happily and then fail to resolve to a body-highlighter slug, dropping
  // the muscle off the heat map with no error anywhere.
  it('rejects a muscle outside the pick-list', async () => {
    mock.selectQueue.push([exerciseRow()]);
    expect((await setMuscles({ muscleGroup: 'lats', secondaryMuscles: [] })).status).toBe(400);

    mock.selectQueue.push([exerciseRow()]);
    expect((await setMuscles({ muscleGroup: 'back', secondaryMuscles: ['delts'] })).status).toBe(400);
  });

  it('rejects more secondaries than the cap', async () => {
    mock.selectQueue.push([exerciseRow()]);
    const res = await setMuscles({
      muscleGroup: 'back',
      secondaryMuscles: [
        'chest', 'shoulders', 'biceps', 'triceps',
        'forearms', 'abs', 'glutes', 'quads', 'calves',
      ],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-array secondaryMuscles', async () => {
    mock.selectQueue.push([exerciseRow()]);
    expect((await setMuscles({ muscleGroup: 'back', secondaryMuscles: 'biceps' })).status).toBe(400);
  });

  it('404s for an exercise the caller cannot see', async () => {
    mock.selectQueue.push([]);
    const res = await setMuscles({ muscleGroup: 'back', secondaryMuscles: [] });
    expect(res.status).toBe(404);
    expect(mock.insertValues).toHaveLength(0);
    expect(mock.updateValues).toHaveLength(0);
  });
});

describe('GET /exercises — resolving overrides on read', () => {
  async function list() {
    const res = await makeApp().request('/exercises', { headers: await bearer() }, env);
    const body = await res.json() as {
      exercises: { muscleGroup: string | null; secondaryMuscles: string[] | null }[];
    };
    return body.exercises[0];
  }

  it('applies the override when the caller has one', async () => {
    mock.selectQueue.push([
      { exercise: exerciseRow(), override: { muscleGroup: 'back', secondaryMuscles: ['biceps'] } },
    ]);

    expect(await list()).toMatchObject({ muscleGroup: 'back', secondaryMuscles: ['biceps'] });
  });

  // Drizzle can express an unmatched LEFT JOIN either as a null nested object or
  // as an object of nulls, depending on how the selection is shaped. Both have
  // to fall back to the catalogue rather than blanking the exercise's muscles.
  it('falls back to the catalogue when the nested join object is null', async () => {
    mock.selectQueue.push([{ exercise: exerciseRow(), override: null }]);

    expect(await list()).toMatchObject({
      muscleGroup: 'Lats',
      secondaryMuscles: ['Biceps', 'Forearms'],
    });
  });

  it('falls back to the catalogue when the nested join object is all nulls', async () => {
    mock.selectQueue.push([
      { exercise: exerciseRow(), override: { muscleGroup: null, secondaryMuscles: null } },
    ]);

    expect(await list()).toMatchObject({
      muscleGroup: 'Lats',
      secondaryMuscles: ['Biceps', 'Forearms'],
    });
  });

  // An override replaces the tagging outright, so one that deliberately clears
  // the muscles must not COALESCE back to the catalogue's.
  it('honours an override that clears the tagging', async () => {
    mock.selectQueue.push([
      { exercise: exerciseRow(), override: { muscleGroup: null, secondaryMuscles: [] } },
    ]);

    expect(await list()).toMatchObject({ muscleGroup: null, secondaryMuscles: [] });
  });
});

describe('DELETE /exercises/:id/muscles', () => {
  it('drops the override and returns the catalogue tagging', async () => {
    mock.selectQueue.push([exerciseRow()]);

    const res = await makeApp().request(
      `/exercises/${EX_ID}/muscles`,
      { method: 'DELETE', headers: await bearer() },
      env,
    );

    expect(res.status).toBe(200);
    expect(mock.deleteCalls).toHaveLength(1);
    const body = await res.json() as { exercise: { muscleGroup: string; secondaryMuscles: string[] } };
    expect(body.exercise.muscleGroup).toBe('Lats');
    expect(body.exercise.secondaryMuscles).toEqual(['Biceps', 'Forearms']);
  });

  it('404s for an exercise the caller cannot see', async () => {
    mock.selectQueue.push([]);
    const res = await makeApp().request(
      `/exercises/${EX_ID}/muscles`,
      { method: 'DELETE', headers: await bearer() },
      env,
    );
    expect(res.status).toBe(404);
    expect(mock.deleteCalls).toHaveLength(0);
  });
});
