/**
 * Reduction of high-resolution source art to logical pixels. Pure (RGBA byte arrays in and out),
 * so every browser bakes the same pixels and the tests can check it.
 *
 * The generated sheets are drawn as "pixel art" whose art pixels are ~3.5 (room) to ~12 (sprites)
 * source pixels, never an exact multiple of the logical pixel. Three reductions:
 *
 * 'mode'    (default) the dominant colour of the source area each logical pixel covers: crisp,
 *           palette-true and robust to the noise between art pixels.
 * 'box'     the alpha-weighted average of that area: colour-accurate but softer.
 * 'nearest' the source pixel at the centre of that area: crisp but noisy.
 *
 * With an alpha cut, coverage >= cut becomes fully opaque and the rest fully transparent, so
 * sprites keep hard pixel edges instead of a soft fringe.
 */
export type SampleMode = 'mode' | 'box' | 'nearest';

export const SAMPLE_MODES: readonly SampleMode[] = ['mode', 'box', 'nearest'];

export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ResampleOptions {
  mode?: SampleMode;
  /** coverage threshold 0..1 for hard edges; null keeps soft alpha */
  alphaCut?: number | null;
  /** opacity multiplier 0..1 applied to the result */
  opacity?: number;
}

/** source index range [start, end) covered by destination index d (at least one pixel) */
function range(d: number, src: number, dst: number): [number, number] {
  const s = src / dst;
  let a = Math.round(d * s);
  let b = Math.round((d + 1) * s);
  if (b <= a) {
    a = Math.min(src - 1, Math.floor((d + 0.5) * s));
    b = a + 1;
  }
  return [Math.max(0, a), Math.min(src, b)];
}

const BINS = 4096;

/** reduce (or enlarge) `src` to `w` x `h` */
export function resample(src: Pixels, w: number, h: number, o: ResampleOptions = {}): Pixels {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  const mode = o.mode ?? 'mode';
  const cut = o.alphaCut ?? null;
  const opacity = Math.max(0, Math.min(1, o.opacity ?? 1));
  const { data: s, width: sw, height: sh } = src;
  const out = new Uint8ClampedArray(W * H * 4);

  const xr = Array.from({ length: W }, (_, x) => range(x, sw, W));
  const yr = Array.from({ length: H }, (_, y) => range(y, sh, H));

  // scratch for the dominant-colour histogram (only touched bins are reset)
  const count = new Uint32Array(BINS);
  const sumR = new Float64Array(BINS);
  const sumG = new Float64Array(BINS);
  const sumB = new Float64Array(BINS);
  const touched: number[] = [];

  for (let y = 0; y < H; y++) {
    const [y0, y1] = yr[y];
    for (let x = 0; x < W; x++) {
      const [x0, x1] = xr[x];
      const i = (y * W + x) * 4;
      const n = (x1 - x0) * (y1 - y0);
      let alpha = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) alpha += s[(sy * sw + sx) * 4 + 3];
      const coverage = alpha / (255 * n);
      if (coverage <= 0 || (cut !== null && coverage < cut)) continue;

      let r = 0;
      let g = 0;
      let b = 0;
      if (mode === 'nearest') {
        const j = (Math.min(y1 - 1, (y0 + y1) >> 1) * sw + Math.min(x1 - 1, (x0 + x1) >> 1)) * 4;
        if (s[j + 3] > 0) {
          r = s[j];
          g = s[j + 1];
          b = s[j + 2];
        } else {
          // centre pixel transparent but the area is covered: fall back to the area's average
          [r, g, b] = average(s, sw, x0, x1, y0, y1);
        }
      } else if (mode === 'box') {
        [r, g, b] = average(s, sw, x0, x1, y0, y1);
      } else {
        // dominant colour among the (mostly) opaque pixels, 4 bits per channel
        const minA = coverage >= 0.5 ? 128 : 1;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            const j = (sy * sw + sx) * 4;
            if (s[j + 3] < minA) continue;
            const key = ((s[j] >> 4) << 8) | ((s[j + 1] >> 4) << 4) | (s[j + 2] >> 4);
            if (count[key] === 0) touched.push(key);
            count[key]++;
            sumR[key] += s[j];
            sumG[key] += s[j + 1];
            sumB[key] += s[j + 2];
          }
        }
        let best = -1;
        for (const k of touched) if (best < 0 || count[k] > count[best]) best = k;
        if (best >= 0) {
          r = sumR[best] / count[best];
          g = sumG[best] / count[best];
          b = sumB[best] / count[best];
        }
        for (const k of touched) {
          count[k] = 0;
          sumR[k] = 0;
          sumG[k] = 0;
          sumB[k] = 0;
        }
        touched.length = 0;
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = (cut !== null ? 255 : coverage * 255) * opacity;
    }
  }
  return { data: out, width: W, height: H };
}

function average(s: Uint8ClampedArray, sw: number, x0: number, x1: number, y0: number, y1: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let sy = y0; sy < y1; sy++) {
    for (let sx = x0; sx < x1; sx++) {
      const j = (sy * sw + sx) * 4;
      const w = s[j + 3];
      r += s[j] * w;
      g += s[j + 1] * w;
      b += s[j + 2] * w;
      a += w;
    }
  }
  return a > 0 ? [r / a, g / a, b / a] : [0, 0, 0];
}

/** average colour of the outermost `band` pixels of an image (for the page colour around it) */
export function borderColour(p: Pixels, band = 2): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (x >= band && y >= band && x < p.width - band && y < p.height - band) continue;
      const j = (y * p.width + x) * 4;
      if (p.data[j + 3] === 0) continue;
      r += p.data[j];
      g += p.data[j + 1];
      b += p.data[j + 2];
      n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
