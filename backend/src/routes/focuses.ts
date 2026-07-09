import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { focuses } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CreateFocusRequest,
  Focus,
  FocusListResponse,
  FocusStatus,
  UpdateFocusRequest,
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

const focusRoutes = new Hono<Env>();

focusRoutes.use('*', authMiddleware);

const VALID_STATUSES: FocusStatus[] = ['active', 'achieved', 'archived'];

function mapFocus(row: typeof focuses.$inferSelect): Focus {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

focusRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const rows = await db
    .select()
    .from(focuses)
    .where(eq(focuses.userId, userId))
    .orderBy(desc(focuses.updatedAt));

  const result: FocusListResponse = { focuses: rows.map(mapFocus) };
  return c.json(result);
});

focusRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateFocusRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const title = body.title?.trim();
  if (!title) {
    return c.json({ error: 'title is required' }, 400);
  }

  const notes = body.notes?.trim() || null;

  const [row] = await db.insert(focuses).values({ userId, title, notes }).returning();

  return c.json({ focus: mapFocus(row) }, 201);
});

focusRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: UpdateFocusRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const update: Partial<typeof focuses.$inferInsert> = { updatedAt: new Date() };

  if (body.title !== undefined) {
    const title = body.title?.trim();
    if (!title) {
      return c.json({ error: 'title is required' }, 400);
    }
    update.title = title;
  }

  if (body.notes !== undefined) {
    update.notes = body.notes?.trim() || null;
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }
    update.status = body.status;
  }

  const [row] = await db
    .update(focuses)
    .set(update)
    .where(and(eq(focuses.id, id), eq(focuses.userId, userId)))
    .returning();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ focus: mapFocus(row) });
});

focusRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await db
    .delete(focuses)
    .where(and(eq(focuses.id, id), eq(focuses.userId, userId)))
    .returning({ id: focuses.id });

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ success: true });
});

export { focusRoutes };
