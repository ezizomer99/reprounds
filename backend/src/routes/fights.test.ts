import { describe, it, expect, vi, beforeEach } from 'vitest';

const mock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  select: vi.fn(),
  selectQueue: [] as unknown[][],
}));

vi.mock('../db', () => ({
  createDb: () => ({
    query: { users: { findFirst: mock.findFirst } },
    select: mock.select,
  }),
}));

import { Hono } from 'hono';
import { fightRoutes } from './fights';
import { signJwt } from '../lib/jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';
const USER_ID = 'user-f';
const env = { JWT_SECRET: SECRET, DATABASE_URL: 'postgres://test' };

function makeApp() {
  const app = new Hono();
  app.route('/fights', fightRoutes);
  return app;
}

async function bearer() {
  const token = await signJwt({ sub: USER_ID }, SECRET, 3600);
  return { Authorization: `Bearer ${token}` };
}

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'groupBy', 'orderBy', 'limit']) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown[]) => void) =>
    resolve(mock.selectQueue.shift() ?? []);
  return chain;
}

beforeEach(() => {
  mock.selectQueue.length = 0;
  mock.findFirst.mockReset();
  mock.select.mockReset();
  mock.findFirst.mockResolvedValue({ id: USER_ID });
  mock.select.mockImplementation(makeSelectChain);
});

describe('GET /fights/records', () => {
  it('returns a per-discipline W-L-D tally', async () => {
    mock.selectQueue.push([
      { disciplineId: 'd1', wins: 3, losses: 1, draws: 0 },
      { disciplineId: 'd2', wins: 0, losses: 2, draws: 1 },
    ]);

    const res = await makeApp().request('/fights/records', { headers: await bearer() }, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      records: Array<{ disciplineId: string; wins: number; losses: number; draws: number }>;
    };
    expect(json.records).toHaveLength(2);
    expect(json.records[0]).toEqual({ disciplineId: 'd1', wins: 3, losses: 1, draws: 0 });
    expect(json.records[1]).toEqual({ disciplineId: 'd2', wins: 0, losses: 2, draws: 1 });
  });

  it('returns an empty list when there are no fights', async () => {
    mock.selectQueue.push([]);
    const res = await makeApp().request('/fights/records', { headers: await bearer() }, env);
    expect(res.status).toBe(200);
    expect((await res.json() as { records: unknown[] }).records).toEqual([]);
  });
});
