import { Hono } from 'hono';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { RRule } from 'rrule';
import { createDb } from '../db';
import { scheduleRules, sessions } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import type { CalendarItem } from '@app/shared';

type Env = {
  Bindings: {
    HYPERDRIVE?: Hyperdrive;
    DATABASE_URL?: string;
    JWT_SECRET: string;
    GOOGLE_CLIENT_ID: string;
  };
  Variables: { userId: string };
};

const calendarRoutes = new Hono<Env>();

calendarRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
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

export function projectOccurrences(
  rules: (typeof scheduleRules.$inferSelect)[],
  existingSessions: (typeof sessions.$inferSelect)[],
  from: string,
  to: string,
): CalendarItem[] {
  const realItems: CalendarItem[] = existingSessions.map((s) => ({
    kind: 'real',
    session: mapSession(s),
  }));

  const materialized = new Set<string>();
  for (const s of existingSessions) {
    if (s.scheduleRuleId) {
      materialized.add(`${s.scheduleRuleId}:${s.date}`);
    }
  }

  const virtualItems: CalendarItem[] = [];

  for (const rule of rules) {
    const dtstart = new Date(rule.startDate + 'T00:00:00Z');
    const parsed = RRule.parseString(rule.rrule);
    const rruleObj = new RRule({
      ...parsed,
      dtstart,
      until: rule.endDate ? new Date(rule.endDate + 'T23:59:59Z') : undefined,
    });

    const fromDt = new Date(from + 'T00:00:00Z');
    const toDt = new Date(to + 'T23:59:59Z');
    const occurrences = rruleObj.between(fromDt, toDt, true);

    for (const d of occurrences) {
      const dateStr = d.toISOString().slice(0, 10);
      if (!materialized.has(`${rule.id}:${dateStr}`)) {
        virtualItems.push({
          kind: 'virtual',
          date: dateStr,
          scheduleRuleId: rule.id,
          templateId: rule.templateId,
        });
      }
    }
  }

  const allItems = [...realItems, ...virtualItems];
  allItems.sort((a, b) => {
    const dateA = a.kind === 'real' ? a.session.date : a.date;
    const dateB = b.kind === 'real' ? b.session.date : b.date;
    return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
  });

  return allItems;
}

// GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
calendarRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!from || !to) {
    return c.json({ error: 'from and to query params are required' }, 400);
  }

  const db = getDb(c.env);

  const rules = await db
    .select()
    .from(scheduleRules)
    .where(
      and(
        eq(scheduleRules.userId, userId),
        lte(scheduleRules.startDate, to),
        or(
          isNull(scheduleRules.endDate),
          gte(scheduleRules.endDate, from),
        ),
      ),
    );

  const sessionRows = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, userId),
        gte(sessions.date, from),
        lte(sessions.date, to),
      ),
    );

  const items = projectOccurrences(rules, sessionRows, from, to);

  return c.json({ items });
});

export { calendarRoutes };
