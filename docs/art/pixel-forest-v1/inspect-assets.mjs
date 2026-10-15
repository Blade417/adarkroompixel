// Inspect original PNGs without changing pixels. Pass a directory containing sharp if needed.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.argv[2] || process.cwd()] }));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = path.join(root, 'assets/pixel/forest/v1');
const specs = [
  { id: 'forest-back', layer: true, alpha: false },
  { id: 'forest-foreground', layer: true, alpha: true },
  { id: 'loose-branches', width: 64, ground: [206, 218], action: 'collect-branches', alpha: true },
  { id: 'fallen-log', width: 100, ground: [313, 215], action: 'collect-deadwood', alpha: true },
  { id: 'home-marker', height: 64, ground: [128, 214], action: 'return-room', alpha: true }
];
const manifest = {
  schemaVersion: 1, id: 'emberveil-forest-art-v1', created: '2026-10-15',
  status: 'art-ready-game-integration-pending', generator: 'built-in image_gen.imagegen',
  logicalScene: { width: 480, height: 270 }, boundsAlphaThreshold: 8,
  sourcePolicy: 'Original generated PNGs preserved. Crop sourceRect, bake once to drawSize using the existing mode resampler; never use source dimensions as CSS display sizes.',
  coordinateSystem: 'Top-left origin. Props use bottom-center ground anchors. Full-frame layers use top-left.',
  assets: {}, renderOrder: ['forest-back', 'home-marker', 'fallen-log', 'loose-branches', 'forest-foreground'],
  validation: { dimensionsChecked: true, transparentSpritesChecked: true, compositionPreviewTested: false, gameIntegrationTested: false }
};
for (const spec of specs) {
  const file = `${spec.id}.png`;
  const bytes = await fs.readFile(path.join(output, file));
  const meta = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1, transparent = 0, partial = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    if (alpha === 0) transparent++;
    else if (alpha < 255) partial++;
    if (alpha >= 8) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
  }
  if (right < left || bottom < top) throw new Error(`${file} has no visible pixels`);
  if (spec.alpha && (!meta.hasAlpha || transparent < info.width * info.height * .1)) throw new Error(`${file} lacks meaningful transparency`);
  if (!spec.alpha && transparent) throw new Error(`${file} unexpectedly has transparent pixels`);
  const bounds = [left, top, right - left + 1, bottom - top + 1];
  const rect = spec.layer ? [0, 0, info.width, info.height] : bounds;
  const w = spec.layer ? 480 : spec.width || Math.round(spec.height * rect[2] / rect[3]);
  const h = spec.layer ? 270 : spec.height || Math.round(spec.width * rect[3] / rect[2]);
  const destination = spec.layer ? [0, 0, w, h] : [Math.round(spec.ground[0] - w / 2), spec.ground[1] - h, w, h];
  const entry = {
    file, sourceSize: [info.width, info.height], hasAlpha: !!meta.hasAlpha,
    sha256: createHash('sha256').update(bytes).digest('hex'), grid: [1, 1], visibleBounds: bounds,
    alpha: { fullyTransparentFraction: +(transparent / (info.width * info.height)).toFixed(4), partiallyTransparentFraction: +(partial / (info.width * info.height)).toFixed(4) },
    frames: [{ index: 0, cell: [0, 0, info.width, info.height], sourceRect: rect, drawSize: [w, h], anchor: spec.layer ? 'top-left' : 'bottom-center', suggestedDestination: destination }]
  };
  if (!spec.layer) {
    entry.suggestedGroundAnchor = spec.ground;
    entry.proposedInteraction = { action: spec.action, logicalRect: [Math.round(spec.ground[0] - Math.max(w, 44) / 2), spec.ground[1] - Math.max(h, 44), Math.max(w, 44), Math.max(h, 44)], implemented: false };
  }
  manifest.assets[spec.id] = entry;
  console.log(`${file}: ${info.width}x${info.height}, alpha ${meta.hasAlpha}, crop ${rect}, draw ${w}x${h}`);
}
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
