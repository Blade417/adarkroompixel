import type { Ending } from './endgame';

export type EndgameScene = 'fabricator' | 'shipyard' | 'ascent' | 'escape' | 'homefleet';

/** The persisted ending, rather than current inventory, decides the final scene. */
export function endgameScene(active: string | null, ending: Ending | null): EndgameScene {
  if (ending) return ending.expansion ? 'homefleet' : 'escape';
  if (active === 'space') return 'ascent';
  return active === 'fabricator' ? 'fabricator' : 'shipyard';
}

/** Artwork uses the original 700-unit flight coordinates. It never expands a hazard. */
export function flightShipRect(x: number, y: number) {
  return { x: x - 10, y: y - 15, w: 20, h: 30 };
}
