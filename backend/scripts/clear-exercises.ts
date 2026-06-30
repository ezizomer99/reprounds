import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { isNull, inArray } from 'drizzle-orm';
import { exercises, sessionEntries, routineItems } from '../src/db/schema';

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = 'ma-fitness-exercises';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('Missing env vars: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function clearR2() {
  console.log(`Clearing R2 bucket "${BUCKET_NAME}"...`);
  let totalDeleted = 0;
  let continuationToken: string | undefined;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }),
    );

    if (list.Contents && list.Contents.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: list.Contents.map((obj) => ({ Key: obj.Key! })),
            Quiet: true,
          },
        }),
      );
      totalDeleted += list.Contents.length;
      console.log(`  Deleted ${totalDeleted} R2 objects...`);
    }

    continuationToken = list.NextContinuationToken;
  } while (continuationToken);

  console.log(`R2 cleared: ${totalDeleted} objects deleted.`);
}

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
  await clearR2();
  await clearDb();
  await client.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
