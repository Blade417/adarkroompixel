/**
 * The delivered art pack (assets/pixel/room/v1): manifest.json + the original high-resolution
 * PNGs. Each frame's sourceRect is reduced once at boot to its rounded drawSize (logical px) with
 * resample(); sprites are then drawn 1:1 by their bottom-centre ground anchors. Nothing is ever
 * scaled at draw time and whole sheets are never scaled as one image.
 */
import manifestJson from '../../assets/pixel/room/v1/manifest.json';
import { ctx2d, makeCanvas } from './paint';
import { borderColour, resample, type Pixels, type SampleMode } from './resample';
import type { Sprite } from './sprites';
import { loadArtImage } from './loading';
import { loadPackedArt } from './runtime-art';

export type RectTuple = [number, number, number, number];

export interface FrameSpec {
  index: number;
  cell: RectTuple;
  sourceRect: RectTuple;
  drawSize: [number, number];
  anchor: 'top-left' | 'bottom-center';
  suggestedDestination: RectTuple;
}

export interface FireLevelSpec {
  visible?: boolean;
  animated?: boolean;
  frame?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  opacity?: number;
}

export interface AssetSpec {
  file: string;
  sourceSize: [number, number];
  hasAlpha: boolean;
  grid: [number, number];
  frames: FrameSpec[];
  suggestedGroundAnchor?: [number, number];
  animation?: { fps: number; sequence: number[]; reducedMotionFrame: number };
  levelsSuggestion?: Record<string, FireLevelSpec>;
  states?: Record<string, number>;
  quantityThresholdsSuggestion?: Record<string, unknown>;
}

export type ArtId = 'room-back' | 'hearth' | 'fire' | 'stranger-huddled' | 'woodpile' | 'door-closed';
export const ART_IDS: readonly ArtId[] = ['room-back', 'hearth', 'fire', 'stranger-huddled', 'woodpile', 'door-closed'];

export interface Manifest {
  schemaVersion: number;
  id: string;
  logicalScene: { width: number; height: number };
  boundsAlphaThreshold: number;
  assets: Record<ArtId, AssetSpec>;
  renderOrder: string[];
}

export const MANIFEST = manifestJson as unknown as Manifest;

const URLS = import.meta.glob('../../assets/pixel/room/v1/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>;
export const roomAssetUrls = Object.values(URLS);

export function artUrl(file: string): string | undefined {
  for (const [path, url] of Object.entries(URLS)) if (path.endsWith(`/${file}`)) return url;
  return undefined;
}

/** sprites keep hard edges: an output pixel is opaque when at least half of its area is */
export const ALPHA_CUT = 0.5;

async function loadImage(url: string): Promise<HTMLImageElement> {
  return loadArtImage(url);
}

function pixelsToSprite(p: Pixels): Sprite {
  const c = makeCanvas(p.width, p.height);
  const g = ctx2d(c);
  const img = g.createImageData(p.width, p.height);
  img.data.set(p.data);
  g.putImageData(img, 0, 0);
  return { canvas: c, w: p.width, h: p.height };
}

/** a source rectangle of an image, read once and reduced to any number of sizes */
class Region {
  private pixels: Pixels | null = null;
  private readable = true;

  constructor(
    private readonly img: HTMLImageElement,
    private readonly rect: RectTuple
  ) {}

  bake(w: number, h: number, sample: SampleMode, alphaCut: number | null, opacity = 1): Sprite {
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    const [sx, sy, sw, sh] = this.rect;
    if (this.readable && !this.pixels) {
      try {
        const c = makeCanvas(sw, sh);
        const g = ctx2d(c);
        g.drawImage(this.img, sx, sy, sw, sh, 0, 0, sw, sh);
        const d = g.getImageData(0, 0, sw, sh);
        this.pixels = { data: d.data, width: sw, height: sh };
      } catch (err) {
        // pixels unreadable (e.g. a tainted canvas): let the browser reduce it instead
        console.warn('[art] cannot read pixels, using the browser\'s scaler', err);
        this.readable = false;
      }
    }
    if (this.pixels) return pixelsToSprite(resample(this.pixels, W, H, { mode: sample, alphaCut, opacity }));
    const c = makeCanvas(W, H);
    const g = ctx2d(c);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.globalAlpha = opacity;
    g.drawImage(this.img, sx, sy, sw, sh, 0, 0, W, H);
    return { canvas: c, w: W, h: H };
  }
}

async function open(id: ArtId): Promise<{ spec: AssetSpec; img: HTMLImageElement }> {
  const spec = MANIFEST.assets[id];
  const url = artUrl(spec.file);
  if (!url) throw new Error(`${spec.file} not found`);
  const img = await loadImage(url);
  const [w, h] = spec.sourceSize;
  if (img.naturalWidth !== w || img.naturalHeight !== h) {
    console.warn(`[art] ${spec.file} is ${img.naturalWidth}x${img.naturalHeight}, manifest says ${w}x${h}`);
  }
  return { spec, img };
}

function frames(spec: AssetSpec, img: HTMLImageElement, sample: SampleMode, scale = 1): Sprite[] {
  return spec.frames.map((f) => new Region(img, f.sourceRect).bake(f.drawSize[0] * scale, f.drawSize[1] * scale, sample, ALPHA_CUT));
}

export interface FireBake {
  /** frames per fire level; index 0 (dead) is empty */
  levels: Sprite[][];
  fps: number;
}

export interface ArtBakes {
  room?: { sprite: Sprite; border: [number, number, number] };
  hearth?: Sprite;
  door?: Sprite;
  fire?: FireBake;
  huddled?: { frames: Sprite[]; fps: number };
  woodpile?: Sprite[];
  /** pieces that failed to load or bake (their stand-ins are used) */
  failed: ArtId[];
}

/** fire levels per the manifest's levelsSuggestion (level 1: a squashed frame as embers) */
export function bakeFire(spec: AssetSpec, img: HTMLImageElement, sample: SampleMode): FireBake {
  const regions = spec.frames.map((f) => new Region(img, f.sourceRect));
  const sequence = spec.animation?.sequence ?? spec.frames.map((f) => f.index);
  const levels: Sprite[][] = [[]];
  for (let level = 1; level <= 4; level++) {
    const s = spec.levelsSuggestion?.[String(level)] ?? { scale: 1 };
    if (s.visible === false) levels.push([]);
    else if (s.frame !== undefined) {
      const f = spec.frames[s.frame];
      const sx = s.scaleX ?? s.scale ?? 1;
      const sy = s.scaleY ?? s.scale ?? 1;
      levels.push([regions[s.frame].bake(f.drawSize[0] * sx, f.drawSize[1] * sy, sample, ALPHA_CUT, s.opacity ?? 1)]);
    } else {
      const k = s.scale ?? 1;
      levels.push(
        sequence.map((i) => regions[i].bake(spec.frames[i].drawSize[0] * k, spec.frames[i].drawSize[1] * k, sample, ALPHA_CUT, s.opacity ?? 1))
      );
    }
  }
  return { levels, fps: spec.animation?.fps ?? 8 };
}

/** load and bake every piece of the pack; each piece fails on its own */
export async function bakeArtPack(sample: SampleMode, packed = true): Promise<ArtBakes> {
  const ready = packed && sample === 'mode' ? await loadPackedArt('room') : null;
  if (ready) {
    const s = ready.sprites;
    const m = ready.meta as unknown as { border: [number, number, number]; fireLevels: string[][]; fireFps: number; huddled: string[]; huddledFps: number; woodpile: string[] };
    return {
      room: { sprite: s.room, border: m.border }, hearth: s.hearth, door: s.door,
      fire: { levels: m.fireLevels.map(keys => keys.map(k => s[k])), fps: m.fireFps },
      huddled: { frames: m.huddled.map(k => s[k]), fps: m.huddledFps },
      woodpile: m.woodpile.map(k => s[k]), failed: []
    };
  }
  const out: ArtBakes = { failed: [] };
  const piece = async (id: ArtId, fn: (spec: AssetSpec, img: HTMLImageElement) => void): Promise<void> => {
    try {
      const { spec, img } = await open(id);
      fn(spec, img);
    } catch (err) {
      console.warn(`[art] ${id}: using the stand-in`, err);
      out.failed.push(id);
    }
  };
  await Promise.all([
    piece('room-back', (spec, img) => {
      const f = spec.frames[0];
      const region = new Region(img, f.sourceRect);
      const sprite = region.bake(f.drawSize[0], f.drawSize[1], sample, null);
      let border: [number, number, number] = [16, 18, 24];
      try {
        const d = ctx2d(sprite.canvas).getImageData(0, 0, sprite.w, sprite.h);
        border = borderColour({ data: d.data, width: sprite.w, height: sprite.h });
      } catch {
        // unreadable pixels: keep the handoff base colour
      }
      out.room = { sprite, border };
    }),
    piece('hearth', (spec, img) => {
      out.hearth = frames(spec, img, sample)[0];
    }),
    piece('door-closed', (spec, img) => {
      out.door = frames(spec, img, sample)[0];
    }),
    piece('fire', (spec, img) => {
      out.fire = bakeFire(spec, img, sample);
    }),
    piece('stranger-huddled', (spec, img) => {
      const all = frames(spec, img, sample);
      const seq = spec.animation?.sequence ?? all.map((_, i) => i);
      out.huddled = { frames: seq.map((i) => all[i]), fps: spec.animation?.fps ?? 2.5 };
    }),
    piece('woodpile', (spec, img) => {
      out.woodpile = frames(spec, img, sample);
    })
  ]);
  return out;
}
