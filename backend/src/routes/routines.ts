import { Hono } from 'hono';
import { and, asc, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines, exercises, routineItems, routines, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { findRoutineTemplate } from '@app/shared';
import { matchDiscipline, matchExercise } from '../lib/routineTemplates';
import type {
  AddRoutineItemRequest,
  CreateFromTemplateRequest,
  CreateFromTemplateResponse,
  CreateRoutineRequest,
  ReorderRoutineItemsRequest,
  RoutineItemWithDetails,
  RoutineListResponse,
  RoutineWithItems,
  SkippedTemplateItem,
  SkipOccurrenceRequest,
  UpdateRoutineItemRequest,
  UpdateRoutineRequest,
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

const routineRoutes = new Hono<Env>();

routineRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

function routineMeta(row: typeof routines.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    dayLabel: row.dayLabel,
    notes: row.notes,
    rrule: row.rrule ?? null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    timeOfDay: row.timeOfDay ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const itemSelect = {
  id: routineItems.id,
  routineId: routineItems.routineId,
  kind: routineItems.kind,
  exerciseId: routineItems.exerciseId,
  disciplineId: routineItems.disciplineId,
  orderIndex: routineItems.orderIndex,
  supersetGroup: routineItems.supersetGroup,
  defaultRestSeconds: routineItems.defaultRestSeconds,
  target: routineItems.target,
  exerciseName: exercises.name,
  disciplineName: disciplines.name,
};

function mapItem(item: {
  id: string;
  routineId: string;
  kind: 'exercise' | 'martial_arts';
  exerciseId: string | null;
  disciplineId: string | null;
  orderIndex: number;
  supersetGroup: number | null;
  defaultRestSeconds: number | null;
  target: unknown;
  exerciseName: string | null;
  disciplineName: string | null;
}): RoutineItemWithDetails {
  return {
    id: item.id,
    routineId: item.routineId,
    kind: item.kind,
    exerciseId: item.exerciseId,
    disciplineId: item.disciplineId,
    orderIndex: item.orderIndex,
    supersetGroup: item.supersetGroup,
    defaultRestSeconds: item.defaultRestSeconds,
    target: item.target as Record<string, unknown> | null,
    exerciseName: item.exerciseName ?? null,
    disciplineName: item.disciplineName ?? null,
  };
}

async function fetchRoutineWithItems(
  db: ReturnType<typeof createDb>,
  routineId: string,
  userId: string,
): Promise<RoutineWithItems | null> {
  const [routine] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  if (!routine) return null;

  const items = await db
    .select(itemSelect)
    .from(routineItems)
    .leftJoin(exercises, eq(routineItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(routineItems.disciplineId, disciplines.id))
    .where(eq(routineItems.routineId, routineId))
    .orderBy(asc(routineItems.orderIndex));

  return {
    ...routineMeta(routine),
    items: items.map(mapItem),
  };
}

/**
 * Build a routine_items.target (`{ sets: PlannedSet[] }`) from a template's
 * set count + reps string. "AMRAP" → amrap set; "30s" → duration; a plain
 * number → planned reps. Returns null when there's no set target.
 */
function plannedSetsFromTemplate(
  count: number | undefined,
  reps: string | undefined,
): { sets: Array<{ setType: string; reps: number | null; durationSeconds: number | null }> } | null {
  if (!count || count < 1) return null;
  const r = (reps ?? '').trim().toLowerCase();

  let setType = 'normal';
  let plannedReps: number | null = null;
  let durationSeconds: number | null = null;

  if (r === 'amrap') {
    setType = 'amrap';
  } else if (/^\d+\s*s$/.test(r)) {
    durationSeconds = parseInt(r, 10);
  } else if (/^\d+$/.test(r)) {
    plannedReps = parseInt(r, 10);
  }

  const one = { setType, reps: plannedReps, durationSeconds };
  return { sets: Array.from({ length: Math.min(count, 30) }, () => ({ ...one })) };
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

routineRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const userRoutines = await db
    .select()
    .from(routines)
    .where(eq(routines.userId, userId))
    .orderBy(desc(routines.createdAt));

  if (userRoutines.length === 0) {
    const result: RoutineListResponse = { routines: [] };
    return c.json(result);
  }

  const routineIds = userRoutines.map((r) => r.id);

  const allItems = await db
    .select(itemSelect)
    .from(routineItems)
    .leftJoin(exercises, eq(routineItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(routineItems.disciplineId, disciplines.id))
    .where(inArray(routineItems.routineId, routineIds))
    .orderBy(asc(routineItems.orderIndex));

  const itemsByRoutineId = new Map<string, RoutineItemWithDetails[]>();
  for (const item of allItems) {
    const list = itemsByRoutineId.get(item.routineId) ?? [];
    list.push(mapItem(item));
    itemsByRoutineId.set(item.routineId, list);
  }

  const result: RoutineListResponse = {
    routines: userRoutines.map((routine): RoutineWithItems => ({
      ...routineMeta(routine),
      items: itemsByRoutineId.get(routine.id) ?? [],
    })),
  };

  return c.json(result);
});

routineRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  let body: CreateRoutineRequest;
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
    const [routine] = await tx
      .insert(routines)
      .values({
        userId,
        name: body.name,
        dayLabel: body.dayLabel ?? null,
        notes: body.notes ?? null,
        rrule: body.rrule ?? null,
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        timeOfDay: body.timeOfDay ?? null,
      })
      .returning();

    if (body.items && body.items.length > 0) {
      await tx.insert(routineItems).values(
        body.items.map((item, index) => ({
          routineId: routine.id,
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

    return routine;
  });

  const routine = await fetchRoutineWithItems(db, result.id, userId);
  return c.json({ routine }, 201);
});

// POST /routines/from-template — clone a starter template into the user's
// routines, resolving exercise/discipline names to global seed rows. Items
// that can't be resolved are reported in `skipped` rather than failing.
routineRoutes.post('/from-template', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  let body: CreateFromTemplateRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const template = findRoutineTemplate(body.templateId);
  if (!template) return c.json({ error: 'Unknown template' }, 404);

  // Resolve names against the global seed catalog (user_id IS NULL).
  const globalExercises = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(isNull(exercises.userId));
  const globalDisciplines = await db
    .select({ id: disciplines.id, name: disciplines.name })
    .from(disciplines)
    .where(isNull(disciplines.userId));

  const skipped: SkippedTemplateItem[] = [];

  const createdIds = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const day of template.routines) {
      const [routine] = await tx
        .insert(routines)
        .values({ userId, name: day.name, dayLabel: day.dayLabel ?? null })
        .returning();
      ids.push(routine.id);

      const itemValues: (typeof routineItems.$inferInsert)[] = [];
      for (const item of day.items) {
        if (item.kind === 'exercise') {
          const exerciseId = matchExercise(item.name, globalExercises);
          if (!exerciseId) {
            skipped.push({ routineName: day.name, itemName: item.name, reason: 'exercise not found' });
            continue;
          }
          itemValues.push({
            routineId: routine.id,
            kind: 'exercise',
            exerciseId,
            orderIndex: itemValues.length,
            target: plannedSetsFromTemplate(item.sets, item.reps),
          });
        } else {
          const disciplineId = matchDiscipline(item.disciplineName, globalDisciplines);
          if (!disciplineId) {
            skipped.push({ routineName: day.name, itemName: item.disciplineName, reason: 'discipline not found' });
            continue;
          }
          itemValues.push({
            routineId: routine.id,
            kind: 'martial_arts',
            disciplineId,
            orderIndex: itemValues.length,
          });
        }
      }

      if (itemValues.length > 0) {
        await tx.insert(routineItems).values(itemValues);
      }
    }
    return ids;
  });

  const created = await Promise.all(
    createdIds.map((id) => fetchRoutineWithItems(db, id, userId)),
  );
  const result: CreateFromTemplateResponse = {
    routines: created.filter((r): r is RoutineWithItems => r !== null),
    skipped,
  };
  return c.json(result, 201);
});

routineRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateRoutineRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const updates: Partial<typeof routines.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if ('dayLabel' in body) updates.dayLabel = body.dayLabel ?? null;
  if ('notes' in body) updates.notes = body.notes ?? null;
  if ('rrule' in body) updates.rrule = body.rrule ?? null;
  if ('startDate' in body) updates.startDate = body.startDate ?? null;
  if ('endDate' in body) updates.endDate = body.endDate ?? null;
  if ('timeOfDay' in body) updates.timeOfDay = body.timeOfDay ?? null;

  if (Object.keys(updates).length > 0) {
    await db
      .update(routines)
      .set(updates)
      .where(and(eq(routines.id, id), eq(routines.userId, userId)));
  }

  const routine = await fetchRoutineWithItems(db, id, userId);
  return c.json({ routine });
});

routineRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  // sessions.routine_id is ON DELETE NO ACTION, so past sessions generated by
  // this routine would block the delete with a raw FK 500. Deleting an old
  // program is legitimate — detach its history rather than losing or blocking it.
  await db
    .update(sessions)
    .set({ routineId: null })
    .where(and(eq(sessions.routineId, id), eq(sessions.userId, userId)));

  await db
    .delete(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId)));

  return c.json({ success: true });
});

// POST /routines/:id/skip — mark a single scheduled occurrence as skipped
routineRoutes.post('/:id/skip', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const [existing] = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  let body: SkipOccurrenceRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.date) return c.json({ error: 'date is required' }, 400);

  const [existingSession] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.routineId, id), eq(sessions.date, body.date), eq(sessions.userId, userId)))
    .limit(1);

  if (existingSession) {
    await db
      .update(sessions)
      .set({ status: 'skipped' })
      .where(eq(sessions.id, existingSession.id));
  } else {
    await db
      .insert(sessions)
      .values({ userId, routineId: id, date: body.date, status: 'skipped' });
  }

  return new Response(null, { status: 204 });
});

routineRoutes.post('/:id/items', async (c) => {
  const userId = c.get('userId');
  const routineId = c.req.param('id');
  const db = getDb(c.env);

  const existing = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: AddRoutineItemRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const err = validateItemKind(body);
  if (err) return c.json({ error: err }, 400);

  const [maxRow] = await db
    .select({ maxOrder: max(routineItems.orderIndex) })
    .from(routineItems)
    .where(eq(routineItems.routineId, routineId));

  const nextIndex = (maxRow?.maxOrder ?? -1) + 1;

  const [inserted] = await db
    .insert(routineItems)
    .values({
      routineId,
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
    .select(itemSelect)
    .from(routineItems)
    .leftJoin(exercises, eq(routineItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(routineItems.disciplineId, disciplines.id))
    .where(eq(routineItems.id, inserted.id))
    .limit(1);

  return c.json({ item: mapItem(enriched) }, 201);
});

routineRoutes.patch('/:id/items/:itemId', async (c) => {
  const userId = c.get('userId');
  const routineId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const itemCheck = await db
    .select({ id: routineItems.id })
    .from(routineItems)
    .where(and(eq(routineItems.id, itemId), eq(routineItems.routineId, routineId)))
    .limit(1);

  if (itemCheck.length === 0) {
    return c.json({ error: 'Item not found' }, 404);
  }

  let body: UpdateRoutineItemRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const updates: Partial<typeof routineItems.$inferInsert> = {};
  if ('orderIndex' in body && body.orderIndex !== undefined) updates.orderIndex = body.orderIndex;
  if ('supersetGroup' in body) updates.supersetGroup = body.supersetGroup ?? null;
  if ('defaultRestSeconds' in body) updates.defaultRestSeconds = body.defaultRestSeconds ?? null;
  if ('target' in body) updates.target = body.target ?? null;

  if (Object.keys(updates).length > 0) {
    await db
      .update(routineItems)
      .set(updates)
      .where(and(eq(routineItems.id, itemId), eq(routineItems.routineId, routineId)));
  }

  const [enriched] = await db
    .select(itemSelect)
    .from(routineItems)
    .leftJoin(exercises, eq(routineItems.exerciseId, exercises.id))
    .leftJoin(disciplines, eq(routineItems.disciplineId, disciplines.id))
    .where(eq(routineItems.id, itemId))
    .limit(1);

  return c.json({ item: mapItem(enriched) });
});

routineRoutes.delete('/:id/items/:itemId', async (c) => {
  const userId = c.get('userId');
  const routineId = c.req.param('id');
  const itemId = c.req.param('itemId');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  const itemCheck = await db
    .select({ id: routineItems.id })
    .from(routineItems)
    .where(and(eq(routineItems.id, itemId), eq(routineItems.routineId, routineId)))
    .limit(1);

  if (itemCheck.length === 0) {
    return c.json({ error: 'Item not found' }, 404);
  }

  await db
    .delete(routineItems)
    .where(and(eq(routineItems.id, itemId), eq(routineItems.routineId, routineId)));

  return c.json({ success: true });
});

routineRoutes.put('/:id/items/order', async (c) => {
  const userId = c.get('userId');
  const routineId = c.req.param('id');
  const db = getDb(c.env);

  const ownerCheck = await db
    .select({ id: routines.id })
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.userId, userId)))
    .limit(1);

  if (ownerCheck.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: ReorderRoutineItemsRequest;
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
        .update(routineItems)
        .set({ orderIndex: i })
        .where(
          and(
            eq(routineItems.id, body.order[i]),
            eq(routineItems.routineId, routineId),
          ),
        );
    }
  });

  return c.json({ success: true });
});

export { routineRoutes };
