import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { isNull, sql } from 'drizzle-orm';
import { disciplines, exercises } from './schema';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

interface RawExercise {
  id: string;
  name: string;
  category?: string;
  body_part?: string;
  equipment?: string;
  instructions?: { en?: string; [lang: string]: string | undefined };
  instruction_steps?: { en?: string[]; [lang: string]: string[] | undefined };
  muscle_group?: string;
  secondary_muscles?: string[];
  target?: string;
  image?: string;
}

async function seed() {
  const R2_BASE = process.env.R2_PUBLIC_BASE_URL ?? '';

  // 1. Load exercises.json (lives two levels up at data/exercises.json)
  const jsonPath = join(__dirname, '..', '..', '..', 'data', 'exercises.json');
  const raw: RawExercise[] = JSON.parse(readFileSync(jsonPath, 'utf8'));

  console.log(`Seeding ${raw.length} exercises...`);

  const rows = raw.map((ex) => {
    const filename = ex.image ? ex.image.replace('images/', '') : null;
    return {
      sourceId:         ex.id,
      name:             ex.name,
      type:             'strength' as const,
      category:         ex.category ?? null,
      bodyPart:         ex.body_part ?? null,
      equipment:        ex.equipment ?? null,
      muscleGroup:      ex.muscle_group ?? null,
      secondaryMuscles: ex.secondary_muscles ?? [],
      target:           ex.target ?? null,
      instructions:     ex.instructions?.en ?? null,
      instructionSteps: ex.instruction_steps?.en ?? null,
      imageUrl:         filename && R2_BASE ? `${R2_BASE}/${filename}` : null,
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
          category:         sql`excluded.category`,
          bodyPart:         sql`excluded.body_part`,
          equipment:        sql`excluded.equipment`,
          muscleGroup:      sql`excluded.muscle_group`,
          secondaryMuscles: sql`excluded.secondary_muscles`,
          target:           sql`excluded.target`,
          instructions:     sql`excluded.instructions`,
          instructionSteps: sql`excluded.instruction_steps`,
          imageUrl:         sql`excluded.image_url`,
        },
      });
    console.log(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  console.log('Exercises seeded.');

  // 4. Seed disciplines (unchanged — skip if already present)
  const [{ value: discCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(disciplines)
    .where(isNull(disciplines.userId));

  if (Number(discCount) === 0) {
    const martialArtsFieldConfig = [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ];
    await db.insert(disciplines).values([
      { name: 'BJJ',    category: 'grappling', fieldConfig: martialArtsFieldConfig },
      { name: 'Boxing', category: 'striking',  fieldConfig: martialArtsFieldConfig },
      { name: 'MMA',    category: 'mixed',     fieldConfig: martialArtsFieldConfig },
    ]);
    console.log('Disciplines seeded.');
  } else {
    console.log('Disciplines already present — skipping.');
  }

  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
