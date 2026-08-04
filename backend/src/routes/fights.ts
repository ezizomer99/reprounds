import { Hono } from 'hono';
import { and, desc, eq, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { fights } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { disciplineVisible } from '../lib/ownership';
import {
  FIGHT_ROUND_RANGE,
  isFightMethod,
  isFightResult,
  isNumberInRange,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
} from '@app/shared';
import { isIsoDate, isUuid, isWithinLength } from '../lib/validate';
import type {
  CreateFightRequest,
  Fight,
  FightListResponse,
  FightRecordsResponse,
  UpdateFightRequest,
} from '@app/shared';

type Env = AppEnv;

const fightRoutes = new Hono<Env>();

fightRoutes.use('*', authMiddleware);

function mapFight(row: typeof fights.$inferSelect): Fight {
  return {
    id: row.id,
    userId: row.userId,
    disciplineId: row.disciplineId,
    date: row.date,
    opponent: row.opponent ?? null,
    result: row.result,
    method: row.method ?? null,
    round: row.round ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /fights?disciplineId=...  (disciplineId optional; defaults to all)
fightRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const disciplineId = c.req.query('disciplineId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  if (disciplineId !== undefined && !isUuid(disciplineId)) {
    return c.json({ error: 'Invalid disciplineId' }, 400);
  }

  const where = disciplineId
    ? and(eq(fights.userId, userId), eq(fights.disciplineId, disciplineId))
    : eq(fights.userId, userId);

  const rows = await db.select().from(fights).where(where).orderBy(desc(fights.date));

  const result: FightListResponse = { fights: rows.map(mapFight) };
  return c.json(result);
});

// GET /fights/records — per-discipline W-L-D tally for the caller, aggregated in
// the DB. Replaces the mat tab fetching every discipline's fight list just to
// count results (an N+1). Registered before any '/:id' route (there is none).
fightRoutes.get('/records', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const rows = await db
    .select({
      disciplineId: fights.disciplineId,
      wins: sql<number>`COUNT(*) FILTER (WHERE ${fights.result} = 'win')::int`,
      losses: sql<number>`COUNT(*) FILTER (WHERE ${fights.result} = 'loss')::int`,
      draws: sql<number>`COUNT(*) FILTER (WHERE ${fights.result} = 'draw')::int`,
    })
    .from(fights)
    .where(eq(fights.userId, userId))
    .groupBy(fights.disciplineId);

  const result: FightRecordsResponse = {
    records: rows.map((r) => ({
      disciplineId: r.disciplineId,
      wins: Number(r.wins),
      losses: Number(r.losses),
      draws: Number(r.draws),
    })),
  };
  return c.json(result);
});

fightRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateFightRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.disciplineId || !body.date || !body.result) {
    return c.json({ error: 'disciplineId, date, and result are required' }, 400);
  }
  if (!isUuid(body.disciplineId)) {
    return c.json({ error: 'Invalid disciplineId' }, 400);
  }
  if (!isIsoDate(body.date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }
  if (!isWithinLength(body.opponent, NAME_MAX_LENGTH)) {
    return c.json({ error: `opponent must be ${NAME_MAX_LENGTH} characters or fewer` }, 400);
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return c.json({ error: `notes must be ${NOTES_MAX_LENGTH} characters or fewer` }, 400);
  }
  if (!isFightResult(body.result)) {
    return c.json({ error: 'Invalid result' }, 400);
  }
  if (body.method != null && !isFightMethod(body.method)) {
    return c.json({ error: 'Invalid method' }, 400);
  }
  if (body.round != null && !isNumberInRange(body.round, FIGHT_ROUND_RANGE.min, FIGHT_ROUND_RANGE.max)) {
    return c.json({ error: 'Invalid round' }, 400);
  }

  // Guard against tagging a fight to another user's private discipline (IDOR).
  if (!(await disciplineVisible(db, body.disciplineId, userId))) {
    return c.json({ error: 'Discipline not found' }, 404);
  }

  const [row] = await db
    .insert(fights)
    .values({
      userId,
      disciplineId: body.disciplineId,
      date: body.date,
      opponent: body.opponent?.trim() || null,
      result: body.result,
      method: body.method ?? null,
      round: body.round ?? null,
      notes: body.notes?.trim() || null,
    })
    .returning();

  return c.json({ fight: mapFight(row) }, 201);
});

fightRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: UpdateFightRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (body.result !== undefined && !isFightResult(body.result)) {
    return c.json({ error: 'Invalid result' }, 400);
  }
  if (body.method != null && !isFightMethod(body.method)) {
    return c.json({ error: 'Invalid method' }, 400);
  }
  if (body.round != null && !isNumberInRange(body.round, FIGHT_ROUND_RANGE.min, FIGHT_ROUND_RANGE.max)) {
    return c.json({ error: 'Invalid round' }, 400);
  }
  if (body.date !== undefined && !isIsoDate(body.date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }
  if (!isWithinLength(body.opponent, NAME_MAX_LENGTH)) {
    return c.json({ error: `opponent must be ${NAME_MAX_LENGTH} characters or fewer` }, 400);
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return c.json({ error: `notes must be ${NOTES_MAX_LENGTH} characters or fewer` }, 400);
  }

  const updates: Partial<typeof fights.$inferInsert> = {};
  if (body.date !== undefined) updates.date = body.date;
  if ('opponent' in body) updates.opponent = body.opponent?.trim() || null;
  if (body.result !== undefined) updates.result = body.result;
  if ('method' in body) updates.method = body.method ?? null;
  if ('round' in body) updates.round = body.round ?? null;
  if ('notes' in body) updates.notes = body.notes?.trim() || null;

  // Drizzle throws on .set({}) — an empty PATCH body was a 500. The weights and
  // promotions handlers have always guarded this; fights was the odd one out.
  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const [row] = await db
    .update(fights)
    .set(updates)
    .where(and(eq(fights.id, id), eq(fights.userId, userId)))
    .returning();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ fight: mapFight(row) });
});

fightRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await db
    .delete(fights)
    .where(and(eq(fights.id, id), eq(fights.userId, userId)))
    .returning({ id: fights.id });

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ success: true });
});

export { fightRoutes };
