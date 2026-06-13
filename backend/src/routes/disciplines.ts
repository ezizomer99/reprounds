import { Hono } from 'hono';
import { and, eq, isNull, or } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CreateDisciplineRequest,
  UpdateDisciplineRequest,
  Discipline,
  DisciplineListResponse,
} from '@app/shared';
import type { FieldConfig } from '@app/shared';

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

const disciplineRoutes = new Hono<Env>();

disciplineRoutes.use('*', authMiddleware);

disciplineRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const rows = await db
    .select()
    .from(disciplines)
    .where(or(isNull(disciplines.userId), eq(disciplines.userId, userId)))
    .orderBy(disciplines.name);

  const result: DisciplineListResponse = {
    disciplines: rows.map((r): Discipline => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      category: r.category,
      fieldConfig: (r.fieldConfig as FieldConfig) ?? [],
      createdAt: r.createdAt.toISOString(),
    })),
  };

  return c.json(result);
});

disciplineRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateDisciplineRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.name || !body.category) {
    return c.json({ error: 'name and category are required' }, 400);
  }

  const [row] = await db
    .insert(disciplines)
    .values({
      userId,
      name: body.name,
      category: body.category,
      fieldConfig: body.fieldConfig ?? [],
    })
    .returning();

  const discipline: Discipline = {
    id: row.id,
    userId: row.userId,
    name: row.name,
    category: row.category,
    fieldConfig: (row.fieldConfig as FieldConfig) ?? [],
    createdAt: row.createdAt.toISOString(),
  };

  return c.json({ discipline }, 201);
});

disciplineRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const existing = await db
    .select()
    .from(disciplines)
    .where(and(eq(disciplines.id, id), eq(disciplines.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateDisciplineRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const updates: Partial<typeof disciplines.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.category !== undefined) updates.category = body.category;
  if (body.fieldConfig !== undefined) updates.fieldConfig = body.fieldConfig;

  if (Object.keys(updates).length === 0) {
    const current = existing[0];
    const discipline: Discipline = {
      id: current.id,
      userId: current.userId,
      name: current.name,
      category: current.category,
      fieldConfig: (current.fieldConfig as FieldConfig) ?? [],
      createdAt: current.createdAt.toISOString(),
    };
    return c.json({ discipline });
  }

  const [row] = await db
    .update(disciplines)
    .set(updates)
    .where(and(eq(disciplines.id, id), eq(disciplines.userId, userId)))
    .returning();

  const discipline: Discipline = {
    id: row.id,
    userId: row.userId,
    name: row.name,
    category: row.category,
    fieldConfig: (row.fieldConfig as FieldConfig) ?? [],
    createdAt: row.createdAt.toISOString(),
  };

  return c.json({ discipline });
});

disciplineRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const existing = await db
    .select({ id: disciplines.id })
    .from(disciplines)
    .where(and(eq(disciplines.id, id), eq(disciplines.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db
    .delete(disciplines)
    .where(and(eq(disciplines.id, id), eq(disciplines.userId, userId)));

  return c.json({ success: true });
});

export { disciplineRoutes };
