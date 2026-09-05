/*
 * Regenerates the extension PNGs from the SVG sources in this folder.
 *
 *   npm i sharp && node icons/build.mjs
 *
 * Each size has its own source rather than one file downscaled. The note is
 * illegible below ~48px, so the toolbar sizes (16, 32) keep only the ring and
 * slash; 48 and 64 use a single note, and only 128 has room for the beamed
 * pair, which turns muddy at anything smaller.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

for (const size of [16, 32, 48, 64, 128]) {
    await sharp(join(here, `icon-${size}.svg`))
        .resize(size, size)
        .png()
        .toFile(join(root, `${size}.png`));
    console.log(`wrote ${size}.png`);
}
