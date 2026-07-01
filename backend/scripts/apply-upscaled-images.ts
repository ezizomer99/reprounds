import { readdir, copyFile } from 'fs/promises';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', '..', 'data', 'images');

// Upscayl appends a suffix before the extension, e.g.:
//   hevy-ab-scissors_upscayl_4x_realesrgan-x4plus.jpg
function stripUpscaylSuffix(filename: string): string {
  const ext = extname(filename);
  const base = basename(filename, ext);
  const idx = base.search(/_upscayl/i);
  return (idx === -1 ? base : base.slice(0, idx)) + ext;
}

async function main() {
  const upscaledDir = process.argv[2];
  if (!upscaledDir) {
    console.error('Usage: pnpm --filter backend r2:apply-upscaled <path-to-upscayl-output-folder>');
    process.exit(1);
  }

  const files = (await readdir(upscaledDir)).filter(
    (f) => f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg'),
  );

  if (files.length === 0) {
    console.error('No .jpg files found in the output folder. Make sure Upscayl is set to output JPEG (not PNG).');
    process.exit(1);
  }

  let copied = 0;
  for (const file of files) {
    const originalName = stripUpscaylSuffix(file);
    const dest = join(IMAGES_DIR, originalName);
    await copyFile(join(upscaledDir, file), dest);
    console.log(`  ${file} → ${originalName}`);
    copied++;
  }

  console.log(`\nCopied ${copied} upscaled images to data/images/.`);
  console.log('Now run: pnpm --filter backend r2:upload');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
