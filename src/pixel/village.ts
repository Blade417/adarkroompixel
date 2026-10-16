import manifest from '../../assets/pixel/village/v1/manifest.json';
import landscapeManifest from '../../assets/pixel/village/v2/manifest.json';
import publicManifest from '../../assets/pixel/village/v3/manifest.json';
import { FOREST_EXIT, HEARTH_PLOT, HUT_PLOTS, PUBLIC_FACILITIES, VILLAGE_SIZE, inhabitants, type VillageTarget, type VillageView } from '../app/village';
import { ctx2d, makeCanvas } from './paint';
import { resample, type SampleMode } from './resample';
import type { Fit } from './fit';
import { villageLandscape } from './village-landscape';

const specs = { ...manifest.assets, ...landscapeManifest.assets, ...publicManifest.assets };
type ArtId = keyof typeof specs;
export type VillageArt = Record<ArtId, HTMLCanvasElement>;
const urls = import.meta.glob(['../../assets/pixel/village/v1/hearth-house.png', '../../assets/pixel/village/v1/cottages.png', '../../assets/pixel/village/v2/*.png', '../../assets/pixel/village/v3/*.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Decode each source once; crops remove atlas spacing without changing the original PNGs. */
export async function loadVillageArt(mode: SampleMode): Promise<VillageArt> {
  const sources = new Map<string, Promise<HTMLImageElement>>();
  const entries = await Promise.all(Object.entries(specs).map(async ([id, spec]) => {
    if (!sources.has(spec.file)) sources.set(spec.file, (async () => {
      const url = Object.entries(urls).find(([path]) => path.endsWith('/' + spec.file))?.[1];
      if (!url) throw Error(`Missing village art: ${spec.file}`);
      const image = new Image(); image.src = url; await image.decode(); return image;
    })());
    const image = await sources.get(spec.file)!;
    const [x, y, w, h] = spec.sourceRect, [dw, dh] = spec.drawSize;
    const source = makeCanvas(w, h), sg = ctx2d(source);
    sg.drawImage(image, x, y, w, h, 0, 0, w, h);
    const reduced = resample(sg.getImageData(0, 0, w, h), dw, dh, { mode: spec.hasAlpha ? 'box' : mode, alphaCut: spec.hasAlpha ? manifest.alphaCut : null });
    const canvas = makeCanvas(dw, dh), cg = ctx2d(canvas), pixels = cg.createImageData(dw, dh);
    pixels.data.set(reduced.data); cg.putImageData(pixels, 0, 0);
    return [id, canvas] as const;
  }));
  return Object.fromEntries(entries) as VillageArt;
}

export class VillageRenderer {
  private readonly scene = makeCanvas(VILLAGE_SIZE.w, VILLAGE_SIZE.h);
  private readonly g = ctx2d(this.scene);
  private readonly ground = makeCanvas(VILLAGE_SIZE.w, VILLAGE_SIZE.h);
  private cleared = -1;
  constructor(private readonly canvas: HTMLCanvasElement, private readonly art: VillageArt) {}

  render(fit: Fit, view: VillageView, highlighted: VillageTarget | null, now: number, reduce: boolean): void {
    const g = this.g;
    const landscape = villageLandscape(view.clearedHuts);
    if (this.cleared !== view.clearedHuts) {
      this.cleared = view.clearedHuts;
      const bg = ctx2d(this.ground); bg.drawImage(this.art.terrain, 0, 0, VILLAGE_SIZE.w, VILLAGE_SIZE.h);
      // Worn, irregular soil edges unify the house and its newly opened yard.
      [...landscape.yards, ...landscape.publicYards].forEach(({ x, y, w, h }, i) => {
        bg.fillStyle = '#655746'; bg.globalAlpha = .28; bg.beginPath();
        bg.moveTo(x + 7, y); bg.lineTo(x + w - 5, y + 2); bg.lineTo(x + w, y + 9);
        bg.lineTo(x + w - 2, y + h - 5); bg.lineTo(x + w - 9, y + h);
        bg.lineTo(x + 4, y + h - 2); bg.lineTo(x, y + h - 10); bg.lineTo(x + 2, y + 5); bg.closePath(); bg.fill();
        bg.globalAlpha = .3; bg.fillStyle = '#887458';
        for (let j = 0; j < 8; j++) bg.fillRect(x + 7 + (j * 13 + i * 7) % (w - 14), y + 8 + (j * 17) % (h - 15), 2, 1);
      });
      // Deduplicate shared segments so crossings don't become dark squares.
      const seen = new Set<string>(); bg.fillStyle = '#75644c'; bg.globalAlpha = .6;
      for (const path of landscape.paths) for (const [x, y] of path) {
        const key = `${x},${y}`; if (seen.has(key)) continue; seen.add(key); bg.fillRect(x - 1, y - 1, 3, 3);
      }
      bg.globalAlpha = 1;
      // Canopies are already excluded from every roof and yard, so the forest is a safe static layer.
      for (const tree of landscape.trees) {
        const sprite = this.art[`tree${tree.variant}`]; bg.save();
        bg.translate(tree.x + (tree.flip ? tree.w : 0), tree.y); bg.scale(tree.flip ? -1 : 1, 1);
        bg.drawImage(sprite, 0, 0); bg.restore();
      }
    }
    g.drawImage(this.ground, 0, 0);
    const houses = Array.from({ length: view.huts }, (_, i) => ({ x: HUT_PLOTS[i][0], y: HUT_PLOTS[i][1], id: i }));
    const sorted = [...houses, { x: HEARTH_PLOT.x, y: HEARTH_PLOT.y, id: -1 },
      ...PUBLIC_FACILITIES.map((f, i) => ({ x: f.x, y: f.y, id: -i - 2 }))].sort((a, b) => a.y - b.y);
    for (const house of sorted) {
      if (house.id < -1) {
        const f = PUBLIC_FACILITIES[-house.id - 2], left = f.x - f.w / 2, top = f.y - f.h;
        if (view.facilities[f.id] > 0) {
          const sprite = this.art[f.art];
          g.fillStyle = '#101419'; g.globalAlpha = .4; g.fillRect(left + 3, f.y - 2, f.w - 6, 4); g.globalAlpha = 1;
          g.drawImage(sprite, f.x - Math.floor(sprite.width / 2), f.y - sprite.height);
        } else {
          // Empty plots are deliberate reservations, never free completed buildings.
          g.fillStyle = '#93816a';
          for (const [x, y] of [[left + 3, top + 6], [left + f.w - 4, top + 6], [left + 3, f.y - 2], [left + f.w - 4, f.y - 2]]) {
            g.fillRect(x, y - 3, 1, 4); g.fillRect(x - 1, y + 1, 3, 1);
          }
        }
        if (highlighted === f.zone) { g.fillStyle = '#cfb38a'; g.fillRect(left + 3, f.y + 2, 5, 1); g.fillRect(left + f.w - 8, f.y + 2, 5, 1); }
        continue;
      }
      const home = house.id < 0, sprite = home ? this.art.hearth : this.art[`hut${house.id % 4}` as ArtId];
      const occupied = home ? view.fire > 0 : inhabitants(view, house.id) > 0;
      const left = house.x - Math.floor(sprite.width / 2), top = house.y - sprite.height;
      g.fillStyle = '#101419'; g.globalAlpha = .45;
      g.fillRect(left + 2, house.y - 3, sprite.width - 1, 5); g.globalAlpha = 1;
      g.drawImage(sprite, left, top);
      if (!occupied) {
        // Dim amber pixels only, preserving roof detail and the clean alpha silhouette.
        this.dimWindows(sprite, left, top);
      } else if (!reduce && Math.floor(now / 400 + house.id) % 7 === 0) {
        g.fillStyle = '#88908d'; g.globalAlpha = .32;
        g.fillRect(house.x + (home ? 16 : 9), top - 2, 1, 2); g.globalAlpha = 1;
      }
      if (highlighted === (home ? 'home' : house.id)) {
        g.fillStyle = '#d1b384';
        g.fillRect(left + 2, house.y + 2, 5, 1); g.fillRect(left + sprite.width - 7, house.y + 2, 5, 1);
      }
    }
    if (highlighted === 'forest') { g.fillStyle = '#cfb38a'; g.fillRect(FOREST_EXIT.x - 5, FOREST_EXIT.y - 3, 10, 1); }
    const dg = this.canvas.getContext('2d')!; dg.imageSmoothingEnabled = false;
    dg.drawImage(this.scene, fit.crop.x, fit.crop.y, fit.crop.w, fit.crop.h, 0, 0, fit.backingW, fit.backingH);
  }

  private readonly darkWindows = new Map<HTMLCanvasElement, HTMLCanvasElement>();
  private dimWindows(sprite: HTMLCanvasElement, x: number, y: number): void {
    let dark = this.darkWindows.get(sprite);
    if (!dark) {
      dark = makeCanvas(sprite.width, sprite.height); const g = ctx2d(dark);
      g.drawImage(sprite, 0, 0); const pixels = g.getImageData(0, 0, dark.width, dark.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const r = pixels.data[i], green = pixels.data[i + 1], b = pixels.data[i + 2];
        if (r > 115 && r > green * 1.18 && green > b * 1.25) {
          pixels.data[i] = 53; pixels.data[i + 1] = 48; pixels.data[i + 2] = 41;
        }
      }
      g.putImageData(pixels, 0, 0); this.darkWindows.set(sprite, dark);
    }
    this.g.drawImage(dark, x, y);
  }
}
