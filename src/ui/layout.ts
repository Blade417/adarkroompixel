/**
 * Where the HTML interface sits around the pixel frame. Pure: the CSS reads the variables.
 *
 * - side:    wide margins beside the frame. Log in the left margin, stores in the right one,
 *            the fire controls in the dark band under the floor.
 * - band:    the frame fills the width. Log, fire controls and stores share the band under the floor.
 * - stacked: narrow / portrait. The cropped frame on top, the interface flows below it.
 *
 * Nothing is placed over the room between the top band and the floor's front edge, so the hearth
 * and the stranger are never covered (see tests/pixel.test.ts).
 */
import type { Fit } from '../pixel/fit';
import { FLOOR_FRONT, TOP_BAND } from '../pixel/layout';

export type HudMode = 'side' | 'band' | 'stacked';

/** height of the header bar (CSS px; a multiple of 4 so it stays on device pixels at 1.25x / 1.5x / 1.75x) */
export const HEADER_H = 56;
/** least margin beside the frame for the side layout (CSS px) */
export const SIDE_MIN = 176;

export interface HudLayout {
  mode: HudMode;
  /** CSS px, relative to the stage box */
  canvas: { x: number; y: number; w: number; h: number };
  /** first CSS row under the top band (where side panels start) */
  roomTop: number;
  /** first CSS row of the dark band under the floor */
  band: number;
  /** height from the band to the bottom of the stage box */
  bandH: number;
}

export function hudLayout(fit: Fit, boxW: number, boxH: number): HudLayout {
  const canvas = { x: fit.left, y: fit.top, w: fit.cssW, h: fit.cssH };
  const roomTop = canvas.y + Math.max(0, TOP_BAND - fit.crop.y) * fit.ps;
  const band = canvas.y + (FLOOR_FRONT - fit.crop.y) * fit.ps;
  const side = boxW - canvas.x - canvas.w;
  const mode: HudMode = fit.mode === 'stacked' ? 'stacked' : Math.min(canvas.x, side) >= SIDE_MIN ? 'side' : 'band';
  return { mode, canvas, roomTop, band, bandH: Math.max(0, boxH - band) };
}

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;

export function layoutVars(l: HudLayout): Record<string, string> {
  return {
    '--cx': px(l.canvas.x),
    '--cy': px(l.canvas.y),
    '--cw': px(l.canvas.w),
    '--ch': px(l.canvas.h),
    '--room-top': px(l.roomTop),
    '--band': px(l.band),
    '--bandh': px(l.bandH)
  };
}
