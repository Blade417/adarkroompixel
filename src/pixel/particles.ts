/**
 * Decorative particles as pure functions of time: no state, nothing to update, identical after a
 * pause. They are switched off entirely when motion is reduced.
 */
import { ANCHOR, FIREBOX, type Rect } from './layout';
import { hash } from './paint';
import { PAL } from './palette';

export interface Particle {
  x: number;
  y: number;
  color: string;
  alpha: number;
  size: number;
}

const wrap = (v: number, m: number): number => ((v % m) + m) % m;

/** snow drifting down inside a rectangle (window pane, open doorway) */
export function snow(area: Rect, timeSec: number, count: number, seed: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const fall = 5 + hash(seed, i, 1) * 9;
    const wind = 1.5 + hash(seed, i, 2) * 2;
    const sway = Math.sin(timeSec * (0.8 + hash(seed, i, 3)) + i) * 1.5;
    const x = area.x + Math.floor(wrap(hash(seed, i, 4) * area.w + wind * timeSec + sway, area.w));
    const y = area.y + Math.floor(wrap(hash(seed, i, 5) * area.h + fall * timeSec, area.h));
    out.push({ x, y, color: PAL.snow, alpha: 0.55 + hash(seed, i, 6) * 0.4, size: 1 });
  }
  return out;
}

export const SPARKS_BY_FIRE = [0, 0, 3, 5, 8] as const;

/**
 * sparks lifting off the fire (emissive, drawn above the light). They stay inside the hearth's
 * arch (FIREBOX): a spark that would leave it has gone up the flue.
 */
export function sparks(fire: number, timeSec: number): Particle[] {
  const f = Math.max(0, Math.min(4, Math.floor(fire) || 0));
  const n = SPARKS_BY_FIRE[f];
  const out: Particle[] = [];
  const base = ANCHOR.fire;
  const box = FIREBOX;
  for (let i = 0; i < n; i++) {
    const period = 1.1 + hash(i, 70) * 0.7;
    const t = timeSec + hash(i, 71) * period;
    const cycle = Math.floor(t / period);
    const age = (t - cycle * period) / period;
    if (age > 0.85) continue;
    const x0 = base.x - 10 + hash(i, cycle, 72) * 20;
    const rise = (16 + hash(i, cycle, 73) * 18 + f * 3) * age;
    const x = Math.round(x0 + Math.sin(age * 6 + i) * 2 * age);
    const y = Math.round(base.y - 8 - rise);
    if (x < box.x + 1 || x > box.x + box.w - 2 || y < box.y + 1 || y > box.y + box.h - 2) continue;
    out.push({ x, y, color: age < 0.4 ? PAL.flameCore : PAL.flame, alpha: 1 - age * 0.6, size: 1 });
  }
  return out;
}
