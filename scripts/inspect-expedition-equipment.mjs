// Read-only PNG inspection. Runtime handles cropping/downsampling; never edits the generated PNGs.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(require.resolve('sharp', { paths: [process.argv[2] || process.cwd()] }));
const root = new URL('../assets/pixel/expedition/v2/', import.meta.url);
const manifest = { version: 2, tool: 'built-in image_gen.imagegen', logicalSize: [576, 324], alphaCut: .5,
  hands: { idle: [.935, .408], attack: [.94, .33], hurt: [.705, .385] }, sources: {}, assets: {} };
const thirds = (names, top, bottom, heights) => names.map((id, i) => ({ id, cell: [i / 3, top, (i + 1) / 3, bottom], height: heights[i] }));
const sourceSpecs = {
  'traveler-body.png': { alpha: true, regions: [
    ...thirds(['body-idle', 'body-attack', 'body-hurt'], 0, .56, [74, 67, 67]),
    ...thirds(['map-north', 'map-south', 'map-east'], .56, 1, [24, 24, 24])
  ] },
  'weapons.png': { alpha: true, regions: [
    { id: 'weapon-spear', cell: [0, 0, .42, .48], width: 66 },
    { id: 'weapon-iron', cell: [.42, 0, .7, .48], width: 33 },
    { id: 'weapon-steel', cell: [.7, 0, 1, .48], width: 39 },
    { id: 'weapon-rifle', cell: [0, .48, .42, 1], width: 45 },
    { id: 'weapon-bolas', cell: [.42, .48, .75, 1], width: 25 },
    { id: 'bullet', cell: [.75, .48, 1, 1], width: 7 }
  ] },
  'early-enemies.png': { alpha: true, regions: [
    ...thirds(['gaunt-idle', 'gaunt-attack', 'gaunt-hurt'], 0, .355, [63, 63, 63]),
    ...thirds(['bird-idle', 'bird-attack', 'bird-hurt'], .355, .66, [47, 47, 47]),
    { id: 'twohead-idle', cell: [0, .66, 1 / 3, 1], height: 65 },
    { id: 'twohead-attack', cell: [1 / 3, .66, .69, 1], height: 65 },
    { id: 'twohead-hurt', cell: [.69, .66, 1, 1], height: 65 }
  ] },
  'field-battle.png': { alpha: false, regions: [{ id: 'field-background', cell: [0, 0, 1, 1], size: [576, 324] }] },
  'barrens-battle.png': { alpha: false, regions: [{ id: 'barrens-background', cell: [0, 0, 1, 1], size: [576, 324] }] }
};
for (const [file, spec] of Object.entries(sourceSpecs)) {
  const bytes = await fs.readFile(new URL(file, root));
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const meta = await sharp(bytes).metadata();
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
  if (spec.alpha && (!meta.hasAlpha || transparent / (info.width * info.height) < .25)) throw Error(`${file}: no transparent background`);
  manifest.sources[file] = { size: [info.width, info.height], hasAlpha: meta.hasAlpha,
    sha256: createHash('sha256').update(bytes).digest('hex'), transparentFraction: transparent / (info.width * info.height) };
  for (const region of spec.regions) {
    const [l, t, r, b] = region.cell;
    let left = Math.floor(l * info.width), top = Math.floor(t * info.height);
    let width = Math.floor(r * info.width) - left, height = Math.floor(b * info.height) - top;
    if (spec.alpha) {
      let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
      for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
        if (data[(y * info.width + x) * 4 + 3] < 128) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (maxX < 0) throw Error(`${region.id}: empty region`);
      // A silhouette touching a cell boundary means neighboring poses were cropped together.
      if (minX <= left || minY <= top || maxX >= left + width - 1 || maxY >= top + height - 1) throw Error(`${region.id}: silhouette crosses cell boundary`);
      left = minX; top = minY; width = maxX - minX + 1; height = maxY - minY + 1;
    }
    const drawSize = region.size ?? (region.width ? [region.width, Math.max(1, Math.round(height * region.width / width))]
      : [Math.round(width * region.height / height), region.height]);
    manifest.assets[region.id] = { file, sourceRect: [left, top, width, height], drawSize, hasAlpha: spec.alpha };
  }
}
await fs.writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
