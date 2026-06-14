import { Hono } from 'hono';
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db';
import { scheduleRules, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type {
  CreateScheduleRuleRequest,
  UpdateScheduleRuleRequest,
} from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
  };
  Variables: { userId: string };
};

const scheduleRuleRoutes = new Hono<Env>();

scheduleRuleRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function mapRule(row: typeof scheduleRules.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    templateId: row.templateId,
    rrule: row.rrule,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    timeOfDay: row.timeOfDay ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapSession(row: typeof sessions.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    templateId: row.templateId ?? null,
    scheduleRuleId: row.scheduleRuleId ?? null,
    date: row.date,
    status: row.status,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET /schedule-rules
scheduleRuleRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const rules = await db
    .select()
    .from(scheduleRules)
    .where(eq(scheduleRules.userId, userId))
    .orderBy(scheduleRules.createdAt);

  return c.json({ rules: rules.map(mapRule) });
});

// POST /schedule-rules
scheduleRuleRoutes.post('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  let body: CreateScheduleRuleRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (!body.templateId || !body.rrule || !body.startDate) {
    return c.json({ error: 'templateId, rrule, and startDate are required' }, 400);
  }

  const [inserted] = await db
    .insert(scheduleRules)
    .values({
      userId,
      templateId: body.templateId,
      rrule: body.rrule,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
      timeOfDay: body.timeOfDay ?? null,
    })
    .returning();

  return c.json({ rule: mapRule(inserted) }, 201);
});

// PATCH /schedule-rules/:id
scheduleRuleRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId');
  const ruleId = c.req.param('id');
  const mode = c.req.query('mode') ?? 'all';
  const date = c.req.query('date');
  const db = getDb(c.env);

  const [existing] = await db
    .select()
    .from(scheduleRules)
    .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  let body: UpdateScheduleRuleRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  if (mode === 'all') {
    const updates: Partial<typeof scheduleRules.$inferInsert> = {};
    if (body.templateId !== undefined) updates.templateId = body.templateId;
    if (body.rrule !== undefined) updates.rrule = body.rrule;
    if (body.startDate !== undefined) updates.startDate = body.startDate;
    if ('endDate' in body) updates.endDate = body.endDate ?? null;
    if ('timeOfDay' in body) updates.timeOfDay = body.timeOfDay ?? null;

    const [updated] = await db
      .update(scheduleRules)
      .set(updates)
      .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.userId, userId)))
      .returning();

    return c.json({ rule: mapRule(updated) });
  }

  if (mode === 'following') {
    if (!date) return c.json({ error: 'date is required for mode=following' }, 400);

    await db
      .update(scheduleRules)
      .set({ endDate: subtractOneDay(date) })
      .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.userId, userId)));

    const [newRule] = await db
      .insert(scheduleRules)
      .values({
        userId,
        templateId: body.templateId ?? existing.templateId,
        rrule: body.rrule ?? existing.rrule,
        startDate: date,
        endDate: body.endDate ?? null,
        timeOfDay: body.timeOfDay !== undefined ? (body.timeOfDay ?? null) : (existing.timeOfDay ?? null),
      })
      .returning();

    return c.json({ rule: mapRule(newRule) });
  }

  if (mode === 'single') {
    if (!date) return c.json({ error: 'date is required for mode=single' }, 400);

    const [existingSession] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.scheduleRuleId, ruleId), eq(sessions.date, date)))
      .limit(1);

    if (existingSession) return c.json({ error: 'Session already exists for this date' }, 409);

    const [inserted] = await db
      .insert(sessions)
      .values({
        userId,
        templateId: existing.templateId,
        scheduleRuleId: ruleId,
        date,
        status: 'planned',
      })
      .returning();

    return c.json({ session: mapSession(inserted) }, 201);
  }

  return c.json({ error: 'Invalid mode' }, 400);
});

// DELETE /schedule-rules/:id
scheduleRuleRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const ruleId = c.req.param('id');
  const mode = c.req.query('mode') ?? 'all';
  const date = c.req.query('date');
  const db = getDb(c.env);

  const [existing] = await db
    .select()
    .from(scheduleRules)
    .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.userId, userId)))
    .limit(1);

  if (!existing) return c.json({ error: 'Not found' }, 404);

  if (mode === 'all') {
    await db
      .delete(scheduleRules)
      .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.userId, userId)));

    return new Response(null, { status: 204 });
  }

  if (mode === 'following') {
    if (!date) return c.json({ error: 'date is required for mode=following' }, 400);

    await db
      .update(scheduleRules)
      .set({ endDate: subtractOneDay(date) })
      .where(and(eq(scheduleRules.id, ruleId), eq(scheduleRules.userId, userId)));

    return new Response(null, { status: 204 });
  }

  if (mode === 'single') {
    if (!date) return c.json({ error: 'date is required for mode=single' }, 400);

    const [existingSession] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.scheduleRuleId, ruleId), eq(sessions.date, date)))
      .limit(1);

    if (existingSession) {
      await db
        .update(sessions)
        .set({ status: 'skipped' })
        .where(and(eq(sessions.scheduleRuleId, ruleId), eq(sessions.date, date)));
    } else {
      await db
        .insert(sessions)
        .values({
          userId,
          templateId: existing.templateId,
          scheduleRuleId: ruleId,
          date,
          status: 'skipped',
        });
    }

    return new Response(null, { status: 204 });
  }

  return c.json({ error: 'Invalid mode' }, 400);
});

export { scheduleRuleRoutes };
