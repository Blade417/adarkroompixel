/**
 * Canvas 2D compositor of the 480x270 room. Draws into a logical-size scene, then blits it to the
 * display canvas at an integer scale with nearest-neighbour sampling.
 *
 * Order: base -> room-back -> window snow and frost (clipped to the panes) -> [open door: the
 * night behind it, snow] -> door -> hearth -> woodpile -> prop shadows -> furpile -> workshop props -> stranger -> light map
 * (multiply) -> temperature tint (multiply) -> draft (cold light) -> warm glow (screen) -> fire
 * (emissive) -> sparks -> interaction glints -> debug anchors.
 * The flame sits above the light so it is never dimmed by the darkness it lights.
 */
import type { ArrivalFigure, ArrivalPose } from './arrival';
import type { SceneArt } from './assets';
import type { PixelBuildable } from '../app/building';
import { WORKSHOP_ANCHORS, WORKSHOP_MANIFEST, WORKSHOP_TARGETS } from './workshop';
import type { Fit } from './fit';
import {
  ANCHOR,
  DOORWAY,
  FIREBOX,
  HEARTH_TARGET,
  FLOOR_FRONT,
  inRect,
  LIGHT_CENTRE,
  TOP_BAND,
  VIEW_H,
  VIEW_W,
  WALL_BASE,
  WINDOW_GLASS,
  WINDOW_PANES,
  type Point,
  type Rect
} from './layout';
import { flickerVariant, lightLayers, tintLayer } from './lighting';
import type { RoomView } from './mapping';
import { bayer, ctx2d, ellipse, hash, makeCanvas, type Ctx } from './paint';
import { PAL } from './palette';
import { snow, sparks, type Particle } from './particles';
import { drawGround, groundRect, loopFrame, type Strip } from './sprites';

export interface FrameInput {
  view: RoomView;
  timeMs: number;
  reduceMotion: boolean;
  arrival: ArrivalPose | null;
  hoverHearth: boolean;
  hoverDoor?: boolean;
  hoverWorkshop?: PixelBuildable | null;
  debugAnchors: boolean;
}

const inPane = (p: Particle): boolean => WINDOW_PANES.some((r) => inRect(r, p.x, p.y));
const inDoorway = (p: Particle): boolean => inRect(DOORWAY, p.x, p.y);

export class Renderer {
  private readonly scene = makeCanvas(VIEW_W, VIEW_H);
  private readonly sg = ctx2d(this.scene);
  private readonly dg: CanvasRenderingContext2D;
  private fit: Fit | null = null;
  private readonly frosts = new Map<number, HTMLCanvasElement>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private art: SceneArt
  ) {
    const dg = canvas.getContext('2d', { alpha: false });
    if (!dg) throw new Error('2D canvas unavailable');
    this.dg = dg;
  }

  get sceneArt(): SceneArt {
    return this.art;
  }

  setArt(art: SceneArt): void {
    this.art = art;
  }

  resize(fit: Fit): void {
    this.fit = fit;
    if (this.canvas.width !== fit.backingW) this.canvas.width = fit.backingW;
    if (this.canvas.height !== fit.backingH) this.canvas.height = fit.backingH;
    this.canvas.style.width = `${fit.cssW}px`;
    this.canvas.style.height = `${fit.cssH}px`;
    this.dg.imageSmoothingEnabled = false;
  }

  /** the hearth's bounding box (logical px) */
  hearthRect(): Rect {
    return groundRect(this.art.hearth, ANCHOR.hearth);
  }

  /** Include the empty furnace opening, where a player naturally clicks. */
  hitHearth(x: number, y: number): boolean {
    return inRect(HEARTH_TARGET, x, y);
  }

  render(inp: FrameInput): void {
    const { view: v, arrival: pose } = inp;
    const art = this.art;
    const t = inp.timeMs / 1000;
    const motion = !inp.reduceMotion;
    const g = this.sg;

    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = art.base;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.drawImage(art.room.canvas, 0, 0);

    // the night through the glass
    if (motion) this.particles(g, snow(WINDOW_GLASS, t, 12, 1).filter(inPane));
    if (v.frost > 0) g.drawImage(this.frost(v.frost), WINDOW_GLASS.x, WINDOW_GLASS.y);

    const door = pose ? pose.door : 0;
    if (door > 0) {
      g.drawImage(art.doorway.canvas, DOORWAY.x, DOORWAY.y);
      if (motion) this.particles(g, snow(DOORWAY, t, 16, 2).filter(inDoorway));
    }
    drawGround(g, art.door[door], ANCHOR.door);
    drawGround(g, art.hearth, ANCHOR.hearth);
    if (v.woodpile !== null) drawGround(g, art.woodpile[v.woodpile], ANCHOR.woodpile);
    // Floor shadows share the room's light pass and sit behind every foreground prop.
    if (v.cart && art.workshop.cart) this.workshopShadow(g, 'cart');
    if (v.traps > 0 && art.workshop.trap) this.workshopShadow(g, 'trap');
    if (v.furpile) drawGround(g, art.furpile, ANCHOR.furpile);
    if (v.cart && art.workshop.cart) drawGround(g, art.workshop.cart, WORKSHOP_ANCHORS.cart);
    if (v.traps > 0 && art.workshop.trap) drawGround(g, art.workshop.trap, WORKSHOP_ANCHORS.trap);
    if (pose) {
      if (pose.stranger) this.figure(g, pose.stranger, t, motion);
    } else if (v.stranger) {
      const s = art.stranger[v.stranger.pose];
      const spot = v.stranger.spot === 'hearth' ? ANCHOR.strangerHearth : ANCHOR.strangerCorner;
      this.strip(g, s, s.fps * v.stranger.rate, t, motion, spot);
    }

    // light and cold over everything drawn so far (the room is opaque, so multiply is safe)
    const light = lightLayers(v.fire, flickerVariant(inp.timeMs, inp.reduceMotion));
    g.globalCompositeOperation = 'multiply';
    g.drawImage(light.map, 0, 0);
    const tint = tintLayer(v.temperature);
    if (tint) g.drawImage(tint, 0, 0);
    g.globalCompositeOperation = 'source-over';
    if (pose && pose.draft > 0) this.draft(g, pose.draft);
    if (light.glow) {
      g.globalCompositeOperation = 'screen';
      g.drawImage(light.glow, 0, 0);
      g.globalCompositeOperation = 'source-over';
    }

    const flames = art.fire[v.fire] ?? [];
    if (flames.length > 0) {
      const i = motion ? loopFrame(t, art.fireFps, flames.length) : 0;
      drawGround(g, flames[i], ANCHOR.fire);
    }
    if (motion) this.particles(g, sparks(v.fire, t));
    if (inp.hoverHearth) {
      // Four warm pixel glints inside the arch, rather than outlining the whole chimney.
      const r = FIREBOX;
      g.fillStyle = PAL.flameCore;
      g.globalAlpha = 0.65;
      for (const x of [r.x + 1, r.x + r.w - 5]) {
        g.fillRect(x, r.y + 7, 4, 1);
        g.fillRect(x, r.y + r.h - 1, 4, 1);
      }
      g.globalAlpha = 1;
    }
    if (inp.hoverDoor) {
      g.fillStyle = '#cfb38a';
      for (const x of [DOORWAY.x + 2, DOORWAY.x + DOORWAY.w - 5]) g.fillRect(x, DOORWAY.y + DOORWAY.h - 2, 3, 1);
    }
    if (inp.hoverWorkshop) {
      const r = WORKSHOP_TARGETS[inp.hoverWorkshop];
      g.fillStyle = '#cfb38a';
      for (const x of [r.x + 2, r.x + r.w - 5]) g.fillRect(x, r.y + r.h - 3, 3, 1);
    }
    if (inp.debugAnchors) this.anchors(g);

    this.blit();
  }

  /** the current logical frame (for tests and screenshots) */
  get sceneCanvas(): HTMLCanvasElement {
    return this.scene;
  }

  private blit(): void {
    const fit = this.fit;
    if (!fit) return;
    this.dg.imageSmoothingEnabled = false;
    this.dg.drawImage(this.scene, fit.crop.x, fit.crop.y, fit.crop.w, fit.crop.h, 0, 0, fit.backingW, fit.backingH);
  }

  private strip(g: Ctx, s: Strip, fps: number, t: number, motion: boolean, at: Point): void {
    if (s.frames.length === 0) return;
    const i = motion ? loopFrame(t, fps, s.frames.length) : 0;
    drawGround(g, s.frames[i], at);
  }

  private figure(g: Ctx, f: ArrivalFigure, t: number, motion: boolean): void {
    const s = this.art.stranger[f.pose];
    const at = { x: f.x, y: f.y };
    if (f.frame !== null && s.frames.length > 0) drawGround(g, s.frames[f.frame % s.frames.length], at);
    else this.strip(g, s, s.fps, t, motion, at);
  }

  private particles(g: Ctx, list: Particle[]): void {
    for (const p of list) {
      g.globalAlpha = p.alpha;
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.globalAlpha = 1;
  }

  private workshopShadow(g: Ctx, id: PixelBuildable): void {
    const at = WORKSHOP_ANCHORS[id];
    for (const [dx, dy, rx, ry, opacity] of WORKSHOP_MANIFEST.assets[id].shadows) {
      g.globalAlpha = opacity;
      ellipse(g, at.x + dx, at.y + dy, rx, ry, '#090c0c');
    }
    g.globalAlpha = 1;
  }

  /** cold light through the open door: the doorway, then a pixel-edged wedge across the floor */
  private draft(g: Ctx, k: number): void {
    const d = DOORWAY;
    const end = FLOOR_FRONT - 8;
    g.globalAlpha = 0.2 * k;
    g.fillStyle = PAL.coldLight;
    for (let y = d.y; y < end; y++) {
      const spread = y < WALL_BASE ? 0 : (y - WALL_BASE) / (end - WALL_BASE);
      const x0 = Math.round(d.x - 6 * spread);
      const x1 = Math.round(d.x + d.w + 44 * spread);
      g.fillRect(x0, y, x1 - x0, 1);
    }
    g.globalAlpha = 1;
  }

  /** frost creeping in from the corners (light) or from every edge (heavy) of each pane */
  private frost(level: number): HTMLCanvasElement {
    const hit = this.frosts.get(level);
    if (hit) return hit;
    const G = WINDOW_GLASS;
    const c = makeCanvas(G.w, G.h);
    const g = ctx2d(c);
    g.fillStyle = PAL.frost;
    for (const p of WINDOW_PANES) {
      for (let y = 0; y < p.h; y++) {
        for (let x = 0; x < p.w; x++) {
          const edge = Math.min(x, y, p.w - 1 - x, p.h - 1 - y);
          const corner = Math.min(x + y, p.w - 1 - x + y, x + p.h - 1 - y, p.w - 1 - x + p.h - 1 - y);
          const reach = level >= 2 ? edge : corner - 3;
          const keep = reach < 2 ? 0.95 : reach < 5 ? 0.5 : reach < 8 ? 0.18 : 0;
          const gx = p.x - G.x + x;
          const gy = p.y - G.y + y;
          if (keep > 0 && (bayer(gx, gy) + hash(gx, gy, 90) * 0.5) / 1.5 < keep) {
            g.globalAlpha = 0.45 + hash(gx, gy, 91) * 0.35;
            g.fillRect(gx, gy, 1, 1);
          }
        }
      }
    }
    this.frosts.set(level, c);
    return c;
  }

  private anchors(g: Ctx): void {
    const art = this.art;
    const box = (r: Rect, col: string): void => {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    };
    const cross = (p: Point, col: string): void => {
      g.fillStyle = col;
      g.fillRect(p.x - 3, p.y, 7, 1);
      g.fillRect(p.x, p.y - 3, 1, 7);
    };
    const tick = (y: number, col: string): void => {
      g.fillStyle = col;
      g.fillRect(0, y, 6, 1);
      g.fillRect(VIEW_W - 6, y, 6, 1);
    };
    box(groundRect(art.door[0], ANCHOR.door), '#ff4fd8');
    box(DOORWAY, '#4fd8ff');
    for (const p of WINDOW_PANES) box(p, '#4fd8ff');
    box(this.hearthRect(), '#ffd84f');
    box(FIREBOX, '#ff8a4f');
    box(groundRect(art.woodpile[2], ANCHOR.woodpile), '#4fff8a');
    box(groundRect(art.furpile, ANCHOR.furpile), '#4fff8a');
    box(groundRect(art.stranger.huddled.frames[0], ANCHOR.strangerCorner), '#c58aff');
    for (const p of [ANCHOR.door, ANCHOR.hearth, ANCHOR.woodpile, ANCHOR.furpile]) cross(p, '#4fff8a');
    cross(ANCHOR.fire, '#ff8a4f');
    cross(LIGHT_CENTRE, '#fff04f');
    for (const p of [ANCHOR.strangerCorner, ANCHOR.strangerHearth, ANCHOR.strangerDoor]) cross(p, '#c58aff');
    tick(TOP_BAND, '#ff4fd8');
    tick(WALL_BASE, '#ff4fd8');
    tick(FLOOR_FRONT, '#ff4fd8');
  }
}
