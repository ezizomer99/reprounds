import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { inArray } from 'drizzle-orm';
import { disciplines } from './schema';

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

// One-off normalization for databases seeded before the field-config simplification.
// Brings the built-in disciplines to the current canonical state without deleting any
// rows (session entries reference discipline ids), so it is safe to re-run.
const martialArtsFieldConfig = [
  { key: 'title', label: 'Title', type: 'text' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

const builtInNames = ['BJJ', 'Boxing', 'MMA'];

async function normalize() {
  console.log('Normalizing built-in disciplines...');

  // Standardize the field config on all built-in disciplines.
  await db
    .update(disciplines)
    .set({ fieldConfig: martialArtsFieldConfig })
    .where(inArray(disciplines.name, builtInNames));

  // Boxing and MMA were originally created as user-owned rows; make them global
  // (user_id NULL) so they behave like BJJ. IDs are preserved, so existing session
  // entries that reference them stay valid.
  await db
    .update(disciplines)
    .set({ userId: null })
    .where(inArray(disciplines.name, ['Boxing', 'MMA']));

  console.log('Done.');
  await client.end();
}

normalize().catch((err) => {
  console.error(err);
  process.exit(1);
});
