/**
 * Procedural stand-ins, at the scale of the delivered art (assets/pixel/room/v1):
 * - pieces the first art batch does not include yet: the standing stranger (builder level 4),
 *   the walking stranger (arrival) and the pelts (fur in store);
 * - minimal fallbacks used only when a delivered PNG fails to load, so the room stays playable.
 * Nothing here is traced from the concept image.
 */
import { DOORWAY, FIREBOX, WINDOW_PANES, WALL_BASE, FLOOR_FRONT, TOP_BAND } from './layout';
import { ctx2d, ellipse, hash, line, makeCanvas, outline, px, rect, rim, type Ctx } from './paint';
import { mix, PAL } from './palette';
import type { Sprite } from './sprites';

function sprite(w: number, h: number, paint: (g: Ctx) => void): Sprite {
  const canvas = makeCanvas(w, h);
  paint(ctx2d(canvas));
  return { canvas, w, h };
}

// ---------------------------------------------------------------- the stranger, upright

export const FIGURE_W = 34;
export const FIGURE_H = 84;

/** leg / boot x ranges for [back, front] per walk frame; index 4 = standing still */
const STRIDE: Array<[[number, number], [number, number], number]> = [
  // back boot x0..x1, front boot x0..x1, lift of the passing boot
  [[6, 13], [19, 27], 0],
  [[11, 18], [16, 24], 1],
  [[6, 13], [19, 27], 0],
  [[11, 18], [16, 24], 1],
  [[10, 17], [17, 25], 0]
];

/**
 * the stranger on their feet, facing right: hooded cloak to the shins, boots.
 * `walking`: hunched, four-frame stride with a one-pixel bob; otherwise slow breathing.
 */
export function uprightFigure(frame: number, walking: boolean): Sprite {
  return sprite(FIGURE_W, FIGURE_H, (g) => {
    const f = frame % 4;
    const bob = walking ? f % 2 : f === 1 || f === 2 ? 1 : 0;
    const lean = walking ? 2 : 0;
    const ground = FIGURE_H - 1;
    const [back, front, lift] = STRIDE[walking ? f : 4];

    // legs, then boots
    const hem = 74;
    for (const [i, [x0, x1]] of [back, front].entries()) {
      const near = walking ? (f < 2 ? i === 1 : i === 0) : i === 1;
      const up = i === 1 ? lift : 0;
      rect(g, x0 + 2, hem, 4, ground - 4 - hem - up, near ? PAL.cloakDark : PAL.hoodShadow);
      rect(g, x0, ground - 4 - up, x1 - x0, 5, near ? PAL.boot : mix(PAL.boot, PAL.hoodShadow, 0.35));
      rect(g, x0 + 1, ground - 4 - up, x1 - x0 - 2, 1, PAL.bootLight);
    }

    // cloak: shoulders widening to a ragged hem
    const top = 22 - bob;
    const bottom = hem + 1;
    for (let y = top; y <= bottom; y++) {
      const t = (y - top) / (bottom - top);
      const round = y - top < 3 ? 3 - (y - top) : 0;
      const half = 8 + t * 5 - round;
      const cx = 16 + lean * (1 - t) - t;
      const x0 = Math.round(cx - half);
      const x1 = Math.round(cx + half);
      rect(g, x0, y, x1 - x0, 1, PAL.cloak);
      rect(g, x0, y, Math.round((x1 - x0) * 0.35), 1, PAL.cloakDark);
      rect(g, x1 - 2, y, 2, 1, PAL.cloakMid);
      if (y >= top + 12 && y < bottom - 1) {
        px(g, Math.round(cx - 3 + Math.sin(y * 0.4)), y, PAL.cloakDark);
        px(g, Math.round(cx + 2 + Math.sin(y * 0.3 + 1)), y, PAL.cloakDark);
      }
    }
    for (let x = 4; x < FIGURE_W - 4; x++) {
      const k = hash(x, 7, walking ? f : 0);
      if (k < 0.35) px(g, x, bottom + 1, PAL.cloakDark);
      if (k < 0.12) px(g, x, bottom + 2, PAL.cloakDark);
    }
    // the arm under the cloak
    line(g, 20 + lean, top + 5, 22, top + 27, PAL.cloakDark);
    line(g, 21 + lean, top + 5, 23, top + 26, PAL.cloakLight);

    // hood with a dark face opening towards the fire
    const hx = 17 + lean;
    const hy = 13 - bob + (walking ? 1 : 0);
    ellipse(g, hx - 5, hy - 5, 2.5, 2.5, PAL.cloak);
    ellipse(g, hx, hy, 7.5, 9, PAL.cloak);
    ellipse(g, hx - 2.5, hy + 1, 4, 7, PAL.cloakDark);
    ellipse(g, hx + 3.5, hy + 2, 3, 5.5, PAL.hoodShadow);
    line(g, hx + 6, hy - 3, hx + 7, hy + 6, PAL.cloakWarm);
    px(g, hx + 3, hy + 4, PAL.cloakMid);

    rim(g, FIGURE_W, FIGURE_H, walking ? PAL.cloakLight : PAL.cloakWarm, 'right', 0, hem);
    outline(g, 0, 0, FIGURE_W, FIGURE_H, PAL.figureLine);
  });
}

// ---------------------------------------------------------------- pelts

export function furpile(): Sprite {
  const w = 40;
  const h = 17;
  return sprite(w, h, (g) => {
    ellipse(g, 20, 12.5, 18, 4, mix(PAL.fur, PAL.hoodShadow, 0.45));
    const humps: Array<[number, number, number, number, string]> = [
      [12, 10, 9, 5, mix(PAL.fur, PAL.cloakDark, 0.3)],
      [30, 11.5, 8, 4, mix(PAL.fur, PAL.boot, 0.4)],
      [22, 9, 10, 5.5, PAL.fur]
    ];
    for (const [cx, cy, rx, ry, col] of humps) {
      ellipse(g, cx, cy, rx, ry, col);
      for (let x = Math.round(cx - rx + 2); x < cx + rx - 2; x++) {
        const y = Math.round(cy - ry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2)));
        px(g, x, y, PAL.furLight);
        if (hash(x, cx, 3) < 0.3) px(g, x, y - 1, PAL.furLight);
      }
    }
    for (let y = 11; y < 16; y++) px(g, 3 + (y % 2), y, mix(PAL.fur, PAL.hoodShadow, 0.3));
    outline(g, 0, 0, w, h, PAL.figureLine);
  });
}

// ---------------------------------------------------------------- fallbacks (art failed to load)

function stones(g: Ctx, x0: number, y0: number, w: number, h: number, seed: number): void {
  rect(g, x0, y0, w, h, PAL.mortar);
  for (let r = 0, y = y0; y < y0 + h; r++, y += 9) {
    for (let x = x0 - (r % 2) * 7, i = 0; x < x0 + w; i++) {
      const sw = 12 + Math.floor(hash(r, i, seed) * 8);
      const sx = Math.max(x, x0);
      const ex = Math.min(x + sw - 1, x0 + w);
      const ey = Math.min(y + 8, y0 + h);
      if (ex > sx && ey > y) {
        rect(g, sx, y, ex - sx, ey - y, hash(r, i, seed + 1) < 0.4 ? PAL.stoneDark : PAL.stone);
        rect(g, sx, y, ex - sx, 1, PAL.stoneLight);
      }
      x += sw;
    }
  }
}

export function fallbackRoom(): Sprite {
  return sprite(480, 270, (g) => {
    rect(g, 0, 0, 480, 270, PAL.base);
    rect(g, 3, TOP_BAND, 474, WALL_BASE - TOP_BAND, PAL.woodDark);
    for (let x = 3; x < 477; x += 11) rect(g, x, 57, 1, WALL_BASE - 57, PAL.outline);
    for (const [y, h] of [[23, 17], [57, 13]]) {
      rect(g, 3, y, 474, h, PAL.woodMid);
      rect(g, 3, y, 474, 1, PAL.woodLight);
    }
    for (const [x, w] of [[3, 19], [123, 21], [293, 16], [458, 19]]) {
      rect(g, x, TOP_BAND, w, WALL_BASE - TOP_BAND, PAL.wood);
      rect(g, x, TOP_BAND, 1, WALL_BASE - TOP_BAND, PAL.woodLight);
    }
    rect(g, 3, WALL_BASE, 474, FLOOR_FRONT - WALL_BASE, PAL.floor);
    for (let y = WALL_BASE + 6; y < FLOOR_FRONT; y += 7) rect(g, 3, y, 474, 1, PAL.floorDark);
    rect(g, DOORWAY.x - 4, DOORWAY.y - 6, DOORWAY.w + 8, DOORWAY.h + 6, PAL.woodMid);
    rect(g, DOORWAY.x, DOORWAY.y, DOORWAY.w, DOORWAY.h, PAL.soot);
    rect(g, 208, 76, 64, 50, PAL.woodMid);
    for (const p of WINDOW_PANES) rect(g, p.x, p.y, p.w, p.h, PAL.coldGrey);
  });
}

/** hearth top-left in the scene, so the fallback firebox matches FIREBOX */
const HEARTH_TL = { x: 299, y: 69 };

export function fallbackHearth(): Sprite {
  const w = 133;
  const h = 142;
  return sprite(w, h, (g) => {
    stones(g, 38, 0, 57, 54, 1);
    stones(g, 7, 62, 119, 68, 2);
    rect(g, 4, 51, 125, 11, PAL.stone);
    rect(g, 4, 51, 125, 1, PAL.stoneLight);
    const fb = { x: FIREBOX.x - HEARTH_TL.x, y: FIREBOX.y - HEARTH_TL.y };
    rect(g, fb.x, fb.y, FIREBOX.w, FIREBOX.h, PAL.soot);
    for (let k = 0; k < 9; k++) ellipse(g, fb.x + 6 + k * 5, fb.y + FIREBOX.h - 3, 3, 2, PAL.charcoal);
    stones(g, 0, 129, w, 13, 3);
    outline(g, 0, 0, w, h, PAL.outline);
  });
}

export function fallbackDoor(): Sprite {
  const w = 63;
  const h = 112;
  return sprite(w, h, (g) => {
    for (let x = 1, i = 0; x < w - 1; x += 12, i++) {
      rect(g, x, 1, Math.min(12, w - 1 - x), h - 2, i % 2 ? PAL.woodMid : PAL.woodDark);
      rect(g, x, 1, 1, h - 2, PAL.outline);
    }
    for (const y of [14, 92]) rect(g, 2, y, 34, 5, PAL.iron);
    rect(g, 46, 54, 12, 4, PAL.iron);
    outline(g, 0, 0, w, h, PAL.outline);
  });
}

/** flames of a fire level (1 = embers) */
export function fallbackFire(level: number, frame: number): Sprite {
  if (level <= 1) {
    return sprite(20, 4, (g) => {
      for (let x = 0; x < 20; x++)
        for (let y = 0; y < 4; y++) {
          const v = 1 - Math.abs(x + 0.5 - 10) / 10 - (3 - y) / 5 + (hash(x, y, frame) - 0.5) * 0.5;
          if (v > 0.1) px(g, x, y, v > 0.5 ? PAL.flame : PAL.ember);
        }
    });
  }
  const k = [0, 0, 0.55, 0.8, 1][level];
  const w = Math.round(32 * k);
  const h = Math.round(42 * k);
  return sprite(w, h, (g) => {
    const phase = (frame / 4) * Math.PI * 2;
    for (let y = 0; y < h; y++) {
      const up = (h - 1 - y) / h;
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2);
        const sway = Math.sin(up * 5 - phase) * 0.15 * up;
        const v = 1 - Math.abs(dx - sway) / (1 - up * 0.85) - up * 0.35 + (hash(x, y, frame) - 0.5) * 0.15;
        if (v <= 0.05) continue;
        px(g, x, y, v > 0.6 ? PAL.flameCore : v > 0.3 ? PAL.flame : PAL.ember);
      }
    }
  });
}

export function fallbackHuddled(frame: number): Sprite {
  return sprite(50, 44, (g) => {
    const s = [0, 1, 0, -1][frame % 4];
    ellipse(g, 24, 33, 20, 10, PAL.cloak);
    ellipse(g, 26 + s, 22, 13, 13, PAL.cloakDark);
    ellipse(g, 30 + s, 12, 8, 9, PAL.cloak);
    ellipse(g, 33 + s, 14, 3, 5, PAL.hoodShadow);
    rect(g, 36, 38, 9, 5, PAL.boot);
    outline(g, 0, 0, 50, 44, PAL.figureLine);
  });
}

export function fallbackWoodpile(step: number): Sprite {
  const sizes: Array<[number, number, number[]]> = [
    [29, 18, [3, 2]],
    [38, 29, [4, 3, 2]],
    [48, 32, [5, 4, 3, 2]]
  ];
  const [w, h, rows] = sizes[Math.max(0, Math.min(2, step))];
  return sprite(w, h, (g) => {
    rows.forEach((n, row) => {
      for (let i = 0; i < n; i++) {
        const cx = w / 2 + (i - (n - 1) / 2) * 9;
        const cy = h - 5 - row * 7;
        ellipse(g, cx, cy, 4.5, 4.5, PAL.logEnd);
        ellipse(g, cx, cy, 2.5, 2.5, PAL.logRing);
      }
    });
    outline(g, 0, 0, w, h, PAL.outline);
  });
}

/** the night seen through the open doorway (only visible while the door is open) */
export function doorwayNight(): Sprite {
  const { w, h } = DOORWAY;
  return sprite(w, h, (g) => {
    for (let y = 0; y < h; y++) rect(g, 0, y, w, 1, mix(PAL.nightDeep, PAL.night, y / h));
    const ground = h - 16;
    for (let k = 0; k < 14; k++) px(g, Math.floor(hash(k, 1) * w), Math.floor(hash(k, 2) * (ground - 8)), hash(k, 3) < 0.4 ? PAL.snow : PAL.frost);
    for (let y = ground; y < h; y++) rect(g, 0, y, w, 1, mix(PAL.snowShade, PAL.night, (y - ground) / 24));
    rect(g, 0, ground, w, 1, mix(PAL.snowShade, PAL.snow, 0.5));
    for (const [tx, th] of [[9, 22], [30, 16], [47, 26]]) {
      for (let j = 0; j < th; j++) {
        const half = Math.floor((j / th) * 5) + (j % 3 === 2 ? 1 : 0);
        rect(g, tx - half, ground - th + j, half * 2 + 1, 1, PAL.nightDeep);
      }
    }
  });
}
