import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { partners } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CreatePartnerRequest,
  Partner,
  PartnerListResponse,
  UpdatePartnerRequest,
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

const partnerRoutes = new Hono<Env>();

partnerRoutes.use('*', authMiddleware);

function mapPartner(row: typeof partners.$inferSelect): Partner {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

partnerRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const rows = await db
    .select()
    .from(partners)
    .where(eq(partners.userId, userId))
    .orderBy(partners.name);

  const result: PartnerListResponse = { partners: rows.map(mapPartner) };
  return c.json(result);
});

partnerRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreatePartnerRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const [row] = await db.insert(partners).values({ userId, name }).returning();

  return c.json({ partner: mapPartner(row) }, 201);
});

partnerRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: UpdatePartnerRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  const [row] = await db
    .update(partners)
    .set({ name })
    .where(and(eq(partners.id, id), eq(partners.userId, userId)))
    .returning();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ partner: mapPartner(row) });
});

partnerRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await db
    .delete(partners)
    .where(and(eq(partners.id, id), eq(partners.userId, userId)))
    .returning({ id: partners.id });

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ success: true });
});

export { partnerRoutes };
