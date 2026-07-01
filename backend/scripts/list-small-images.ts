import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMAGES_DIR = join(__dirname, '..', '..', 'data', 'images');

function getJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let pos = 2;
  while (pos + 4 < buf.length) {
    if (buf[pos] !== 0xff) return null;
    const marker = buf[pos + 1];
    pos += 2;

    // Standalone markers with no payload
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const segLen = buf.readUInt16BE(pos);

    // SOF markers contain image dimensions
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = buf.readUInt16BE(pos + 3);
      const width = buf.readUInt16BE(pos + 5);
      return { width, height };
    }

    pos += segLen;
  }
  return null;
}

async function main() {
  const files = (await readdir(IMAGES_DIR)).filter((f) => f.endsWith('.jpg'));
  const small: Array<{ file: string; width: number; height: number }> = [];
  let failed = 0;

  for (const filename of files) {
    const buf = await readFile(join(IMAGES_DIR, filename));
    const dims = getJpegDimensions(buf);
    if (!dims) {
      failed++;
      continue;
    }
    if (dims.width <= 180 && dims.height <= 180) {
      small.push({ file: filename, ...dims });
    }
  }

  console.log(`Scanned ${files.length} images.`);
  if (failed) console.log(`  Could not read dimensions for ${failed} files.`);
  console.log(`\nLow-resolution images (≤180×180): ${small.length}\n`);
  small.forEach(({ file, width, height }) => console.log(`  ${width}×${height}  ${file}`));
  console.log(`\nUpscale these with Upscayl (https://upscayl.org), then re-run: pnpm --filter backend r2:upload`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
