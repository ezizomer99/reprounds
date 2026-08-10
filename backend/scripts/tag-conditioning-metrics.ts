/**
 * Tags every conditioning exercise in the local (gitignored) data/exercises.json
 * with a `metrics` list so the app knows which fields to log:
 *
 *   - distance-based cardio (running, rowing, cycling, …) → ["duration","distance"]
 *   - everything else conditioning (jump rope, bag work, …) → ["duration"]
 *
 * The file lives only on a dev machine (see the note in src/db/seed.ts), so this
 * edits it in place rather than the database. Re-run db:seed afterwards to push
 * the new metrics into Postgres.
 *
 *   pnpm --filter backend tag:conditioning-metrics          # writes the file
 *   pnpm --filter backend tag:conditioning-metrics --dry    # preview only
 *
 * Idempotent: running it twice is a no-op. Only conditioning rows are touched;
 * strength exercises are left exactly as they are.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// backend/scripts -> repo root -> data/exercises.json (same file db:seed reads).
const jsonPath = join(__dirname, '..', '..', 'data', 'exercises.json');

// Case-insensitive substrings that mark a conditioning exercise as distance-based.
// Extend this list if your catalogue names cardio differently.
const DISTANCE_KEYWORDS = [
  'run', 'jog', 'walk', 'treadmill', 'sprint',
  'row', 'erg',
  'cycl', 'bike', 'bicycle', 'spin',
  'elliptical', 'swim', 'ski', 'skierg',
];

interface RawExercise {
  id: string;
  name: string;
  type?: string;
  metrics?: string[];
  [k: string]: unknown;
}

const arraysEqual = (a?: string[], b?: string[]) =>
  Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

function main() {
  const dry = process.argv.includes('--dry');

  if (!existsSync(jsonPath)) {
    console.error(`No file at ${jsonPath}.`);
    console.error('This script edits the local, gitignored data/exercises.json — run it on the machine that has it.');
    process.exit(1);
  }

  const raw: RawExercise[] = JSON.parse(readFileSync(jsonPath, 'utf8'));

  let distanceCount = 0;
  let durationCount = 0;
  let changed = 0;
  const distanceNames: string[] = [];

  for (const ex of raw) {
    if ((ex.type ?? 'strength') !== 'conditioning') continue;
    const lower = ex.name.toLowerCase();
    const isDistance = DISTANCE_KEYWORDS.some((kw) => lower.includes(kw));
    const next = isDistance ? ['duration', 'distance'] : ['duration'];

    if (isDistance) { distanceCount++; distanceNames.push(ex.name); } else { durationCount++; }
    if (!arraysEqual(ex.metrics, next)) { ex.metrics = next; changed++; }
    else ex.metrics = next;
  }

  console.log(`Conditioning exercises: ${distanceCount + durationCount}`);
  console.log(`  duration + distance : ${distanceCount}`);
  console.log(`  duration only       : ${durationCount}`);
  if (distanceNames.length) console.log(`  tagged with distance: ${distanceNames.join(', ')}`);
  console.log(`Rows whose metrics changed: ${changed}`);

  if (dry) {
    console.log('\n--dry: no file written. Review the list above, then re-run without --dry.');
    return;
  }

  // Preserve the file's 2-space formatting with a trailing newline.
  writeFileSync(jsonPath, JSON.stringify(raw, null, 2) + '\n');
  console.log(`\nWrote ${jsonPath}. Now run: pnpm --filter backend db:seed`);
}

main();
