import manifest from '../../assets/pixel/forest/v1/manifest.json';
import type { ForestJourney, ForestTarget } from '../app/forest';
import type { Fit } from './fit';
import { ctx2d, makeCanvas } from './paint';
import { resample, type SampleMode } from './resample';
import type { Rect } from './layout';

type ArtId = keyof typeof manifest.assets;
export const FOREST_TARGETS: Record<Exclude<ForestTarget, 'door'>, Rect> = {
  branches: rect(manifest.assets['loose-branches'].proposedInteraction.logicalRect),
  deadwood: rect(manifest.assets['fallen-log'].proposedInteraction.logicalRect),
  home: rect(manifest.assets['home-marker'].proposedInteraction.logicalRect)
};
function rect(r: number[]): Rect { return { x: r[0], y: r[1], w: r[2], h: r[3] }; }
export type ForestArt = Record<ArtId, HTMLCanvasElement>;
const urls = import.meta.glob('../../assets/pixel/forest/v1/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export async function loadForestArt(mode: SampleMode): Promise<ForestArt> {
  const entries = await Promise.all(Object.entries(manifest.assets).map(async ([id, spec]) => {
    const url = Object.entries(urls).find(([path]) => path.endsWith('/' + spec.file))?.[1];
    if (!url) throw Error(`Forest art missing: ${spec.file}`);
    const image = new Image(); image.src = url; await image.decode();
    const frame = spec.frames[0], [x, y, w, h] = frame.sourceRect, [dw, dh] = frame.drawSize;
    const source = makeCanvas(w, h), sg = ctx2d(source);
    sg.drawImage(image, x, y, w, h, 0, 0, w, h);
    const reduced = resample(sg.getImageData(0, 0, w, h), dw, dh, { mode, alphaCut: spec.hasAlpha ? .5 : null });
    const canvas = makeCanvas(dw, dh), cg = ctx2d(canvas), pixels = cg.createImageData(dw, dh);
    pixels.data.set(reduced.data); cg.putImageData(pixels, 0, 0);
    return [id, canvas] as const;
  }));
  return Object.fromEntries(entries) as ForestArt;
}

/** Uses the same display canvas and integer fit as the room renderer. */
export class ForestRenderer {
  private readonly scene = makeCanvas(480, 270);
  private readonly g = ctx2d(this.scene);
  constructor(private readonly canvas: HTMLCanvasElement, private readonly art: ForestArt) {}

  render(fit: Fit, journey: ForestJourney, highlighted: ForestTarget | null, now: number, reduce: boolean): void {
    const g = this.g;
    g.clearRect(0, 0, 480, 270);
    for (const id of manifest.renderOrder as ArtId[]) {
      const node = id === 'loose-branches' ? 'branches' : id === 'fallen-log' ? 'deadwood' : null;
      g.globalAlpha = node && journey.remaining(node) > 0 ? .16 : 1;
      const [x, y] = manifest.assets[id].frames[0].suggestedDestination;
      g.drawImage(this.art[id], x, y);
    }
    g.globalAlpha = 1;
    if (!reduce) {
      // Sparse cold flecks, deterministic and slow; never a bright snow blanket.
      g.fillStyle = '#727e83'; g.globalAlpha = .22;
      for (let i = 0; i < 12; i++) {
        const x = (i * 83 + now / 230) % 480, y = (i * 47 + now / 145) % 246;
        g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
      }
      g.globalAlpha = 1;
    }
    if (highlighted && highlighted !== 'door') {
      const r = FOREST_TARGETS[highlighted];
      g.fillStyle = '#cfb38a';
      for (const x of [r.x + 2, r.x + r.w - 5]) g.fillRect(x, r.y + r.h - 2, 3, 1);
    }
    const dg = this.canvas.getContext('2d')!;
    dg.imageSmoothingEnabled = false;
    dg.drawImage(this.scene, fit.crop.x, fit.crop.y, fit.crop.w, fit.crop.h, 0, 0, fit.backingW, fit.backingH);
  }
}
