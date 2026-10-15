/**
 * Every position of the pixel room, in logical pixels of the 480x270 frame.
 * Ground anchors (bottom-centre) come from assets/pixel/room/v1/manifest.json; openings and bands
 * were measured on room-back.png (1672x941, factor 480/1672). Sprites are placed by these
 * anchors only. See docs/engineering/phase1.md for the table and how to check it (?debug, anchors).
 */
export const VIEW_W = 480;
export const VIEW_H = 270;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** bottom-centre ground anchors */
export const ANCHOR = {
  door: { x: 76, y: 191 } as Point,
  hearth: { x: 365, y: 211 } as Point,
  /** the log bed inside the firebox */
  fire: { x: 366, y: 197 } as Point,
  /** feet of the huddled / resting stranger */
  strangerCorner: { x: 176, y: 214 } as Point,
  /** feet of the stranger standing by the fire (builder level 4) */
  strangerHearth: { x: 281, y: 214 } as Point,
  /** feet where the arriving stranger first appears (on the threshold) */
  strangerDoor: { x: 78, y: 193 } as Point,
  woodpile: { x: 449, y: 216 } as Point,
  /** pelts under the window (no art yet) */
  furpile: { x: 241, y: 207 } as Point
};

/** the black doorway behind the door leaf (night, snow and the draft show in it) */
export const DOORWAY: Rect = { x: 47, y: 80, w: 58, h: 111 };
/** the four panes of the window (snow and frost are drawn over the glass, clipped to these) */
export const WINDOW_PANES: readonly Rect[] = [
  { x: 213, y: 80, w: 26, h: 19 },
  { x: 242, y: 80, w: 26, h: 19 },
  { x: 213, y: 102, w: 26, h: 21 },
  { x: 242, y: 102, w: 26, h: 21 }
];
/** the whole glass, mullions included */
export const WINDOW_GLASS: Rect = { x: 213, y: 80, w: 55, h: 43 };
/** inside of the hearth's arch: sparks stay in it */
export const FIREBOX: Rect = { x: 338, y: 150, w: 54, h: 47 };
/** Furnace opening and lip, including the transparent space inside the arch. */
export const HEARTH_TARGET: Rect = { x: 328, y: 142, w: 74, h: 65 };
/** centre of the fire's light */
export const LIGHT_CENTRE: Point = { x: 366, y: 184 };

/** the free dark band above the roof timbers (logical px from the top) */
export const TOP_BAND = 16;
/** front edge of the floor: below it the frame is free dark space */
export const FLOOR_FRONT = 234;
/** back-wall base line */
export const WALL_BASE = 191;

/** region kept on narrow / portrait screens */
export const NARROW_CROP: Rect = { x: 0, y: 14, w: 480, h: 224 };
/** horizontal focus when even the narrow crop does not fit (between the stranger and the hearth) */
export const FOCUS_X = 272;

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** top-left corner of a sprite of w x h standing on a ground anchor */
export function groundTopLeft(anchor: Point, w: number, h: number): Point {
  return { x: Math.round(anchor.x - w / 2), y: Math.round(anchor.y - h) };
}
