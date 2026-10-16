// Read-only PNG inspection. Crops and downsampling happen in the game's existing runtime baker.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.argv[2] || process.cwd()] }));
const root = new URL('../assets/pixel/expedition/v1/', import.meta.url);
const manifest = { version: 1, status: 'forest-slice', tool: 'built-in image_gen.imagegen', logicalSize: [576, 324], alphaCut: .5, sourceHashes: {}, sources: {}, assets: {} };
const sourceSpecs = {
  'forest-battle.png': { regions: [{ id: 'background', rect: null, size: [576, 324] }], alpha: false },
  'traveler.png': { regions: [
    { id: 'player-idle', rect: [0, 0, 480, 640], height: 74 },
    { id: 'player-attack', rect: [480, 0, 655, 640], height: 53 },
    { id: 'player-hurt', rect: [1135, 0, 401, 640], height: 62 },
    { id: 'map-north', rect: [0, 640, 512, 384], height: 24 },
    { id: 'map-south', rect: [512, 640, 512, 384], height: 24 },
    { id: 'map-east', rect: [1024, 640, 512, 384], height: 24 }
  ], alpha: true },
  'beast.png': { regions: ['idle', 'attack', 'hurt'].map((pose, i) => ({ id: 'beast-' + pose, third: i, height: 51 })), alpha: true }
};
for (const [file, spec] of Object.entries(sourceSpecs)) {
  const bytes = await fs.readFile(new URL(file, root));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meta = await sharp(bytes).metadata();
  let zero = 0, partial = 0;
  for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) zero++; else if (data[i] < 255) partial++; }
  if (spec.alpha && (!meta.hasAlpha || zero / (info.width * info.height) < .3)) throw Error(`${file}: missing transparency`);
  manifest.sourceHashes[file] = createHash('sha256').update(bytes).digest('hex');
  manifest.sources[file] = { size: [info.width, info.height], hasAlpha: meta.hasAlpha, fullyTransparentFraction: zero / (info.width * info.height), partiallyTransparentFraction: partial / (info.width * info.height) };
  for (const region of spec.regions) {
    const cell = region.third === undefined ? region.rect ?? [0, 0, info.width, info.height] : [Math.floor(info.width * region.third / 3), 0, Math.floor(info.width / 3), info.height];
    let [left, top, width, height] = cell;
    if (spec.alpha) {
      let l = info.width, t = info.height, r = -1, b = -1;
      for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) if (data[(y * info.width + x) * 4 + 3] >= 128) { l = Math.min(l, x); t = Math.min(t, y); r = Math.max(r, x); b = Math.max(b, y); }
      if (r < 0) throw Error(`${region.id}: empty sprite`);
      left = l; top = t; width = r - l + 1; height = b - t + 1;
    }
    const drawSize = region.size ?? [Math.round(width * region.height / height), region.height];
    manifest.assets[region.id] = { file, sourceRect: [left, top, width, height], drawSize, hasAlpha: spec.alpha };
  }
}
await fs.writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ sources: manifest.sources, assets: manifest.assets }, null, 2));
