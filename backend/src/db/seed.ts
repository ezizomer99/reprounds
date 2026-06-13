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

  await db.insert(disciplines).values([
    {
      name: 'BJJ',
      category: 'grappling',
      fieldConfig: [
        { key: 'gi',      label: 'Gi / No-gi', type: 'enum',     options: ['gi', 'no_gi'], column: 'gi' },
        { key: 'focus',   label: 'Focus',       type: 'text' },
        { key: 'rounds',  label: 'Rounds',      type: 'number' },
        { key: 'sparred', label: 'Sparred',     type: 'boolean' },
        { key: 'notes',   label: 'Notes',       type: 'textarea' },
      ],
    },
  ]);

  console.log('Done.');
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
