import { Hono } from 'hono';
import { and, eq, gte, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { RRule } from 'rrule';
import { createDb } from '../db';
import { routines, sessions } from '../db/schema';
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
    routineId: row.routineId ?? null,
    name: row.name ?? null,
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
  scheduledRoutines: (typeof routines.$inferSelect)[],
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
    if (s.routineId) {
      materialized.add(`${s.routineId}:${s.date}`);
    }
  }

  const virtualItems: CalendarItem[] = [];

  for (const routine of scheduledRoutines) {
    if (!routine.rrule || !routine.startDate) continue;

    const dtstart = new Date(routine.startDate + 'T00:00:00Z');
    const parsed = RRule.parseString(routine.rrule);
    const rruleObj = new RRule({
      ...parsed,
      dtstart,
      until: routine.endDate ? new Date(routine.endDate + 'T23:59:59Z') : undefined,
    });

    const fromDt = new Date(from + 'T00:00:00Z');
    const toDt = new Date(to + 'T23:59:59Z');
    const occurrences = rruleObj.between(fromDt, toDt, true);

    for (const d of occurrences) {
      const dateStr = d.toISOString().slice(0, 10);
      if (!materialized.has(`${routine.id}:${dateStr}`)) {
        virtualItems.push({
          kind: 'virtual',
          date: dateStr,
          routineId: routine.id,
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

  // Malformed dates would otherwise become Invalid Date (RRule.between then
  // silently projects nothing) or throw inside Postgres on the date columns.
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return c.json({ error: 'from and to must be YYYY-MM-DD dates' }, 400);
  }
  if (from > to) {
    return c.json({ error: 'from must be on or before to' }, 400);
  }
  // Cap the window: RRULE expansion is O(occurrences × routines) inside the
  // Worker's CPU budget, so an unbounded range is a self-DoS vector.
  const rangeDays =
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000;
  if (rangeDays > 366) {
    return c.json({ error: 'Date range cannot exceed 366 days' }, 400);
  }

  const db = getDb(c.env);

  const scheduledRoutines = await db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.userId, userId),
        isNotNull(routines.rrule),
        lte(routines.startDate, to),
        or(
          isNull(routines.endDate),
          gte(routines.endDate, from),
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

  const items = projectOccurrences(scheduledRoutines, sessionRows, from, to);

  return c.json({ items });
});

export { calendarRoutes };
