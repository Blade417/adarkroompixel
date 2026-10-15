/**
 * Core state -> what the room shows. Pure: reads numbers, never writes state.
 * The table follows docs/art/pixel-room-v1/README.md ("参考源码的状态对应") and the suggestions
 * in assets/pixel/room/v1/manifest.json (woodpile thresholds, fire levels).
 */

export interface RoomState {
  fire: number;
  temperature: number;
  builderLevel: number;
  /** undefined early in the game: shown as no woodpile, never filled in */
  wood: number | undefined;
  fur: number | undefined;
  cart?: number;
  traps?: number;
}

export type StrangerPose = 'huddled' | 'resting' | 'standing';

export interface StrangerView {
  pose: StrangerPose;
  spot: 'corner' | 'hearth';
  /** multiplier of the art's frame rate: level 2 shivers at half the rate of level 1 */
  rate: number;
}

export interface RoomView {
  /** 0 dead .. 4 roaring; 0 draws no flame */
  fire: number;
  /** 0 freezing .. 4 hot */
  temperature: number;
  stranger: StrangerView | null;
  /** woodpile frame: 0 low, 1 medium, 2 high; null hides it */
  woodpile: 0 | 1 | 2 | null;
  furpile: boolean;
  cart: boolean;
  traps: number;
  /** frost on the window glass: 0 none, 1 light, 2 heavy (temperature, not fire) */
  frost: 0 | 1 | 2;
}

/** least wood for the medium and high woodpile (manifest quantityThresholdsSuggestion) */
export const WOODPILE_STEPS = { medium: 20, high: 100 } as const;

const clampLevel = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(4, Math.floor(v))) : 0);

export function strangerView(level: number): StrangerView | null {
  if (!(level >= 1)) return null;
  if (level === 1) return { pose: 'huddled', spot: 'corner', rate: 1 };
  if (level === 2) return { pose: 'huddled', spot: 'corner', rate: 0.5 };
  if (level === 3) return { pose: 'resting', spot: 'corner', rate: 1 };
  return { pose: 'standing', spot: 'hearth', rate: 1 };
}

export function woodpileFrame(wood: number | undefined): 0 | 1 | 2 | null {
  if (typeof wood !== 'number' || !(wood >= 1)) return null;
  if (wood >= WOODPILE_STEPS.high) return 2;
  if (wood >= WOODPILE_STEPS.medium) return 1;
  return 0;
}

export function roomView(s: RoomState): RoomView {
  const fire = clampLevel(s.fire);
  const temperature = clampLevel(s.temperature);
  return {
    fire,
    temperature,
    stranger: strangerView(s.builderLevel),
    woodpile: woodpileFrame(s.wood),
    furpile: typeof s.fur === 'number' && s.fur >= 1,
    cart: typeof s.cart === 'number' && s.cart >= 1,
    traps: typeof s.traps === 'number' && Number.isFinite(s.traps) ? Math.max(0, Math.floor(s.traps)) : 0,
    frost: temperature === 0 ? 2 : temperature === 1 ? 1 : 0
  };
}

/** a key that changes whenever the scene's meaning changes (for the text alternative) */
export function describeKey(v: RoomView): string {
  const who = v.stranger ? v.stranger.pose : 'none';
  return `${v.fire}|${v.temperature}|${who}|${v.woodpile ?? '-'}|${v.furpile ? 1 : 0}|${v.cart ? 1 : 0}|${v.traps}`;
}
