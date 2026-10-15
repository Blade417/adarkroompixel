/**
 * Baked sprites: every frame is an integer-size canvas in logical pixels, drawn 1:1 into the
 * 480x270 scene (never scaled at draw time), placed by a bottom-centre ground anchor.
 */
import { groundTopLeft, type Point } from './layout';
import type { Ctx } from './paint';

export interface Sprite {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

/** where a piece comes from: delivered art, art adapted in code, or procedural stand-in */
export type Source = 'art' | 'derived' | 'placeholder';

export interface Strip {
  frames: Sprite[];
  /** animation rate in frames per second (0: still) */
  fps: number;
  source: Source;
}

/** looping frame for a time in seconds */
export function loopFrame(timeSec: number, fps: number, frames: number): number {
  if (!(fps > 0) || frames <= 1) return 0;
  return Math.floor(timeSec * fps) % frames;
}

export function drawGround(g: Ctx, s: Sprite, anchor: Point): void {
  const p = groundTopLeft(anchor, s.w, s.h);
  g.drawImage(s.canvas, p.x, p.y);
}

/** pixel rectangle a sprite covers when standing on `anchor` */
export function groundRect(s: Sprite, anchor: Point): { x: number; y: number; w: number; h: number } {
  const p = groundTopLeft(anchor, s.w, s.h);
  return { x: p.x, y: p.y, w: s.w, h: s.h };
}
