import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { weightLogs } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CreateWeightLogRequest,
  WeightLog,
  WeightLogListResponse,
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

  if (!body.date || typeof body.weightKg !== 'number' || !Number.isFinite(body.weightKg)) {
    return c.json({ error: 'date and a numeric weightKg are required' }, 400);
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
