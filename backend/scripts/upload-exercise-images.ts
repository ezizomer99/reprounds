import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const accountId = process.env.CF_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = 'ma-fitness-exercises';
const CONCURRENCY = 20;

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('Missing required env vars: CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const IMAGES_DIR = join(__dirname, '..', '..', 'data', 'images');

async function uploadBatch(files: string[]) {
  await Promise.all(
    files.map(async (filename) => {
      const body = await readFile(join(IMAGES_DIR, filename));
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: filename,
          Body: body,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      process.stdout.write('.');
    }),
  );
}

async function main() {
  const all = (await readdir(IMAGES_DIR)).filter((f) => f.endsWith('.jpg'));
  console.log(`Uploading ${all.length} images to R2 bucket "${BUCKET_NAME}"...`);

  for (let i = 0; i < all.length; i += CONCURRENCY) {
    await uploadBatch(all.slice(i, i + CONCURRENCY));
    console.log(` ${Math.min(i + CONCURRENCY, all.length)}/${all.length}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
