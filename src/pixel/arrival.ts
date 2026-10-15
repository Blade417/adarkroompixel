/**
 * The stranger's arrival: a short, skippable piece of presentation played once, when builder level
 * 0 -> 1 is seen during live play (never on load, never while catching up after the tab was hidden).
 * It only reads time; it never touches game state.
 */
import { ANCHOR } from './layout';

export const ARRIVAL_MS = 4200;

/** milestones (ms from the start) */
export const ARRIVAL_T = {
  open: 350,
  enter: 500,
  reach: 2300,
  sit: 2800,
  closing: 2900,
  closed: 3250
} as const;

export const WALK_STEP_MS = 180;

export interface ArrivalFigure {
  pose: 'walking' | 'resting' | 'huddled';
  /** feet position (logical px) */
  x: number;
  y: number;
  /** walking frame; null: the pose's own animation, driven by the clock */
  frame: number | null;
}

export interface ArrivalPose {
  /** door frame: 0 closed, 1 ajar, 2 open */
  door: 0 | 1 | 2;
  /** cold air and light through the doorway, 0..1 */
  draft: number;
  stranger: ArrivalFigure | null;
}

export function arrivalPose(ms: number): ArrivalPose {
  const t = Math.max(0, Math.min(ARRIVAL_MS, ms));
  const T = ARRIVAL_T;
  const door: 0 | 1 | 2 = t < T.open ? 1 : t < T.closing ? 2 : t < T.closed ? 1 : 0;

  let draft = 0;
  if (t < T.open) draft = 0.6 * (t / T.open);
  else if (t < T.closing) draft = 1;
  else if (t < T.closed) draft = 0.6 * (1 - (t - T.closing) / (T.closed - T.closing));

  let stranger: ArrivalFigure | null = null;
  const from = ANCHOR.strangerDoor;
  const to = ANCHOR.strangerCorner;
  if (t >= T.enter && t < T.reach) {
    const k = (t - T.enter) / (T.reach - T.enter);
    // a stumbling walk: slower at the end
    const eased = 1 - (1 - k) * (1 - k);
    const step = Math.floor((t - T.enter) / WALK_STEP_MS);
    stranger = {
      pose: 'walking',
      x: Math.round(from.x + (to.x - from.x) * eased),
      y: Math.round(from.y + (to.y - from.y) * eased),
      frame: step % 4
    };
  } else if (t >= T.reach && t < T.sit) {
    stranger = { pose: 'resting', x: to.x, y: to.y, frame: null };
  } else if (t >= T.sit) {
    stranger = { pose: 'huddled', x: to.x, y: to.y, frame: null };
  }
  return { door, draft, stranger };
}

/** detects the live 0 -> 1 transition of the builder level */
export class ArrivalWatcher {
  private last: number | null = null;

  /**
   * feed the current level once per frame; `live` is false while loading or catching up.
   * Returns true exactly when the arrival should be shown.
   */
  observe(level: number, live: boolean): boolean {
    const prev = this.last;
    this.last = level;
    return live && prev === 0 && level === 1;
  }
}

/** playback state of the arrival (start, skip, pose at a time) */
export class ArrivalPlayer {
  private startedAt: number | null = null;

  get playing(): boolean {
    return this.startedAt !== null;
  }

  start(nowMs: number): void {
    this.startedAt = nowMs;
  }

  skip(): void {
    this.startedAt = null;
  }

  /** current pose, or null when not playing (finishes itself after ARRIVAL_MS) */
  pose(nowMs: number): ArrivalPose | null {
    if (this.startedAt === null) return null;
    const t = nowMs - this.startedAt;
    if (t >= ARRIVAL_MS) {
      this.startedAt = null;
      return null;
    }
    return arrivalPose(t);
  }
}
