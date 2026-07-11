import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { rankPromotions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { disciplineVisible } from '../lib/ownership';
import { isNumberInRange } from '@app/shared';
import type {
  CreateRankPromotionRequest,
  RankPromotion,
  RankPromotionListResponse,
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

const promotionRoutes = new Hono<Env>();

promotionRoutes.use('*', authMiddleware);

function mapPromotion(row: typeof rankPromotions.$inferSelect): RankPromotion {
  return {
    id: row.id,
    userId: row.userId,
    disciplineId: row.disciplineId,
    rank: row.rank,
    stripes: row.stripes ?? null,
    date: row.date,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /promotions?disciplineId=...  (disciplineId optional; defaults to all)
promotionRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const disciplineId = c.req.query('disciplineId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const where = disciplineId
    ? and(eq(rankPromotions.userId, userId), eq(rankPromotions.disciplineId, disciplineId))
    : eq(rankPromotions.userId, userId);

  const rows = await db.select().from(rankPromotions).where(where).orderBy(desc(rankPromotions.date));

  const result: RankPromotionListResponse = { promotions: rows.map(mapPromotion) };
  return c.json(result);
});

promotionRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateRankPromotionRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const rank = body.rank?.trim();
  if (!body.disciplineId || !body.date || !rank) {
    return c.json({ error: 'disciplineId, date, and rank are required' }, 400);
  }
  if (body.stripes != null && !isNumberInRange(body.stripes, 0, 20)) {
    return c.json({ error: 'Invalid stripes' }, 400);
  }

  // Guard against tagging a promotion to another user's private discipline (IDOR).
  if (!(await disciplineVisible(db, body.disciplineId, userId))) {
    return c.json({ error: 'Discipline not found' }, 404);
  }

  const [row] = await db
    .insert(rankPromotions)
    .values({
      userId,
      disciplineId: body.disciplineId,
      rank,
      stripes: body.stripes ?? null,
      date: body.date,
      notes: body.notes?.trim() || null,
    })
    .returning();

  return c.json({ promotion: mapPromotion(row) }, 201);
});

promotionRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [row] = await db
    .delete(rankPromotions)
    .where(and(eq(rankPromotions.id, id), eq(rankPromotions.userId, userId)))
    .returning({ id: rankPromotions.id });

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ success: true });
});

export { promotionRoutes };
