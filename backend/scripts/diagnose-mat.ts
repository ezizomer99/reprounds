/**
 * Read-only diagnostic for the "mat stats show zeros / mat notes missing" report.
 *
 * Both GET /stats/mat and GET /notes only consider sessions with
 * status = 'completed'. Round + technique notes and the intensity/sparring
 * aggregates additionally require session_entries.details->>'schema' = 'rounds.v1'.
 * MatStatsView asks for the last 8 weeks.
 *
 * This script classifies the martial-arts entries so we can see which of those
 * three gates is filtering the data out. It only runs SELECTs.
 *
 *   pnpm --filter backend db:diagnose-mat                 # all users
 *   pnpm --filter backend db:diagnose-mat you@email.com   # one user
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Missing DATABASE_URL — expected in the root .env (loaded via --env-file).');
  process.exit(1);
}

const email = process.argv[2] ?? null;
const sql = postgres(url, { prepare: false });

async function main() {
  let userFilter = sql``;

  if (email) {
    const rows = await sql<{ id: string; email: string | null }[]>`
      SELECT id, email FROM users WHERE lower(email) = lower(${email}) LIMIT 1
    `;
    if (rows.length === 0) {
      console.error(`No user found with email ${email}`);
      process.exit(1);
    }
    console.log(`User: ${rows[0].email} (${rows[0].id})\n`);
    userFilter = sql`AND s.user_id = ${rows[0].id}`;
  } else {
    console.log('Scope: all users (pass an email to narrow)\n');
  }

  const breakdown = await sql`
    SELECT s.status,
           COALESCE(se.details->>'schema', '(no rounds.v1 schema)') AS details_schema,
           count(*)::int                AS entries,
           count(DISTINCT s.id)::int    AS sessions,
           max(s.date)::text            AS latest
    FROM sessions s
    JOIN session_entries se ON se.session_id = s.id
    WHERE se.kind = 'martial_arts' ${userFilter}
    GROUP BY 1, 2
    ORDER BY latest DESC NULLS LAST
  `;

  console.log('--- Martial-arts entries by session status + details schema ---');
  if (breakdown.length === 0) console.log('  (none — no martial_arts session_entries at all)');
  else console.table(breakdown);

  const notes = await sql`
    SELECT s.status,
           count(*) FILTER (WHERE COALESCE(se.notes, '') <> '')::int AS entry_notes,
           count(*) FILTER (WHERE COALESCE(se.details->>'techniqueNotes', '') <> '')::int AS technique_notes,
           count(*) FILTER (
             WHERE jsonb_typeof(se.details->'rounds') = 'array'
               AND EXISTS (
                 SELECT 1 FROM jsonb_array_elements(se.details->'rounds') r
                 WHERE COALESCE(r->>'notes', '') <> ''
               )
           )::int AS round_notes
    FROM sessions s
    JOIN session_entries se ON se.session_id = s.id
    WHERE se.kind = 'martial_arts' ${userFilter}
    GROUP BY 1
    ORDER BY 1
  `;

  console.log('\n--- Where the mat notes actually live, by session status ---');
  if (notes.length === 0) console.log('  (none)');
  else console.table(notes);

  const window = await sql<{ sessions_in_window: number; rounds_entries: number }[]>`
    SELECT count(DISTINCT s.id)::int AS sessions_in_window,
           count(*) FILTER (WHERE se.details->>'schema' = 'rounds.v1')::int AS rounds_entries
    FROM sessions s
    JOIN session_entries se ON se.session_id = s.id
    WHERE se.kind = 'martial_arts'
      AND s.status = 'completed'
      AND s.date >= (current_date - interval '8 weeks')
      ${userFilter}
  `;

  console.log('\n--- What GET /stats/mat currently sees (completed, last 8 weeks) ---');
  console.table(window);

  const w = window[0];
  console.log('\n--- Verdict ---');
  if (breakdown.length === 0) {
    console.log('No martial_arts entries exist. The logs are stored somewhere else.');
  } else if (w.sessions_in_window === 0) {
    const anyCompleted = breakdown.some((r) => r.status === 'completed');
    if (!anyCompleted) {
      console.log(
        'Mat sessions exist but NONE are status=completed → /stats/mat and /notes\n' +
        'both filter them out. Cause: sessions were never finished.',
      );
    } else {
      console.log(
        'Completed mat sessions exist, but none within the last 8 weeks →\n' +
        'MatStatsView\'s window (weeksAgoMonday(8)) excludes them.',
      );
    }
  } else if (w.rounds_entries === 0) {
    console.log(
      'Completed mat sessions are in the window, but none carry a rounds.v1 payload →\n' +
      'session/round counts appear, while intensity, sparring stats, and round/technique\n' +
      'notes stay empty (isRoundsSession() is false for legacy details).',
    );
  } else {
    console.log('Data looks visible to /stats/mat. If the app still shows zeros, compare the\n' +
      'API response directly: GET /v1/stats/mat?since=<monday>&weeks=8');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
