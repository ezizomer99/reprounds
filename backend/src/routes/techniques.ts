import { Hono } from 'hono';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { techniques } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import {
  isDisciplineCat,
  isTechniqueKind,
  MAX_CUSTOM_TECHNIQUES_PER_USER,
  NAME_MAX_LENGTH,
} from '@app/shared';
import { isWithinLength } from '../lib/validate';
import type {
  CreateTechniqueRequest,
  Technique,
  TechniqueListResponse,
  UpdateTechniqueRequest,
} from '@app/shared';

type Env = AppEnv;

const techniqueRoutes = new Hono<Env>();

techniqueRoutes.use('*', authMiddleware);

type TechniqueRow = typeof techniques.$inferSelect;

function mapTechnique(r: TechniqueRow): Technique {
  return {
    id: r.id,
    userId: r.userId,
    kind: r.kind,
    category: r.category,
    value: r.value,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
  };
}

// Machine key stored in the rounds JSONB. Lowercase, collapse any run of
// non-alphanumerics to a single underscore, trim leading/trailing underscores.
// 'Butterfly guard' -> 'butterfly_guard', 'X-guard!' -> 'x_guard'.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// GET /techniques
techniqueRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const kindFilter = c.req.query('kind');
  const categoryFilter = c.req.query('category');

  const conditions = [or(isNull(techniques.userId), eq(techniques.userId, userId))!];
  if (kindFilter === 'position' || kindFilter === 'submission') {
    conditions.push(eq(techniques.kind, kindFilter));
  }
  if (categoryFilter && isDisciplineCat(categoryFilter)) {
    conditions.push(eq(techniques.category, categoryFilter));
  }

  const rows = await db
    .select()
    .from(techniques)
    .where(and(...conditions))
    .orderBy(techniques.label);

  const result: TechniqueListResponse = { techniques: rows.map(mapTechnique) };
  return c.json(result);
});

// POST /techniques — create a user custom
techniqueRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  let body: CreateTechniqueRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.label || !body.kind) {
    return c.json({ error: 'kind and label are required' }, 400);
  }
  if (!isTechniqueKind(body.kind)) {
    return c.json({ error: 'kind must be "position" or "submission"' }, 400);
  }
  const category = body.category ?? 'grappling';
  if (!isDisciplineCat(category)) {
    return c.json({ error: 'Invalid category' }, 400);
  }

  if (!isWithinLength(body.label, NAME_MAX_LENGTH)) {
    return c.json({ error: `label must be ${NAME_MAX_LENGTH} characters or fewer` }, 400);
  }

  const label = body.label.trim();
  const value = slugify(label);
  if (!label || !value) {
    return c.json({ error: 'label must contain at least one letter or number' }, 400);
  }

  // Idempotent: if the user already has this exact (kind, value), return it
  // instead of erroring on the ownerKeyIdx unique index.
  const [existing] = await db
    .select()
    .from(techniques)
    .where(
      and(
        eq(techniques.userId, userId),
        eq(techniques.kind, body.kind),
        eq(techniques.value, value),
      ),
    )
    .limit(1);
  if (existing) {
    return c.json({ technique: mapTechnique(existing) }, 200);
  }

  // Abuse ceiling, not the paywall — see the note on FREE_CUSTOM_TECHNIQUE_LIMIT
  // in @app/shared. Checked after the idempotent re-use above so re-adding an
  // existing custom never trips it.
  const [{ count: customCount }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(techniques)
    .where(eq(techniques.userId, userId));

  if (Number(customCount) >= MAX_CUSTOM_TECHNIQUES_PER_USER) {
    return c.json(
      { error: `You've reached the maximum of ${MAX_CUSTOM_TECHNIQUES_PER_USER} custom techniques` },
      409,
    );
  }

  const [row] = await db
    .insert(techniques)
    .values({ userId, kind: body.kind, category, value, label })
    .returning();

  return c.json({ technique: mapTechnique(row) }, 201);
});

// PATCH /techniques/:id — owned-only; rename only (value stays stable so
// already-logged rounds keep resolving to this row).
techniqueRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [existing] = await db
    .select()
    .from(techniques)
    .where(and(eq(techniques.id, id), eq(techniques.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateTechniqueRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (body.label === undefined || body.label.trim() === '') {
    return c.json({ technique: mapTechnique(existing) });
  }

  const [row] = await db
    .update(techniques)
    .set({ label: body.label.trim() })
    .where(and(eq(techniques.id, id), eq(techniques.userId, userId)))
    .returning();

  return c.json({ technique: mapTechnique(row) });
});

// DELETE /techniques/:id — owned-only. Rounds store technique *values* as free
// strings in JSONB (no FK), so deleting a custom never orphans logged data —
// historical rounds fall back to the label helper for the now-unknown key.
techniqueRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  const [existing] = await db
    .select({ id: techniques.id })
    .from(techniques)
    .where(and(eq(techniques.id, id), eq(techniques.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db
    .delete(techniques)
    .where(and(eq(techniques.id, id), eq(techniques.userId, userId)));

  return c.json({ success: true });
});

export { techniqueRoutes };
