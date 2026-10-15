/** Small pixel-painting helpers shared by the placeholder art, the light and the particles. */
export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  g.imageSmoothingEnabled = false;
  return g;
}

export function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(c: Ctx, x: number, y: number, col: string): void {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** deterministic hash -> [0, 1) */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** ordered-dither threshold in [0, 1) */
export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** filled ellipse made of horizontal spans (pixel-exact) */
export function ellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string | ((x: number, y: number) => string | null)): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    if (typeof col === 'string') rect(c, x0, y, x1 - x0, 1, col);
    else
      for (let x = x0; x < x1; x++) {
        const k = col(x, y);
        if (k) px(c, x, y, k);
      }
  }
}

/** 1-px line (Bresenham) */
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, thick = 1): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    rect(c, x0, y0, thick, thick, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * add a 1-px outline around the opaque pixels of a region (4-neighbourhood), like the
 * dark contour of the handoff art
 */
export function outline(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  const img = c.getImageData(x, y, w, h);
  const d = img.data;
  const solid = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 0;
  const mark: number[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (solid(i, j)) continue;
      if (solid(i - 1, j) || solid(i + 1, j) || solid(i, j - 1) || solid(i, j + 1)) mark.push(i, j);
    }
  for (let k = 0; k < mark.length; k += 2) px(c, x + mark[k], y + mark[k + 1], col);
}

/** light the outermost opaque pixel of each row on one side (fire-side rim light) */
export function rim(c: Ctx, w: number, h: number, col: string, side: 'left' | 'right', fromY = 0, toY = h): void {
  const d = c.getImageData(0, 0, w, h).data;
  for (let y = Math.max(0, fromY); y < Math.min(h, toY); y++) {
    for (let k = 0; k < w; k++) {
      const x = side === 'right' ? w - 1 - k : k;
      if (d[(y * w + x) * 4 + 3] > 0) {
        px(c, x, y, col);
        break;
      }
    }
  }
}

/** an outline-only copy of a sprite's silhouette (used for the hover highlight) */
export function silhouetteOutline(src: CanvasImageSource, sx: number, sy: number, w: number, h: number, col: string): HTMLCanvasElement {
  const tmp = makeCanvas(w + 2, h + 2);
  const t = ctx2d(tmp);
  t.drawImage(src, sx, sy, w, h, 1, 1, w, h);
  const img = t.getImageData(0, 0, w + 2, h + 2);
  const out = makeCanvas(w + 2, h + 2);
  const o = ctx2d(out);
  const W = w + 2;
  const H = h + 2;
  const a = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < W && j < H && img.data[(j * W + i) * 4 + 3] > 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      if (a(i, j)) continue;
      if (a(i - 1, j) || a(i + 1, j) || a(i, j - 1) || a(i, j + 1)) px(o, i, j, col);
    }
  return out;
}
