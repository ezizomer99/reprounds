import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { isNull, count } from 'drizzle-orm';
import { disciplines, exercises } from './schema';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function seed() {
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(exercises)
    .where(isNull(exercises.userId));

  if (Number(existingCount) > 0) {
    console.log('Global defaults already seeded — skipping.');
    await client.end();
    return;
  }

  console.log('Seeding global defaults...');

  await db.insert(exercises).values([
    { name: 'Squat',           type: 'strength',     defaultRestSeconds: 180 },
    { name: 'Bench Press',     type: 'strength',     defaultRestSeconds: 180 },
    { name: 'Deadlift',        type: 'strength',     defaultRestSeconds: 240 },
    { name: 'Overhead Press',  type: 'strength',     defaultRestSeconds: 180 },
    { name: 'Barbell Row',     type: 'strength',     defaultRestSeconds: 180 },
    { name: 'Pull-up',         type: 'strength',     defaultRestSeconds: 120 },
    { name: 'Dip',             type: 'strength',     defaultRestSeconds: 120 },
    { name: 'Jump Rope',       type: 'conditioning' },
    { name: 'Heavy Bag',       type: 'conditioning' },
    { name: 'Row Machine',     type: 'conditioning' },
    { name: 'Assault Bike',    type: 'conditioning' },
    { name: 'Running',         type: 'conditioning' },
  ]);

  const martialArtsFieldConfig = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ];

  await db.insert(disciplines).values([
    { name: 'BJJ',    category: 'grappling', fieldConfig: martialArtsFieldConfig },
    { name: 'Boxing', category: 'striking',  fieldConfig: martialArtsFieldConfig },
    { name: 'MMA',    category: 'mixed',     fieldConfig: martialArtsFieldConfig },
  ]);

  console.log('Done.');
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
