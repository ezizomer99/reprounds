import { Hono } from 'hono';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines, fights, rankPromotions, sessionEntries, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { AppEnv } from '../env';
import { isDisciplineCat } from '@app/shared';
import type {
  CreateDisciplineRequest,
  UpdateDisciplineRequest,
  Discipline,
  DisciplineListResponse,
  ExerciseHistoryEntry,
  ExerciseHistoryResponse,
  SessionEntryWithSets,
} from '@app/shared';
import type { FieldConfig } from '@app/shared';

type Env = AppEnv;

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
  if (!isDisciplineCat(body.category)) {
    return c.json({ error: 'Invalid category' }, 400);
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

  if (body.category !== undefined && !isDisciplineCat(body.category)) {
    return c.json({ error: 'Invalid category' }, 400);
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

// GET /disciplines/:id/history
disciplineRoutes.get('/:id/history', async (c) => {
  const userId = c.get('userId');
  const disciplineId = c.req.param('id');
  const db = createDb(c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL!);

  // Bounded like the exercise-history counterpart — this previously returned
  // every entry ever logged (~450 rows/year for a 3×-week practitioner).
  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  const entryRows = await db
    .select({
      entryId: sessionEntries.id,
      sessionId: sessionEntries.sessionId,
      kind: sessionEntries.kind,
      exerciseId: sessionEntries.exerciseId,
      disciplineId: sessionEntries.disciplineId,
      gi: sessionEntries.gi,
      orderIndex: sessionEntries.orderIndex,
      supersetGroup: sessionEntries.supersetGroup,
      restSeconds: sessionEntries.restSeconds,
      details: sessionEntries.details,
      entryNotes: sessionEntries.notes,
      sessionDate: sessions.date,
      disciplineName: disciplines.name,
    })
    .from(sessionEntries)
    .innerJoin(sessions, eq(sessionEntries.sessionId, sessions.id))
    .leftJoin(disciplines, eq(sessionEntries.disciplineId, disciplines.id))
    .where(
      and(
        eq(sessionEntries.disciplineId, disciplineId),
        eq(sessions.userId, userId),
        eq(sessions.status, 'completed'),
      ),
    )
    .orderBy(desc(sessions.date))
    .limit(limit);

  const history: ExerciseHistoryEntry[] = entryRows.map((row) => {
    const entry: SessionEntryWithSets = {
      id: row.entryId,
      sessionId: row.sessionId,
      kind: row.kind,
      exerciseId: row.exerciseId,
      disciplineId: row.disciplineId,
      gi: row.gi,
      orderIndex: row.orderIndex,
      supersetGroup: row.supersetGroup,
      restSeconds: row.restSeconds,
      details: row.details as Record<string, unknown> | null,
      notes: row.entryNotes,
      sets: [],
      exerciseName: null,
      disciplineName: row.disciplineName ?? null,
    };
    return { sessionId: row.sessionId, date: row.sessionDate, entry };
  });

  const result: ExerciseHistoryResponse = { history };
  return c.json(result);
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

  // Logged sessions (NO ACTION), fights and promotions (RESTRICT) all block
  // this delete at the FK level — check first and answer with a clear 409
  // instead of a raw constraint 500.
  const [logged] = await db
    .select({ id: sessionEntries.id })
    .from(sessionEntries)
    .where(eq(sessionEntries.disciplineId, id))
    .limit(1);
  if (logged) {
    return c.json(
      { error: 'This discipline has logged sessions and cannot be deleted' },
      409,
    );
  }

  const [fight] = await db
    .select({ id: fights.id })
    .from(fights)
    .where(eq(fights.disciplineId, id))
    .limit(1);
  const [promotion] = await db
    .select({ id: rankPromotions.id })
    .from(rankPromotions)
    .where(eq(rankPromotions.disciplineId, id))
    .limit(1);
  if (fight || promotion) {
    return c.json(
      { error: 'This discipline has fight or promotion records — delete those first' },
      409,
    );
  }

  await db
    .delete(disciplines)
    .where(and(eq(disciplines.id, id), eq(disciplines.userId, userId)));

  return c.json({ success: true });
});

export { disciplineRoutes };
