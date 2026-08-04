import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { weightLogs } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { isNumberInRange, NOTES_MAX_LENGTH, WEIGHT_KG_RANGE } from '@app/shared';
import { isIsoDate, isWithinLength } from '../lib/validate';
import type {
  CreateWeightLogRequest,
  UpdateWeightLogRequest,
  WeightLog,
  WeightLogListResponse,
} from '@app/shared';

type Env = AppEnv;

const weightRoutes = new Hono<Env>();

weightRoutes.use('*', authMiddleware);

function mapWeight(row: typeof weightLogs.$inferSelect): WeightLog {
  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    weightKg: Number(row.weightKg),
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

weightRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const rows = await db
    .select()
    .from(weightLogs)
    .where(eq(weightLogs.userId, userId))
    .orderBy(desc(weightLogs.date));

  const result: WeightLogListResponse = { weights: rows.map(mapWeight) };
  return c.json(result);
});

weightRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateWeightLogRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!isIsoDate(body.date) || !isNumberInRange(body.weightKg, WEIGHT_KG_RANGE.min, WEIGHT_KG_RANGE.max)) {
    return c.json({ error: 'a date (YYYY-MM-DD) and a weightKg between 0 and 1000 are required' }, 400);
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return c.json({ error: `notes must be ${NOTES_MAX_LENGTH} characters or fewer` }, 400);
  }

  // One weigh-in per day: if this date already has an entry, update it rather
  // than accumulating duplicates (there is no DB unique constraint on the pair).
  const [existing] = await db
    .select({ id: weightLogs.id })
    .from(weightLogs)
    .where(and(eq(weightLogs.userId, userId), eq(weightLogs.date, body.date)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(weightLogs)
      .set({ weightKg: String(body.weightKg), notes: body.notes?.trim() || null })
      .where(and(eq(weightLogs.id, existing.id), eq(weightLogs.userId, userId)))
      .returning();
    return c.json({ weight: mapWeight(updated) });
  }

  const [row] = await db
    .insert(weightLogs)
    .values({
      userId,
      date: body.date,
      weightKg: String(body.weightKg),
      notes: body.notes?.trim() || null,
    })
    .returning();

  return c.json({ weight: mapWeight(row) }, 201);
});

weightRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: UpdateWeightLogRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (body.weightKg !== undefined && !isNumberInRange(body.weightKg, WEIGHT_KG_RANGE.min, WEIGHT_KG_RANGE.max)) {
    return c.json({ error: 'weightKg must be between 0 and 1000' }, 400);
  }
  if (body.date !== undefined && !isIsoDate(body.date)) {
    return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  }
  if (!isWithinLength(body.notes, NOTES_MAX_LENGTH)) {
    return c.json({ error: `notes must be ${NOTES_MAX_LENGTH} characters or fewer` }, 400);
  }

  const updates: Partial<typeof weightLogs.$inferInsert> = {};
  if (body.date !== undefined) updates.date = body.date;
  if (body.weightKg !== undefined) updates.weightKg = String(body.weightKg);
  if ('notes' in body) updates.notes = body.notes?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  const [row] = await db
    .update(weightLogs)
    .set(updates)
    .where(and(eq(weightLogs.id, id), eq(weightLogs.userId, userId)))
    .returning();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ weight: mapWeight(row) });
});

weightRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await db
    .delete(weightLogs)
    .where(and(eq(weightLogs.id, id), eq(weightLogs.userId, userId)))
    .returning({ id: weightLogs.id });

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ success: true });
});

export { weightRoutes };
