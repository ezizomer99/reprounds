/**
 * Generates app icon PNGs from the Octa SVG mark.
 * Run once: node frontend/scripts/generate-icons.mjs
 *
 * Outputs:
 *   frontend/assets/images/icon.png       — 1024×1024, ink bg + vermilion mark (iOS / generic)
 *   frontend/assets/images/icon-fg.png    — 1024×1024, transparent bg + bone mark (Android adaptive fg)
 */

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../assets/images');
mkdirSync(OUT, { recursive: true });

const INK       = '#17140F';
const VERMILION = '#D8432A';
const BONE      = '#F4F0E7';

const OCTA_POINTS = '60,6 140,6 194,60 194,140 140,194 60,194 6,140 6,60';

// The mark occupies the inner 66% of the canvas (safe zone per spec).
// Canvas is 1024; inner box is 676px centered → offset 174px each side.
const SIZE = 1024;
const SAFE_SIZE = Math.round(SIZE * 0.66);
const OFFSET = Math.round((SIZE - SAFE_SIZE) / 2);

// Scale the viewBox (200×200) up to SAFE_SIZE and translate by OFFSET.
const scale = SAFE_SIZE / 200;

function transform(x) { return x * scale + OFFSET; }
function scaleVal(v) { return v * scale; }

function scaledPoints(pts) {
  return pts.split(' ').map(p => {
    const [x, y] = p.split(',').map(Number);
    return `${transform(x)},${transform(y)}`;
  }).join(' ');
}

function solidSvg(bgColor, markColor) {
  // White octagon in mask, black background; black barbell knockout.
  // Then fill full canvas with markColor where mask is white.
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${SIZE}" height="${SIZE}" fill="${bgColor}"/>
  <defs>
    <mask id="m">
      <rect width="${SIZE}" height="${SIZE}" fill="black"/>
      <polygon points="${scaledPoints(OCTA_POINTS)}" fill="white"/>
      <rect x="${transform(14)}" y="${transform(89)}" width="${scaleVal(172)}" height="${scaleVal(22)}" rx="${scaleVal(11)}" fill="black"/>
      <rect x="${transform(44)}" y="${transform(58)}" width="${scaleVal(19)}" height="${scaleVal(84)}" rx="${scaleVal(7)}" fill="black"/>
      <rect x="${transform(137)}" y="${transform(58)}" width="${scaleVal(19)}" height="${scaleVal(84)}" rx="${scaleVal(7)}" fill="black"/>
    </mask>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${markColor}" mask="url(#m)"/>
</svg>`;
}

function fgSvg(markColor) {
  // Transparent background — adaptive icon foreground layer.
  return `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <mask id="m">
      <rect width="${SIZE}" height="${SIZE}" fill="black"/>
      <polygon points="${scaledPoints(OCTA_POINTS)}" fill="white"/>
      <rect x="${transform(14)}" y="${transform(89)}" width="${scaleVal(172)}" height="${scaleVal(22)}" rx="${scaleVal(11)}" fill="black"/>
      <rect x="${transform(44)}" y="${transform(58)}" width="${scaleVal(19)}" height="${scaleVal(84)}" rx="${scaleVal(7)}" fill="black"/>
      <rect x="${transform(137)}" y="${transform(58)}" width="${scaleVal(19)}" height="${scaleVal(84)}" rx="${scaleVal(7)}" fill="black"/>
    </mask>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${markColor}" mask="url(#m)"/>
</svg>`;
}

function render(svg, outPath) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } });
  const png = resvg.render().asPng();
  writeFileSync(outPath, png);
  console.log(`✓ ${outPath}`);
}

render(solidSvg(INK, VERMILION), resolve(OUT, 'icon.png'));
render(fgSvg(BONE), resolve(OUT, 'icon-fg.png'));
