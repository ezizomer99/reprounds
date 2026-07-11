import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { isNull, inArray } from 'drizzle-orm';
import { exercises, sessionEntries, routineItems } from '../src/db/schema';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function clearDb() {
  console.log('Clearing seeded exercises from database...');

  const seeded = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(isNull(exercises.userId));

  if (seeded.length === 0) {
    console.log('No seeded exercises found — skipping DB clear.');
    return;
  }

  const seededIds = seeded.map((r) => r.id);
  console.log(`Found ${seededIds.length} seeded exercises.`);

  // routine_items: FK is ON DELETE NO ACTION — must clear first
  const deletedRoutineItems = await db
    .delete(routineItems)
    .where(inArray(routineItems.exerciseId, seededIds))
    .returning({ id: routineItems.id });
  console.log(`Deleted ${deletedRoutineItems.length} routine items.`);

  // session_entries: FK is ON DELETE NO ACTION — strength_sets cascade automatically
  const deletedEntries = await db
    .delete(sessionEntries)
    .where(inArray(sessionEntries.exerciseId, seededIds))
    .returning({ id: sessionEntries.id });
  console.log(`Deleted ${deletedEntries.length} session entries (strength_sets cascaded).`);

  await db.delete(exercises).where(isNull(exercises.userId));
  console.log(`Deleted ${seededIds.length} seeded exercises.`);
}

async function main() {
  await clearDb();
  await client.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
