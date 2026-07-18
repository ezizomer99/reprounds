import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { isNull, sql } from 'drizzle-orm';
import { GRAPPLING_POSITIONS, GRAPPLING_SUBMISSIONS } from '@app/shared';
import { disciplines, exercises, techniques } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

interface RawExercise {
  id: string;
  name: string;
  type?: string;
  category?: string;
  body_part?: string;
  equipment?: string;
  muscle_group?: string;
  secondary_muscles?: string[];
  target?: string;
}

async function seed() {
  // 1. Load exercises.json (lives two levels up at data/exercises.json).
  // data/ is gitignored, so the file only exists on a dev machine — in CI
  // (deploy-backend's "Seed global defaults" step) it is absent and the
  // exercise seed is skipped; disciplines and techniques still run.
  const jsonPath = join(__dirname, '..', '..', '..', 'data', 'exercises.json');
  if (existsSync(jsonPath)) {
    const raw: RawExercise[] = JSON.parse(readFileSync(jsonPath, 'utf8'));

    console.log(`Seeding ${raw.length} exercises...`);

    const rows = raw.map((ex) => {
      return {
        sourceId:         ex.id,
        name:             ex.name,
        type:             (ex.type ?? 'strength') as 'strength' | 'conditioning' | 'martial_arts',
        category:         ex.category ?? null,
        bodyPart:         ex.body_part ?? null,
        equipment:        ex.equipment ?? null,
        muscleGroup:      ex.muscle_group ?? null,
        secondaryMuscles: ex.secondary_muscles ?? [],
        target:           ex.target ?? null,
      };
    });

    // 3. Upsert in chunks of 100 to stay within Postgres parameter limit
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(exercises)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: exercises.sourceId,
          set: {
            name:             sql`excluded.name`,
            type:             sql`excluded.type`,
            category:         sql`excluded.category`,
            bodyPart:         sql`excluded.body_part`,
            equipment:        sql`excluded.equipment`,
            muscleGroup:      sql`excluded.muscle_group`,
            secondaryMuscles: sql`excluded.secondary_muscles`,
            target:           sql`excluded.target`,
          },
        });
      console.log(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
    }

    console.log('Exercises seeded.');
  } else {
    console.log('data/exercises.json not found (gitignored, local-only) — skipping exercise seed.');
  }

  // 4. Seed global disciplines (idempotent per-name — adds any missing ones).
  // Category drives the structured round-logging UI; field_config is the
  // fallback generic form. Templates are sensible defaults per category.
  const notes = { key: 'notes', label: 'Notes', type: 'textarea' as const };
  const grapplingTemplate = [
    { key: 'rounds', label: 'Rounds', type: 'number' as const },
    { key: 'submissions', label: 'Submissions', type: 'number' as const },
    notes,
  ];
  const strikingTemplate = [
    { key: 'rounds', label: 'Rounds', type: 'number' as const },
    notes,
  ];
  const mixedTemplate = [
    { key: 'rounds', label: 'Rounds', type: 'number' as const },
    notes,
  ];

  const globalDisciplines = [
    { name: 'BJJ',       category: 'grappling' as const, fieldConfig: grapplingTemplate },
    { name: 'Wrestling', category: 'grappling' as const, fieldConfig: grapplingTemplate },
    { name: 'Boxing',    category: 'striking'  as const, fieldConfig: strikingTemplate },
    { name: 'Muay Thai', category: 'striking'  as const, fieldConfig: strikingTemplate },
    { name: 'MMA',       category: 'mixed'     as const, fieldConfig: mixedTemplate },
  ];

  // Upsert on the global-name partial unique index so template changes here
  // propagate to already-seeded databases (insert-only seeding could never
  // correct an existing row's field_config).
  await db
    .insert(disciplines)
    .values(globalDisciplines)
    .onConflictDoUpdate({
      target: [disciplines.name],
      targetWhere: isNull(disciplines.userId),
      set: {
        category: sql`excluded.category`,
        fieldConfig: sql`excluded.field_config`,
      },
    });
  console.log(`Upserted ${globalDisciplines.length} global disciplines.`);

  // 5. Seed the global grappling technique bank from the shared constants. The
  // `value` is reused verbatim so rounds already logged with these keys keep
  // resolving. 'other' is a client-only escape hatch in the logger — not a bank
  // row. Upsert on source_id so re-seeding refreshes labels in place.
  const techniqueRows = [
    ...GRAPPLING_POSITIONS.map((p) => ({ kind: 'position' as const, value: p.value, label: p.label })),
    ...GRAPPLING_SUBMISSIONS.filter((s) => s.value !== 'other').map((s) => ({
      kind: 'submission' as const,
      value: s.value,
      label: s.label,
    })),
  ].map((t) => ({
    kind:      t.kind,
    category:  'grappling' as const,
    value:     t.value,
    label:     t.label,
    sourceId:  `${t.kind}:${t.value}`,
  }));

  await db
    .insert(techniques)
    .values(techniqueRows)
    .onConflictDoUpdate({
      target: techniques.sourceId,
      set: { label: sql`excluded.label` },
    });
  console.log(`Upserted ${techniqueRows.length} global grappling techniques.`);

  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
