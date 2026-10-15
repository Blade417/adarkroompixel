/**
 * Fire light and cold, as cached full-frame layers composited over the lit content:
 * - a light map drawn with 'multiply': the room dims outside the fire's reach and takes a warm
 *   cast near it (banded, with a narrow ordered-dither seam between bands, no blur);
 * - a warm glow drawn with 'screen' close to the fire, lifting it above the art's own brightness;
 * - a temperature tint drawn with 'multiply': cold blue-grey when freezing, warm when hot.
 * All three fade out over the outer EDGE pixels, so the frame's border keeps the art's own colour
 * and blends into the page. The pure maths is separate from the canvas cache so it can be tested.
 */
import { LIGHT_CENTRE, VIEW_H, VIEW_W } from './layout';
import { bayer, ctx2d, makeCanvas } from './paint';

/** brightness outside the fire's reach, by fire level 0..4 (1 = the art as delivered) */
export const AMBIENT = [0.5, 0.56, 0.63, 0.7, 0.77] as const;
/** horizontal radius of the lit area by fire level (vertical radius = RX / LIGHT_ASPECT) */
export const LIGHT_RX = [0, 50, 95, 145, 195] as const;
export const LIGHT_ASPECT = 1.45;
/** strength of the additive glow at the heart of the light */
export const GLOW = [0, 0.05, 0.1, 0.15, 0.2] as const;
/** multiply colour at the heart of the light (warm) */
const WARM_K = [1, 0.92, 0.8] as const;
/** cold light from the window, kept even when the fire is out */
const MOON = { x: 246, y: 176, rx: 46, ry: 26, lift: 0.07 };
/** width of the border over which every layer fades out */
export const EDGE = 14;
/** light bands from the fire's heart to the edge of its reach */
const STEPS = 5;
/** radius factors of the three flicker variants */
export const FLICKER = [0.96, 1, 1.04] as const;

const level = (v: number): number => Math.max(0, Math.min(4, Math.floor(v) || 0));

/** 1 inside the frame, falling to 0 at its border */
export function edgeFade(x: number, y: number): number {
  return Math.min(1, Math.min(x, y, VIEW_W - 1 - x, VIEW_H - 1 - y) / EDGE);
}

/** how lit a pixel is, 0 (ambient) .. 1 (heart of the fire's light), banded and dithered */
export function litAt(fire: number, x: number, y: number, radiusFactor = 1): number {
  const rx = LIGHT_RX[level(fire)] * radiusFactor;
  if (rx <= 0) return 0;
  const dx = (x + 0.5 - LIGHT_CENTRE.x) / rx;
  const dy = (y + 0.5 - LIGHT_CENTRE.y) / (rx / LIGHT_ASPECT);
  const raw = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
  const v = raw * raw * (3 - 2 * raw) * STEPS;
  let band = Math.floor(v);
  const frac = v - band;
  // only the last quarter of each band is dithered into the next one
  if (frac > 0.75 && bayer(x, y) < (frac - 0.75) * 4) band++;
  return Math.min(1, band / STEPS);
}

export interface Light {
  /** multiply factors r, g, b in 0..1 */
  k: [number, number, number];
  /** additive warm glow alpha 0..1 */
  glow: number;
}

export function lightAt(fire: number, x: number, y: number, radiusFactor = 1): Light {
  const f = level(fire);
  const lit = litAt(f, x, y, radiusFactor);
  let b = AMBIENT[f] + (1 - AMBIENT[f]) * lit;
  const mx = (x + 0.5 - MOON.x) / MOON.rx;
  const my = (y + 0.5 - MOON.y) / MOON.ry;
  const md = mx * mx + my * my;
  if (md < 1 && (md < 0.5 || bayer(x, y) < 0.5)) b = Math.min(1, b + MOON.lift * (1 - lit));
  const e = edgeFade(x, y);
  const k = WARM_K.map((w) => {
    const v = b * (1 + (w - 1) * lit);
    return 1 - (1 - v) * e;
  }) as [number, number, number];
  return { k, glow: GLOW[f] * lit * lit * e };
}

/** multiply colour of the whole room by temperature 0..4 (null: none) */
export const TEMPERATURE_TINT: ReadonlyArray<readonly [number, number, number] | null> = [
  [0.8, 0.87, 1],
  [0.9, 0.94, 1],
  null,
  [1, 0.96, 0.9],
  [1, 0.92, 0.82]
];

const GLOW_RGB = [240, 168, 104] as const;

export interface LightLayers {
  /** draw with 'multiply' */
  map: HTMLCanvasElement;
  /** draw with 'screen' (null at fire 0) */
  glow: HTMLCanvasElement | null;
}

const layers = new Map<string, LightLayers>();
const tints = new Map<number, HTMLCanvasElement | null>();

/** cached light layers for a fire level and flicker variant */
export function lightLayers(fire: number, variant: 0 | 1 | 2): LightLayers {
  const f = level(fire);
  const key = `${f}:${variant}`;
  const hit = layers.get(key);
  if (hit) return hit;
  const map = makeCanvas(VIEW_W, VIEW_H);
  const mg = ctx2d(map);
  const mi = mg.createImageData(VIEW_W, VIEW_H);
  const glow = f > 0 ? makeCanvas(VIEW_W, VIEW_H) : null;
  const gg = glow ? ctx2d(glow) : null;
  const gi = gg ? gg.createImageData(VIEW_W, VIEW_H) : null;
  for (let y = 0; y < VIEW_H; y++) {
    for (let x = 0; x < VIEW_W; x++) {
      const { k, glow: a } = lightAt(f, x, y, FLICKER[variant]);
      const i = (y * VIEW_W + x) * 4;
      mi.data[i] = k[0] * 255;
      mi.data[i + 1] = k[1] * 255;
      mi.data[i + 2] = k[2] * 255;
      mi.data[i + 3] = 255;
      if (gi && a > 0) {
        gi.data[i] = GLOW_RGB[0];
        gi.data[i + 1] = GLOW_RGB[1];
        gi.data[i + 2] = GLOW_RGB[2];
        gi.data[i + 3] = a * 255;
      }
    }
  }
  mg.putImageData(mi, 0, 0);
  if (gg && gi) gg.putImageData(gi, 0, 0);
  const out = { map, glow };
  layers.set(key, out);
  return out;
}

/** cached temperature tint layer (multiply), null when the room is mild */
export function tintLayer(temperature: number): HTMLCanvasElement | null {
  const t = level(temperature);
  if (tints.has(t)) return tints.get(t) ?? null;
  const tint = TEMPERATURE_TINT[t];
  let c: HTMLCanvasElement | null = null;
  if (tint) {
    c = makeCanvas(VIEW_W, VIEW_H);
    const g = ctx2d(c);
    const img = g.createImageData(VIEW_W, VIEW_H);
    for (let y = 0; y < VIEW_H; y++) {
      for (let x = 0; x < VIEW_W; x++) {
        const e = edgeFade(x, y);
        const i = (y * VIEW_W + x) * 4;
        for (let ch = 0; ch < 3; ch++) img.data[i + ch] = (1 - (1 - tint[ch]) * e) * 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  tints.set(t, c);
  return c;
}

/** flicker variant for a moment in time (steady when motion is reduced) */
export function flickerVariant(timeMs: number, reduceMotion: boolean): 0 | 1 | 2 {
  if (reduceMotion) return 1;
  const slot = Math.floor(timeMs / 140);
  const h = Math.abs(Math.sin(slot * 12.9898) * 43758.5453) % 1;
  return h < 0.25 ? 0 : h > 0.75 ? 2 : 1;
}
