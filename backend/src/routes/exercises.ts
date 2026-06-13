import { Hono } from 'hono';
import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import { createDb } from '../db';
import { exercises } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CreateExerciseRequest,
  UpdateExerciseRequest,
  Exercise,
  ExerciseListResponse,
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

const exerciseRoutes = new Hono<Env>();

exerciseRoutes.use('*', authMiddleware);

exerciseRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const typeFilter = c.req.query('type') as string | undefined;
  const search = c.req.query('search');

  const conditions = [or(isNull(exercises.userId), eq(exercises.userId, userId))!];

  if (typeFilter) {
    conditions.push(eq(exercises.type, typeFilter as 'strength' | 'conditioning' | 'martial_arts'));
  }

  if (search) {
    conditions.push(ilike(exercises.name, `%${search}%`));
  }

  const rows = await db
    .select()
    .from(exercises)
    .where(and(...conditions))
    .orderBy(exercises.name);

  const result: ExerciseListResponse = {
    exercises: rows.map((r): Exercise => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      type: r.type as Exercise['type'],
      defaultRestSeconds: r.defaultRestSeconds,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return c.json(result);
});

exerciseRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateExerciseRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.name || !body.type) {
    return c.json({ error: 'name and type are required' }, 400);
  }

  const [row] = await db
    .insert(exercises)
    .values({
      userId,
      name: body.name,
      type: body.type,
      defaultRestSeconds: body.defaultRestSeconds ?? null,
    })
    .returning();

  const exercise: Exercise = {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as Exercise['type'],
    defaultRestSeconds: row.defaultRestSeconds,
    createdAt: row.createdAt.toISOString(),
  };

  return c.json({ exercise }, 201);
});

exerciseRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const existing = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateExerciseRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const updates: Partial<typeof exercises.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if ('defaultRestSeconds' in body) updates.defaultRestSeconds = body.defaultRestSeconds ?? null;

  if (Object.keys(updates).length === 0) {
    const current = existing[0];
    const exercise: Exercise = {
      id: current.id,
      userId: current.userId,
      name: current.name,
      type: current.type as Exercise['type'],
      defaultRestSeconds: current.defaultRestSeconds,
      createdAt: current.createdAt.toISOString(),
    };
    return c.json({ exercise });
  }

  const [row] = await db
    .update(exercises)
    .set(updates)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .returning();

  const exercise: Exercise = {
    id: row.id,
    userId: row.userId,
    name: row.name,
    type: row.type as Exercise['type'],
    defaultRestSeconds: row.defaultRestSeconds,
    createdAt: row.createdAt.toISOString(),
  };

  return c.json({ exercise });
});

exerciseRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const existing = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db
    .delete(exercises)
    .where(and(eq(exercises.id, id), eq(exercises.userId, userId)));

  return c.json({ success: true });
});

export { exerciseRoutes };
