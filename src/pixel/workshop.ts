import manifest from '../../assets/pixel/workshop/v2/manifest.json';
import type { PixelBuildable } from '../app/building';
import { ctx2d, makeCanvas } from './paint';
import { resample, type SampleMode } from './resample';
import type { Point, Rect } from './layout';
import type { Sprite } from './sprites';
import { toCss, type Fit } from './fit';

export const WORKSHOP_MANIFEST = manifest;
export const WORKSHOP_IDS: readonly PixelBuildable[] = ['cart', 'trap'];
export type WorkshopArt = Partial<Record<PixelBuildable, Sprite>>;
export const WORKSHOP_ANCHORS = Object.fromEntries(WORKSHOP_IDS.map(id => {
  const [x, y] = manifest.assets[id].groundAnchor;
  return [id, { x, y }];
})) as Record<PixelBuildable, Point>;
export const WORKSHOP_TARGETS = Object.fromEntries(WORKSHOP_IDS.map(id => {
  const [x, y, w, h] = manifest.assets[id].interactionRect;
  return [id, { x, y, w, h }];
})) as Record<PixelBuildable, Rect>;

const urls = import.meta.glob('../../assets/pixel/workshop/v2/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Keep small-screen tap areas separate when the props are closer than 44 CSS pixels. */
export function workshopHitRects(fit: Fit): Record<PixelBuildable, Rect> {
  let right = 0;
  return Object.fromEntries(WORKSHOP_IDS.map(id => {
    const r = WORKSHOP_TARGETS[id], p = toCss(fit, r.x, r.y);
    const w = Math.max(44, r.w * fit.ps), h = Math.max(44, r.h * fit.ps);
    const x = Math.max(p.x, right);
    right = x + w + 2;
    return [id, { x, y: Math.max(0, Math.min(p.y, fit.cssH - h)), w, h }];
  })) as Record<PixelBuildable, Rect>;
}

/** Keep the generated originals intact and bake their alpha-bounded regions once. */
export async function loadWorkshopArt(sample: SampleMode): Promise<WorkshopArt> {
  const art: WorkshopArt = {};
  await Promise.all(WORKSHOP_IDS.map(async id => {
    try {
      const spec = manifest.assets[id];
      const url = Object.entries(urls).find(([path]) => path.endsWith('/' + spec.file))?.[1];
      if (!url) throw new Error(`Missing workshop art: ${spec.file}`);
      const image = new Image(); image.src = url; await image.decode();
      const [x, y, w, h] = spec.sourceRect, [dw, dh] = spec.drawSize;
      const source = makeCanvas(w, h), sg = ctx2d(source);
      sg.drawImage(image, x, y, w, h, 0, 0, w, h);
      const pixels = resample(sg.getImageData(0, 0, w, h), dw, dh, { mode: sample, alphaCut: manifest.alphaCut });
      const canvas = makeCanvas(dw, dh), g = ctx2d(canvas), data = g.createImageData(dw, dh);
      data.data.set(pixels.data); g.putImageData(data, 0, 0);
      art[id] = { canvas, w: dw, h: dh };
    } catch (error) {
      console.warn(`[workshop] ${id} art could not load`, error);
    }
  }));
  return art;
}
