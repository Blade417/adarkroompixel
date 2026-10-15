/**
 * Everything the renderer draws, assembled once at boot:
 * delivered art (baked from assets/pixel/room/v1) where it exists, frames derived from it where
 * the batch is incomplete, procedural stand-ins for the rest, and per-piece fallbacks when a PNG
 * fails to load. `sources` records which is which (shown in the ?debug panel).
 */
import { bakeArtPack } from './artpack';
import { ctx2d, makeCanvas, silhouetteOutline } from './paint';
import { hex, PAL } from './palette';
import type { SampleMode } from './resample';
import type { Source, Sprite, Strip } from './sprites';
import {
  doorwayNight,
  fallbackDoor,
  fallbackFire,
  fallbackHearth,
  fallbackHuddled,
  fallbackRoom,
  fallbackWoodpile,
  furpile,
  uprightFigure
} from './standins';

export type PieceId =
  | 'room'
  | 'door'
  | 'door-open'
  | 'hearth'
  | 'fire'
  | 'stranger-huddled'
  | 'stranger-resting'
  | 'stranger-standing'
  | 'stranger-walking'
  | 'woodpile'
  | 'furpile';

export type StrangerArt = 'huddled' | 'resting' | 'standing' | 'walking';

export interface SceneArt {
  room: Sprite;
  /** 0 closed, 1 ajar, 2 open */
  door: [Sprite, Sprite, Sprite];
  /** the night behind the open door */
  doorway: Sprite;
  hearth: Sprite;
  /** hover highlight, 1 px larger than the hearth on every side */
  hearthOutline: Sprite;
  /** frames by fire level; [0] (dead) is empty */
  fire: Sprite[][];
  fireFps: number;
  stranger: Record<StrangerArt, Strip>;
  /** low, medium, high */
  woodpile: [Sprite, Sprite, Sprite];
  furpile: Sprite;
  /** page colour that continues the frame's own border */
  base: string;
  sources: Record<PieceId, Source>;
  sample: SampleMode;
}

/** the closed leaf swung open towards the room on its left hinges (narrower and darker) */
export function swungDoor(closed: Sprite, share: number, darken: number): Sprite {
  const c = makeCanvas(closed.w, closed.h);
  const g = ctx2d(c);
  const w = Math.max(3, Math.round(closed.w * share));
  g.drawImage(closed.canvas, 0, 0, closed.w, closed.h, 0, 0, w, closed.h);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = darken;
  g.fillStyle = PAL.soot;
  g.fillRect(0, 0, w, closed.h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // the leaf's free edge, catching the light from outside
  g.fillStyle = PAL.woodLight;
  g.fillRect(w - 1, 2, 1, closed.h - 4);
  return { canvas: c, w: closed.w, h: closed.h };
}

const strip = (frames: Sprite[], fps: number, source: Source): Strip => ({ frames, fps, source });
const four = <T,>(fn: (i: number) => T): T[] => [0, 1, 2, 3].map(fn);

export async function loadSceneArt(sample: SampleMode): Promise<SceneArt> {
  const art = await bakeArtPack(sample);
  const has = (v: unknown): Source => (v ? 'art' : 'placeholder');

  const room = art.room?.sprite ?? fallbackRoom();
  const closed = art.door ?? fallbackDoor();
  const hearth = art.hearth ?? fallbackHearth();
  const fire = art.fire?.levels ?? [[], [fallbackFire(1, 0)], ...[2, 3, 4].map((l) => four((i) => fallbackFire(l, i)))];
  const huddledFrames = art.huddled?.frames ?? four(fallbackHuddled);
  const huddledFps = art.huddled?.fps ?? 2.5;
  const wood = art.woodpile ?? [0, 1, 2].map(fallbackWoodpile);
  const base = art.room ? hex(art.room.border) : PAL.base;

  const outlineCanvas = silhouetteOutline(hearth.canvas, 0, 0, hearth.w, hearth.h, PAL.flameCore);

  return {
    room,
    door: [closed, swungDoor(closed, 0.42, 0.25), swungDoor(closed, 0.13, 0.45)],
    doorway: doorwayNight(),
    hearth,
    hearthOutline: { canvas: outlineCanvas, w: hearth.w + 2, h: hearth.h + 2 },
    fire,
    fireFps: art.fire?.fps ?? 8,
    stranger: {
      huddled: strip(huddledFrames, huddledFps, has(art.huddled)),
      // calmer than huddled: the same art held still (no resting pose delivered yet)
      resting: strip([huddledFrames[0]], 0, art.huddled ? 'derived' : 'placeholder'),
      standing: strip(four((i) => uprightFigure(i, false)), 1.5, 'placeholder'),
      walking: strip(four((i) => uprightFigure(i, true)), 0, 'placeholder')
    },
    woodpile: [wood[0], wood[1], wood[2]],
    furpile: furpile(),
    base,
    sources: {
      room: has(art.room),
      door: has(art.door),
      'door-open': art.door ? 'derived' : 'placeholder',
      hearth: has(art.hearth),
      fire: has(art.fire),
      'stranger-huddled': has(art.huddled),
      'stranger-resting': art.huddled ? 'derived' : 'placeholder',
      'stranger-standing': 'placeholder',
      'stranger-walking': 'placeholder',
      woodpile: has(art.woodpile),
      furpile: 'placeholder'
    },
    sample
  };
}

/** pieces not drawn from delivered art (for the debug panel and the docs) */
export function standInPieces(art: SceneArt): string[] {
  return (Object.entries(art.sources) as Array<[PieceId, Source]>).filter(([, s]) => s !== 'art').map(([id, s]) => `${id} (${s})`);
}
