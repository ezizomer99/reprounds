import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines, exercises, templateItems, templates } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  AddTemplateItemRequest,
  CreateTemplateRequest,
  ReorderTemplateItemsRequest,
  TemplateItemWithDetails,
  TemplateListResponse,
  TemplateWithItems,
  UpdateTemplateRequest,
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

const templateRoutes = new Hono<Env>();

templateRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

async function fetchTemplateWithItems(
  db: ReturnType<typeof createDb>,
  templateId: string,
  userId: string,
): Promise<TemplateWithItems | null> {
  const [tmpl] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);

  if (!tmpl) return null;

  const items = await db
    .select({
      id: templateItems.id,
      templateId: templateItems.templateId,
      kind: templateItems.kind,
      exerciseId: templateItems.exerciseId,
      disciplineId: templateItems.disciplineId,
      orderIndex: templateItems.orderIndex,
      supersetGroup: templateItems.supersetGroup,
      defaultRestSeconds: templateItems.defaultRestSeconds,
      target: templateItems.target,
      exerciseName: exercises.name,
      disciplineName: disciplines.name,
    })
    .from(templateItems)
    .leftJoin(exercises, eq(templateItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(templateItems.disciplineId, disciplines.id))
    .where(eq(templateItems.templateId, templateId))
    .orderBy(asc(templateItems.orderIndex));

  return {
    id: tmpl.id,
    userId: tmpl.userId,
    name: tmpl.name,
    dayLabel: tmpl.dayLabel,
    notes: tmpl.notes,
    createdAt: tmpl.createdAt.toISOString(),
    items: items.map((item): TemplateItemWithDetails => ({
      id: item.id,
      templateId: item.templateId,
      kind: item.kind,
      exerciseId: item.exerciseId,
      disciplineId: item.disciplineId,
      orderIndex: item.orderIndex,
      supersetGroup: item.supersetGroup,
      defaultRestSeconds: item.defaultRestSeconds,
      target: item.target as Record<string, unknown> | null,
      exerciseName: item.exerciseName ?? null,
      disciplineName: item.disciplineName ?? null,
    })),
  };
}

function validateItemKind(item: { kind: string; exerciseId?: string | null; disciplineId?: string | null }): string | null {
  if (item.kind === 'exercise' && !item.exerciseId) {
    return 'exerciseId is required when kind is exercise';
  }
  if (item.kind === 'martial_arts' && !item.disciplineId) {
    return 'disciplineId is required when kind is martial_arts';
  }
  return null;
}

templateRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const userTemplates = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.createdAt));

  if (userTemplates.length === 0) {
    const result: TemplateListResponse = { templates: [] };
    return c.json(result);
  }

  const templateIds = userTemplates.map((t) => t.id);

  const allItems = await db
    .select({
      id: templateItems.id,
      templateId: templateItems.templateId,
      kind: templateItems.kind,
      exerciseId: templateItems.exerciseId,
      disciplineId: templateItems.disciplineId,
      orderIndex: templateItems.orderIndex,
      supersetGroup: templateItems.supersetGroup,
      defaultRestSeconds: templateItems.defaultRestSeconds,
      target: templateItems.target,
      exerciseName: exercises.name,
      disciplineName: disciplines.name,
    })
    .from(templateItems)
    .leftJoin(exercises, eq(templateItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(templateItems.disciplineId, disciplines.id))
    .where(inArray(templateItems.templateId, templateIds))
    .orderBy(asc(templateItems.orderIndex));

  const itemsByTemplateId = new Map<string, TemplateItemWithDetails[]>();
  for (const item of allItems) {
    const list = itemsByTemplateId.get(item.templateId) ?? [];
    list.push({
      id: item.id,
      templateId: item.templateId,
      kind: item.kind,
      exerciseId: item.exerciseId,
      disciplineId: item.disciplineId,
      orderIndex: item.orderIndex,
      supersetGroup: item.supersetGroup,
      defaultRestSeconds: item.defaultRestSeconds,
      target: item.target as Record<string, unknown> | null,
      exerciseName: item.exerciseName ?? null,
      disciplineName: item.disciplineName ?? null,
    });
    itemsByTemplateId.set(item.templateId, list);
  }

  const result: TemplateListResponse = {
    templates: userTemplates.map((tmpl): TemplateWithItems => ({
      id: tmpl.id,
      userId: tmpl.userId,
      name: tmpl.name,
      dayLabel: tmpl.dayLabel,
      notes: tmpl.notes,
      createdAt: tmpl.createdAt.toISOString(),
      items: itemsByTemplateId.get(tmpl.id) ?? [],
    })),
  };

  return c.json(result);
});

templateRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  let body: CreateTemplateRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  if (body.items) {
    for (const item of body.items) {
      const err = validateItemKind(item);
      if (err) return c.json({ error: err }, 400);
    }
  }

  const result = await db.transaction(async (tx) => {
    const [tmpl] = await tx
      .insert(templates)
      .values({
        userId,
        name: body.name,
        dayLabel: body.dayLabel ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    if (body.items && body.items.length > 0) {
      await tx.insert(templateItems).values(
        body.items.map((item, index) => ({
          templateId: tmpl.id,
          kind: item.kind,
          exerciseId: item.exerciseId ?? null,
          disciplineId: item.disciplineId ?? null,
          orderIndex: item.orderIndex ?? index,
          supersetGroup: item.supersetGroup ?? null,
          defaultRestSeconds: item.defaultRestSeconds ?? null,
          target: item.target ?? null,
        })),
      );
    }

    return tmpl;
  });

  const template = await fetchTemplateWithItems(db, result.id, userId);
  return c.json({ template }, 201);
});

templateRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateTemplateRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const updates: Partial<typeof templates.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if ('dayLabel' in body) updates.dayLabel = body.dayLabel ?? null;
  if ('notes' in body) updates.notes = body.notes ?? null;

  if (Object.keys(updates).length > 0) {
    await db
      .update(templates)
      .set(updates)
      .where(and(eq(templates.id, id), eq(templates.userId, userId)));
  }

  const template = await fetchTemplateWithItems(db, id, userId);
  return c.json({ template });
});

templateRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db
    .delete(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)));

  return c.json({ success: true });
});

templateRoutes.post('/:id/items', async (c) => {
  const userId = c.get('userId');
  const templateId = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: AddTemplateItemRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const err = validateItemKind(body);
  if (err) return c.json({ error: err }, 400);

  const [maxRow] = await db
    .select({ maxOrder: max(templateItems.orderIndex) })
    .from(templateItems)
    .where(eq(templateItems.templateId, templateId));

  const nextIndex = (maxRow?.maxOrder ?? -1) + 1;

  const [inserted] = await db
    .insert(templateItems)
    .values({
      templateId,
      kind: body.kind,
      exerciseId: body.exerciseId ?? null,
      disciplineId: body.disciplineId ?? null,
      orderIndex: body.orderIndex ?? nextIndex,
      supersetGroup: body.supersetGroup ?? null,
      defaultRestSeconds: body.defaultRestSeconds ?? null,
      target: body.target ?? null,
    })
    .returning();

  const [enriched] = await db
    .select({
      id: templateItems.id,
      templateId: templateItems.templateId,
      kind: templateItems.kind,
      exerciseId: templateItems.exerciseId,
      disciplineId: templateItems.disciplineId,
      orderIndex: templateItems.orderIndex,
      supersetGroup: templateItems.supersetGroup,
      defaultRestSeconds: templateItems.defaultRestSeconds,
      target: templateItems.target,
      exerciseName: exercises.name,
      disciplineName: disciplines.name,
    })
    .from(templateItems)
    .leftJoin(exercises, eq(templateItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(templateItems.disciplineId, disciplines.id))
    .where(eq(templateItems.id, inserted.id))
    .limit(1);

  const item: TemplateItemWithDetails = {
    id: enriched.id,
    templateId: enriched.templateId,
    kind: enriched.kind,
    exerciseId: enriched.exerciseId,
    disciplineId: enriched.disciplineId,
    orderIndex: enriched.orderIndex,
    supersetGroup: enriched.supersetGroup,
    defaultRestSeconds: enriched.defaultRestSeconds,
    target: enriched.target as Record<string, unknown> | null,
    exerciseName: enriched.exerciseName ?? null,
    disciplineName: enriched.disciplineName ?? null,
  };

  return c.json({ item }, 201);
});

templateRoutes.delete('/:id/items/:itemId', async (c) => {
  const userId = c.get('userId');
  const templateId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const itemCheck = await db
    .select({ id: templateItems.id })
    .from(templateItems)
    .where(and(eq(templateItems.id, itemId), eq(templateItems.templateId, templateId)))
    .limit(1);

  if (itemCheck.length === 0) {
    return c.json({ error: 'Item not found' }, 404);
  }

  await db
    .delete(templateItems)
    .where(and(eq(templateItems.id, itemId), eq(templateItems.templateId, templateId)));

  return c.json({ success: true });
});

templateRoutes.put('/:id/items/order', async (c) => {
  const userId = c.get('userId');
  const templateId = c.req.param('id');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: ReorderTemplateItemsRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!Array.isArray(body.order) || body.order.length === 0) {
    return c.json({ error: 'order must be a non-empty array of item IDs' }, 400);
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < body.order.length; i++) {
      await tx
        .update(templateItems)
        .set({ orderIndex: i })
        .where(
          and(
            eq(templateItems.id, body.order[i]),
            eq(templateItems.templateId, templateId),
          ),
        );
    }
  });

  return c.json({ success: true });
});

export { templateRoutes };
