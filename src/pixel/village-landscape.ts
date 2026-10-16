import { FOREST_EXIT, HEARTH_PLOT, HUT_PLOTS, HUT_SIZE, PUBLIC_FACILITIES, VILLAGE_SIZE } from '../app/village';
import manifest from '../../assets/pixel/village/v2/manifest.json';

export interface Bounds { x: number; y: number; w: number; h: number }
export interface Tree extends Bounds { id: number; variant: 0 | 1 | 2 | 3; flip: boolean }
export type Point = readonly [number, number];
export interface Landscape { yards: Bounds[]; publicYards: Bounds[]; paths: Point[][]; trees: Tree[] }
export const overlaps = (a: Bounds, b: Bounds): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const grow = (b: Bounds, n: number): Bounds => ({ x: b.x - n, y: b.y - n, w: b.w + n * 2, h: b.h + n * 2 });
export const ROOFS: Bounds[] = [HEARTH_PLOT, ...HUT_PLOTS.map(([x, y]) => ({ x, y, ...HUT_SIZE })), ...PUBLIC_FACILITIES]
  .map(p => ({ x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h }));
const YARDS = ROOFS.map(b => ({ x: b.x - 8, y: b.y - 7, w: b.w + 16, h: b.h + 18 }));
const noise = (n: number): number => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); return (n ^ n >>> 13) >>> 0; };

// Independent of the game's RNG: expanding or reloading never reshuffles the forest.
const TREES: Tree[] = [];
for (let row = 0; row < 22; row++) for (let col = 0; col < 31; col++) {
  const id = row * 31 + col, a = noise(id + 1), b = noise(a), variant = a % 4 as Tree['variant'];
  const [w, h] = manifest.assets[`tree${variant}`].drawSize;
  const tree = { id, variant, flip: !!(b & 1), x: col * 21 - 29 + a % 13, y: row * 19 - 22 + b % 13 - h, w, h };
  if (overlaps(tree, { x: 0, y: 0, ...VILLAGE_SIZE })) TREES.push(tree);
}

// Plan roads once around ALL roof footprints, including future plots. Existing roads therefore
// stay put as the next ring is built. The 3 px grid also keeps route search off the animation loop.
const STEP = 3, COLS = VILLAGE_SIZE.w / STEP, ROWS = VILLAGE_SIZE.h / STEP, ROOT = 64 * COLS + 96;
const blocked = new Uint8Array(COLS * ROWS), parent = new Int32Array(COLS * ROWS).fill(-1);
for (let i = 0; i < blocked.length; i++) {
  const x = i % COLS * STEP, y = Math.floor(i / COLS) * STEP;
  blocked[i] = Number(ROOFS.some(b => overlaps(grow(b, 1), { x: x - 1, y: y - 1, w: 3, h: 3 })));
}
const queue = [ROOT]; parent[ROOT] = ROOT;
const directions = [[0, 1], [-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [-1, -1], [1, -1]];
for (let head = 0; head < queue.length; head++) {
  const i = queue[head], x = i % COLS, y = Math.floor(i / COLS);
  for (const [dx, dy] of directions) {
    const nx = x + dx, ny = y + dy, next = ny * COLS + nx;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || blocked[next] || parent[next] !== -1) continue;
    if (dx && dy && (blocked[y * COLS + nx] || blocked[ny * COLS + x])) continue;
    parent[next] = i; queue.push(next);
  }
}
function route(x: number, y: number): Point[] {
  let i = Math.round(y / STEP) * COLS + Math.round(x / STEP);
  if (parent[i] === -1) throw Error(`Unreachable village door: ${x},${y}`);
  const points: Point[] = [];
  while (i !== ROOT) { points.push([i % COLS * STEP, Math.floor(i / COLS) * STEP]); i = parent[i]; }
  points.push([288, 192]); return points.reverse();
}
const EXIT = route(FOREST_EXIT.x, FOREST_EXIT.y);
const PUBLIC_ROADS = PUBLIC_FACILITIES.map(f => route(f.x, f.y + 4));
const ROADS = HUT_PLOTS.map(([x, y]) => route(x, y + 4));
export function roadBounds([x, y]: Point): Bounds { return { x: x - 3, y: y - 3, w: 7, h: 7 }; }
const cache = new Map<number, Landscape>();

/** Whole canopy rectangles, not trunk points, must clear roofs, yards and walkable roads. */
export function villageLandscape(cleared: number): Landscape {
  const count = Math.max(0, Math.min(20, Math.floor(cleared)));
  const cached = cache.get(count); if (cached) return cached;
  const yards = YARDS.slice(0, count + 1), publicYards = YARDS.slice(21);
  const paths = [EXIT, ...PUBLIC_ROADS, ...ROADS.slice(0, count)];
  const clear = [...yards, ...publicYards, ...paths.flatMap(p => p.map(roadBounds))];
  const trees = TREES.filter(tree => !clear.some(b => overlaps(grow(tree, 2), b))).sort((a, b) => a.y + a.h - b.y - b.h);
  const landscape = { yards, publicYards, paths, trees }; cache.set(count, landscape); return landscape;
}
