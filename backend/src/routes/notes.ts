import { Hono } from 'hono';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { createDb } from '../db';
import { disciplines, exercises, sessionEntries } from '../db/schema';
import { authMiddleware } from '../middleware/auth';
import { isRoundsSession } from '@app/shared';
import type { EntryKind, NoteItem, NotesSessionGroup, NotesTimelineResponse } from '@app/shared';

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

const notesRoutes = new Hono<Env>();

notesRoutes.use('*', authMiddleware);

function getDb(env: Env['Bindings']) {
  return createDb(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL!);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /notes?limit=20&cursor=<date>_<sessionId>
// Flattened lookback across every note source — session notes, entry notes,
// technique notes, and per-round notes — grouped per completed session,
// newest first. Keyset pagination on (date, id) stays stable when new
// sessions complete between page fetches. Per-set notes are deliberately
// excluded: they're micro-annotations best read in the session detail.
notesRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const db = getDb(c.env);

  const limitParam = Number(c.req.query('limit'));
  const limit = Number.isInteger(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;

  let cursorDate: string | null = null;
  let cursorId: string | null = null;
  const cursorParam = c.req.query('cursor');
  if (cursorParam) {
    const sep = cursorParam.indexOf('_');
    const datePart = sep === -1 ? '' : cursorParam.slice(0, sep);
    const idPart = sep === -1 ? '' : cursorParam.slice(sep + 1);
    if (!DATE_RE.test(datePart) || !UUID_RE.test(idPart)) {
      return c.json({ error: 'Invalid cursor' }, 400);
    }
    cursorDate = datePart;
    cursorId = idPart;
  }

  // The jsonb probes (techniqueNotes, rounds[].notes) aren't expressible in
  // Drizzle's builder, so this page query is raw SQL like /stats/top-lifts.
  const cursorClause =
    cursorDate !== null
      ? sql`AND (s.date, s.id) < (${cursorDate}::date, ${cursorId}::uuid)`
      : sql``;

  const pageRows = (await db.execute(sql`
    SELECT s.id, s.date::text AS date, s.name, s.notes
    FROM sessions s
    WHERE s.user_id = ${userId}
      AND s.status = 'completed'
      AND (
        COALESCE(s.notes, '') <> ''
        OR EXISTS (
          SELECT 1 FROM session_entries se
          WHERE se.session_id = s.id
            AND (
              COALESCE(se.notes, '') <> ''
              OR COALESCE(se.details->>'techniqueNotes', '') <> ''
              OR (
                jsonb_typeof(se.details->'rounds') = 'array'
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(se.details->'rounds') r
                  WHERE COALESCE(r->>'notes', '') <> ''
                )
              )
            )
        )
      )
      ${cursorClause}
    ORDER BY s.date DESC, s.id DESC
    LIMIT ${limit + 1}
  `)) as unknown as Array<{ id: string; date: string; name: string | null; notes: string | null }>;

  const hasMore = pageRows.length > limit;
  const page = hasMore ? pageRows.slice(0, limit) : pageRows;
  const nextCursor = hasMore ? `${page[page.length - 1].date}_${page[page.length - 1].id}` : null;

  const sessionIds = page.map((s) => s.id);
  const entryRows =
    sessionIds.length === 0
      ? []
      : await db
          .select({
            id: sessionEntries.id,
            sessionId: sessionEntries.sessionId,
            kind: sessionEntries.kind,
            details: sessionEntries.details,
            notes: sessionEntries.notes,
            exerciseName: exercises.name,
            disciplineName: disciplines.name,
          })
          .from(sessionEntries)
          .leftJoin(exercises, eq(sessionEntries.exerciseId, exercises.id))
          .leftJoin(disciplines, eq(sessionEntries.disciplineId, disciplines.id))
          .where(inArray(sessionEntries.sessionId, sessionIds))
          .orderBy(asc(sessionEntries.sessionId), asc(sessionEntries.orderIndex));

  const entriesBySession = new Map<string, typeof entryRows>();
  for (const row of entryRows) {
    const list = entriesBySession.get(row.sessionId) ?? [];
    list.push(row);
    entriesBySession.set(row.sessionId, list);
  }

  const groups: NotesSessionGroup[] = [];
  for (const s of page) {
    const entries = entriesBySession.get(s.id) ?? [];
    const notes: NoteItem[] = [];

    const sessionNotes = s.notes?.trim();
    if (sessionNotes) {
      notes.push({ source: { type: 'session' }, label: 'Session notes', text: sessionNotes });
    }

    for (const entry of entries) {
      const name =
        entry.disciplineName ??
        entry.exerciseName ??
        (entry.kind === 'martial_arts' ? 'Martial arts' : 'Exercise');

      const entryNotes = entry.notes?.trim();
      if (entryNotes) {
        notes.push({ source: { type: 'entry', entryId: entry.id }, label: name, text: entryNotes });
      }

      if (isRoundsSession(entry.details)) {
        const techniqueNotes = entry.details.techniqueNotes?.trim();
        if (techniqueNotes) {
          notes.push({
            source: { type: 'technique', entryId: entry.id },
            label: `${name} — Technique`,
            text: techniqueNotes,
          });
        }
        entry.details.rounds.forEach((round, i) => {
          const roundNotes = round.notes?.trim();
          if (roundNotes) {
            notes.push({
              source: { type: 'round', entryId: entry.id, roundNumber: i + 1 },
              label: `${name} — Round ${i + 1}`,
              text: roundNotes,
            });
          }
        });
      }
    }

    // The SQL WHERE guarantees at least one non-empty note, but trimming can
    // still empty a whitespace-only group — drop those.
    if (notes.length === 0) continue;

    const kinds = [...new Set(entries.map((e) => e.kind))] as EntryKind[];
    groups.push({ sessionId: s.id, date: s.date, sessionName: s.name, kinds, notes });
  }

  const result: NotesTimelineResponse = { groups, nextCursor };
  return c.json(result);
});

export { notesRoutes };
