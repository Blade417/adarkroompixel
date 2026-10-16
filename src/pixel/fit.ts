/**
 * Integer, nearest-neighbour fitting of the 480x270 frame.
 * The scale is chosen in device pixels so every logical pixel covers exactly scale x scale
 * physical pixels at any devicePixelRatio; positions are snapped to device pixels too.
 */
import { FOCUS_X, NARROW_CROP, VIEW_H, VIEW_W, type Rect } from './layout';

export type LayoutMode = 'overlay' | 'stacked';

export interface Fit {
  mode: LayoutMode;
  /** device pixels per logical pixel (integer >= 1) */
  scale: number;
  /** the logical region drawn to the canvas */
  crop: Rect;
  /** canvas backing-store size in device pixels */
  backingW: number;
  backingH: number;
  /** CSS size of the canvas */
  cssW: number;
  cssH: number;
  /** CSS offset of the canvas inside its box (snapped to device pixels) */
  left: number;
  top: number;
  /** CSS pixels per logical pixel */
  ps: number;
}

/** the HUD floats over the frame only when a logical pixel is at least this many CSS px */
export const OVERLAY_MIN_PS = 2;
/** narrower than this (width / height) and the page switches to the stacked layout */
export const OVERLAY_MIN_ASPECT = 1.2;
/** share of the viewport height the stage may take in the stacked layout */
export const STACKED_STAGE_SHARE = 0.58;

const snap = (cssPx: number, dpr: number): number => Math.round(cssPx * dpr) / dpr;

export function fullScale(boxW: number, boxH: number, dpr: number, size = { w: VIEW_W, h: VIEW_H }): number {
  return Math.max(1, Math.floor(Math.min((boxW * dpr) / size.w, (boxH * dpr) / size.h)));
}

export function chooseMode(viewW: number, viewH: number, dpr: number): LayoutMode {
  if (viewW <= 0 || viewH <= 0) return 'stacked';
  const fits = Math.floor(Math.min((viewW * dpr) / VIEW_W, (viewH * dpr) / VIEW_H));
  return fits / dpr >= OVERLAY_MIN_PS && viewW / viewH >= OVERLAY_MIN_ASPECT ? 'overlay' : 'stacked';
}

/** the whole frame, centred in a box (overlay layout) */
export function fitFull(boxW: number, boxH: number, dpr: number, size = { w: VIEW_W, h: VIEW_H }): Fit {
  const scale = fullScale(boxW, boxH, dpr, size);
  const backingW = size.w * scale;
  const backingH = size.h * scale;
  return {
    mode: 'overlay',
    scale,
    crop: { x: 0, y: 0, w: size.w, h: size.h },
    backingW,
    backingH,
    cssW: backingW / dpr,
    cssH: backingH / dpr,
    left: snap((boxW - backingW / dpr) / 2, dpr),
    top: snap((boxH - backingH / dpr) / 2, dpr),
    ps: scale / dpr
  };
}

/**
 * the narrow crop for the stacked layout: as large as the width and `maxH` allow; when even
 * scale 1 is too wide, the visible window is centred on the stranger / hearth (FOCUS_X)
 */
export function fitNarrow(boxW: number, maxH: number, dpr: number, focusX = FOCUS_X): Fit {
  const c = NARROW_CROP;
  const scale = Math.max(1, Math.floor(Math.min((boxW * dpr) / c.w, (maxH * dpr) / c.h)));
  const visW = Math.max(1, Math.min(c.w, Math.floor((boxW * dpr) / scale)));
  const x = Math.max(c.x, Math.min(c.x + c.w - visW, Math.round(focusX - visW / 2)));
  const crop = { x, y: c.y, w: visW, h: c.h };
  const backingW = crop.w * scale;
  const backingH = crop.h * scale;
  return {
    mode: 'stacked',
    scale,
    crop,
    backingW,
    backingH,
    cssW: backingW / dpr,
    cssH: backingH / dpr,
    left: snap(Math.max(0, (boxW - backingW / dpr) / 2), dpr),
    top: 0,
    ps: scale / dpr
  };
}

/** logical coordinates of a point given in CSS px relative to the canvas' top-left corner */
export function toLogical(fit: Fit, cssX: number, cssY: number): { x: number; y: number } {
  return { x: fit.crop.x + cssX / fit.ps, y: fit.crop.y + cssY / fit.ps };
}

/** CSS position (relative to the canvas) of a logical point */
export function toCss(fit: Fit, x: number, y: number): { x: number; y: number } {
  return { x: (x - fit.crop.x) * fit.ps, y: (y - fit.crop.y) * fit.ps };
}
