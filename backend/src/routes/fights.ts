import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { fights } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { disciplineVisible } from '../lib/ownership';
import type {
  CreateFightRequest,
  Fight,
  FightListResponse,
  UpdateFightRequest,
} from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
  };
  Variables: {
    userId: string;
  };
};

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

  const where = disciplineId
    ? and(eq(fights.userId, userId), eq(fights.disciplineId, disciplineId))
    : eq(fights.userId, userId);

  const rows = await db.select().from(fights).where(where).orderBy(desc(fights.date));

  const result: FightListResponse = { fights: rows.map(mapFight) };
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

  const updates: Partial<typeof fights.$inferInsert> = {};
  if (body.date !== undefined) updates.date = body.date;
  if ('opponent' in body) updates.opponent = body.opponent?.trim() || null;
  if (body.result !== undefined) updates.result = body.result;
  if ('method' in body) updates.method = body.method ?? null;
  if ('round' in body) updates.round = body.round ?? null;
  if ('notes' in body) updates.notes = body.notes?.trim() || null;

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
