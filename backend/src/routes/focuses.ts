import { Hono } from 'hono';
import { and, count, desc, eq, inArray, max } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines, sessionFocuses, sessions, trainingFocuses } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { disciplineVisible } from '../lib/ownership';
import { isFocusStatus } from '@app/shared';
import type {
  CreateFocusRequest,
  FocusListResponse,
  FocusWithStats,
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

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

// GET /focuses[?status=active]
focusRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);
  const statusParam = c.req.query('status');
  const statusFilter = isFocusStatus(statusParam) ? statusParam : null;

  const rows = await db
    .select({
      id: trainingFocuses.id,
      userId: trainingFocuses.userId,
      disciplineId: trainingFocuses.disciplineId,
      title: trainingFocuses.title,
      notes: trainingFocuses.notes,
      status: trainingFocuses.status,
      achievedAt: trainingFocuses.achievedAt,
      createdAt: trainingFocuses.createdAt,
      disciplineName: disciplines.name,
    })
    .from(trainingFocuses)
    .leftJoin(disciplines, eq(trainingFocuses.disciplineId, disciplines.id))
    .where(
      statusFilter
        ? and(eq(trainingFocuses.userId, userId), eq(trainingFocuses.status, statusFilter))
        : eq(trainingFocuses.userId, userId),
    )
    .orderBy(desc(trainingFocuses.createdAt));

  if (rows.length === 0) {
    const empty: FocusListResponse = { focuses: [] };
    return c.json(empty);
  }

  const focusIds = rows.map((r) => r.id);

  // One grouped query for every focus's session tally + last-worked date. The
  // inner join to sessions both restricts to real sessions and yields max(date).
  const statRows = await db
    .select({
      focusId: sessionFocuses.focusId,
      sessionCount: count(sessionFocuses.sessionId),
      lastWorkedDate: max(sessions.date),
    })
    .from(sessionFocuses)
    .innerJoin(sessions, eq(sessionFocuses.sessionId, sessions.id))
    .where(inArray(sessionFocuses.focusId, focusIds))
    .groupBy(sessionFocuses.focusId);

  const statsByFocusId = new Map<string, { sessionCount: number; lastWorkedDate: string | null }>();
  for (const s of statRows) {
    statsByFocusId.set(s.focusId, {
      sessionCount: Number(s.sessionCount),
      lastWorkedDate: s.lastWorkedDate ?? null,
    });
  }

  const result: FocusListResponse = {
    focuses: rows.map((r): FocusWithStats => ({
      id: r.id,
      userId: r.userId,
      disciplineId: r.disciplineId,
      title: r.title,
      notes: r.notes,
      status: r.status,
      achievedAt: r.achievedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      disciplineName: r.disciplineName ?? null,
      sessionCount: statsByFocusId.get(r.id)?.sessionCount ?? 0,
      lastWorkedDate: statsByFocusId.get(r.id)?.lastWorkedDate ?? null,
    })),
  };

  return c.json(result);
});

// POST /focuses
focusRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

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

  if (!(await disciplineVisible(db, body.disciplineId, userId))) {
    return c.json({ error: 'Invalid disciplineId' }, 400);
  }

  const [row] = await db
    .insert(trainingFocuses)
    .values({
      userId,
      disciplineId: body.disciplineId ?? null,
      title,
      notes: body.notes ?? null,
    })
    .returning();

  const focus: FocusWithStats = {
    id: row.id,
    userId: row.userId,
    disciplineId: row.disciplineId,
    title: row.title,
    notes: row.notes,
    status: row.status,
    achievedAt: row.achievedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    disciplineName: null,
    sessionCount: 0,
    lastWorkedDate: null,
  };

  return c.json({ focus }, 201);
});

// PATCH /focuses/:id
focusRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const [existing] = await db
    .select({ id: trainingFocuses.id })
    .from(trainingFocuses)
    .where(and(eq(trainingFocuses.id, id), eq(trainingFocuses.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  let body: UpdateFocusRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (body.status !== undefined && !isFocusStatus(body.status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }

  const updates: Partial<typeof trainingFocuses.$inferInsert> = {};
  if (body.title !== undefined) {
    const trimmed = body.title.trim();
    if (!trimmed) return c.json({ error: 'title cannot be empty' }, 400);
    updates.title = trimmed;
  }
  if ('notes' in body) updates.notes = body.notes ?? null;
  if ('disciplineId' in body) {
    if (!(await disciplineVisible(db, body.disciplineId, userId))) {
      return c.json({ error: 'Invalid disciplineId' }, 400);
    }
    updates.disciplineId = body.disciplineId ?? null;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
    // Stamp achievedAt when transitioning to achieved; clear it otherwise so a
    // re-activated focus doesn't keep a stale achievement date.
    updates.achievedAt = body.status === 'achieved' ? new Date() : null;
  }

  if (Object.keys(updates).length > 0) {
    await db
      .update(trainingFocuses)
      .set(updates)
      .where(and(eq(trainingFocuses.id, id), eq(trainingFocuses.userId, userId)));
  }

  return c.json({ success: true });
});

// DELETE /focuses/:id — cascade removes its session_focuses links.
focusRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const db = getDb(c.env);

  const [existing] = await db
    .select({ id: trainingFocuses.id })
    .from(trainingFocuses)
    .where(and(eq(trainingFocuses.id, id), eq(trainingFocuses.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Not found' }, 404);
  }

  await db
    .delete(trainingFocuses)
    .where(and(eq(trainingFocuses.id, id), eq(trainingFocuses.userId, userId)));

  return c.json({ success: true });
});

export { focusRoutes };
