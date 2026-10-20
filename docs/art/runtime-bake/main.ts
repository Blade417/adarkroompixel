import { bakeArtPack, roomAssetUrls } from '../../../src/pixel/artpack';
import { loadWorkshopArt, workshopAssetUrls } from '../../../src/pixel/workshop';
import { loadForestArt, forestAssetUrls } from '../../../src/pixel/forest';
import { loadVillageArt, villageAssetUrls } from '../../../src/pixel/village';
import { loadExpeditionArt, expeditionAssetUrls } from '../../../src/pixel/expedition';
import { loadEndgameArt, endgameAssetUrls } from '../../../src/pixel/endgame-art';
import { loadPackedArt } from '../../../src/pixel/runtime-art';
import { ctx2d, makeCanvas } from '../../../src/pixel/paint';
import type { Sprite } from '../../../src/pixel/sprites';

const status = document.querySelector<HTMLElement>('#status')!;
const previews = document.querySelector<HTMLElement>('#previews')!;
type Group = { sprites: Record<string, Sprite>; meta: Record<string, unknown> };
const sprite = (canvas: HTMLCanvasElement): Sprite => ({ canvas, w: canvas.width, h: canvas.height });
const canvases = (items: Record<string, HTMLCanvasElement>): Group => ({ sprites: Object.fromEntries(Object.entries(items).map(([id, c]) => [id, sprite(c)])), meta: {} });

async function original(group: string): Promise<Group> {
  if (group === 'room') {
    const art = await bakeArtPack('mode', false);
    if (art.failed.length || !art.room || !art.door || !art.hearth || !art.fire || !art.huddled || !art.woodpile) throw new Error('Room source art incomplete');
    const sprites: Record<string, Sprite> = { room: art.room.sprite, door: art.door, hearth: art.hearth };
    const fireLevels = art.fire.levels.map((frames, l) => frames.map((s, i) => { const k = `fire-${l}-${i}`; sprites[k] = s; return k; }));
    const huddled = art.huddled.frames.map((s, i) => { const k = `huddled-${i}`; sprites[k] = s; return k; });
    const woodpile = art.woodpile.map((s, i) => { const k = `woodpile-${i}`; sprites[k] = s; return k; });
    return { sprites, meta: { border: art.room.border, fireLevels, fireFps: art.fire.fps, huddled, huddledFps: art.huddled.fps, woodpile } };
  }
  if (group === 'workshop') return { sprites: await loadWorkshopArt('mode', false) as Record<string, Sprite>, meta: {} };
  if (group === 'forest') return canvases(await loadForestArt('mode', false));
  if (group === 'village') return canvases(await loadVillageArt('mode', false));
  if (group === 'expedition') return canvases(await loadExpeditionArt(false));
  return { sprites: await loadEndgameArt('mode', false) as Record<string, Sprite>, meta: {} };
}

function atlas(group: string, source: Group) {
  const rects: Record<string, [number, number, number, number]> = {};
  const alphaPixels: Record<string, number[]> = {};
  let x = 0, y = 0, row = 0, width = 0;
  for (const [id, s] of Object.entries(source.sprites)) {
    const rgba = ctx2d(s.canvas).getImageData(0, 0, s.w, s.h).data;
    const patches: number[] = [];
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] > 0 && rgba[i + 3] < 255) patches.push(i, rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    if (patches.length) alphaPixels[id] = patches;
    if (x && x + s.w > 2048) { x = 0; y += row + 2; row = 0; }
    rects[id] = [x, y, s.w, s.h]; x += s.w + 2; row = Math.max(row, s.h); width = Math.max(width, x);
  }
  const canvas = makeCanvas(width, y + row), g = ctx2d(canvas);
  g.imageSmoothingEnabled = false;
  for (const [id, s] of Object.entries(source.sprites)) g.drawImage(s.canvas, rects[id][0], rects[id][1]);
  const section = document.createElement('section'), title = document.createElement('h2');
  title.textContent = `${group} · ${Object.keys(rects).length} 帧 · ${canvas.width} × ${canvas.height}`;
  section.append(title, canvas); previews.append(section);
  return { rects, canvas, alphaPixels };
}

async function post(path: string, body: unknown) {
  const response = await fetch('http://127.0.0.1:4182/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function run(verify: boolean) {
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  previews.replaceChildren();
  let frames = 0, channels = 0, differences = 0;
  const report: Record<string, unknown>[] = [];
  const mismatches: Record<string, unknown>[] = [];
  try {
    for (const group of ['room', 'workshop', 'forest', 'village', 'expedition', 'later']) {
      status.textContent = `正在${verify ? '逐像素校验' : '烘焙'}：${group}`;
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const source = await original(group);
      const packed = atlas(group, source);
      if (verify) {
        const output = await loadPackedArt(group);
        if (!output) throw new Error(`Runtime pack missing: ${group}`);
        if (Object.keys(source.sprites).length !== Object.keys(output.sprites).length) throw new Error('Frame count differs');
        if (JSON.stringify(source.meta) !== JSON.stringify(output.meta)) throw new Error('Animation metadata differs');
        for (const [id, s] of Object.entries(source.sprites)) {
          const other = output.sprites[id];
          if (!other || other.w !== s.w || other.h !== s.h) throw new Error(`Frame dimensions differ: ${group}/${id}`);
          const a = ctx2d(s.canvas).getImageData(0, 0, s.w, s.h).data;
          const b = ctx2d(other.canvas).getImageData(0, 0, other.w, other.h).data;
          for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
            differences++;
            if (mismatches.length < 16) mismatches.push({ group, id, channel: i, original: Array.from(a.slice(i - i % 4, i - i % 4 + 4)), packed: Array.from(b.slice(i - i % 4, i - i % 4 + 4)) });
          }
          frames++; channels += a.length;
        }
      } else {
        const result = await post('group', { group, sprites: packed.rects, meta: source.meta, alphaPixels: packed.alphaPixels, png: packed.canvas.toDataURL('image/png').split(',')[1] });
        report.push(result);
      }
    }
    if (verify) {
      const result = { frames, rgbaChannels: channels, differingChannels: differences, identical: differences === 0, mismatches };
      status.textContent = `逐像素校验完成\n${JSON.stringify(result, null, 2)}`;
      if (differences) return;
      await post('verified', result);
      if (differences) throw new Error('Runtime pixels differ from original rendering');
    } else {
      const urls = [...new Set([...roomAssetUrls, ...workshopAssetUrls, ...forestAssetUrls, ...villageAssetUrls, ...expeditionAssetUrls, ...endgameAssetUrls])];
      const result = await post('finish', { urls });
      status.textContent = `生成完成，请重新打开本页后点击“校验运行素材”。\n${JSON.stringify({ ...result, groups: report }, null, 2)}`;
    }
  } catch (error) { status.textContent = '失败：' + String(error); }
  finally { document.querySelectorAll('button').forEach(b => b.disabled = false); }
}
document.querySelector('#generate')!.addEventListener('click', () => { void run(false); });
document.querySelector('#verify')!.addEventListener('click', () => { void run(true); });
