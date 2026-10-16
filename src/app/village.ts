import type { Game } from '../core/game';
import { OUTSIDE } from '../core/data';

/** Fixed plots, in construction order: four near the hearth, eight middle, eight outer. */
export const VILLAGE_SIZE = { w: 576, h: 324 };
const RESIDENTIAL_PLOTS = [
  [178, 120], [301, 117], [184, 181], [300, 183],
  [155, 77], [230, 71], [307, 76], [351, 126],
  [350, 183], [278, 219], [202, 218], [131, 179],
  [99, 88], [179, 43], [300, 39], [376, 78],
  [407, 144], [391, 210], [329, 240], [121, 226]
] as const;
// Expand the camera into the perimeter, retaining residential size and ring order.
export const HUT_PLOTS = RESIDENTIAL_PLOTS.map(([x, y]) => [x + 48, y + 27] as const);
export const HEARTH_PLOT = { x: 288, y: 178, w: 64, h: 44 };
export const HUT_SIZE = { w: 38, h: 29 };
export const FOREST_EXIT = { x: 333, y: 321, w: 22, h: 12 };

/** Four districts contain SEVEN original buildings, each with its own future footprint. */
export const PUBLIC_FACILITIES = [
  { id: 'lodge', zone: 'hunting', x: 288, y: 45, w: 58, h: 40, art: 'lodge' },
  { id: 'workshop', zone: 'craft', x: 58, y: 159, w: 60, h: 38, art: 'workshop' },
  { id: 'steelworks', zone: 'craft', x: 36, y: 218, w: 42, h: 40, art: 'steelworks' },
  { id: 'armoury', zone: 'craft', x: 87, y: 221, w: 42, h: 36, art: 'armoury' },
  { id: 'tannery', zone: 'processing', x: 508, y: 157, w: 58, h: 40, art: 'tannery' },
  { id: 'smokehouse', zone: 'processing', x: 525, y: 224, w: 54, h: 40, art: 'smokehouse' },
  { id: 'trading post', zone: 'trade', x: 288, y: 309, w: 64, h: 36, art: 'trade' }
] as const;
export type PublicFacilityId = typeof PUBLIC_FACILITIES[number]['id'];
export const PUBLIC_ZONES = [
  { id: 'hunting', x: 288, y: 52, w: 70, h: 50, facilities: ['lodge'] },
  { id: 'craft', x: 62, y: 224, w: 110, h: 106, facilities: ['workshop', 'steelworks', 'armoury'] },
  { id: 'processing', x: 520, y: 226, w: 92, h: 114, facilities: ['tannery', 'smokehouse'] },
  { id: 'trade', x: 288, y: 309, w: 78, h: 42, facilities: ['trading post'] }
] as const;
export type PublicZoneId = typeof PUBLIC_ZONES[number]['id'];
export type VillageTarget = number | 'home' | 'forest' | PublicZoneId;

export interface VillageView {
  huts: number;
  clearedHuts: number;
  population: number;
  capacity: number;
  gatherers: number;
  fire: number;
  facilities: Record<PublicFacilityId, number>;
}

export function villageView(game: Game): VillageView {
  return {
    huts: Math.max(0, Math.min(HUT_PLOTS.length, game.outside.huts)),
    clearedHuts: Math.max(0, Math.min(HUT_PLOTS.length, Math.max(game.outside.huts, game.store.num('game.pixel.clearedHuts')))),
    population: game.outside.population,
    capacity: game.outside.maxPopulation(),
    gatherers: Math.max(0, game.outside.numGatherers()),
    fire: game.room.fire,
    facilities: Object.fromEntries(PUBLIC_FACILITIES.map(f => [f.id, Math.max(0, game.store.num(`game.buildings["${f.id}"]`))])) as VillageView['facilities']
  };
}

/** An abandoned/burnt plot stays cleared; older saves acquire the record on first resume. */
export function rememberVillageClearing(game: Game): void {
  const huts = Math.max(0, Math.min(HUT_PLOTS.length, game.outside.huts));
  if (huts > game.store.num('game.pixel.clearedHuts')) game.store.set('game.pixel.clearedHuts', huts);
}

/** Visual household allocation only; the original simulation tracks a single population. */
export function inhabitants(view: VillageView, plot: number): number {
  if (plot < 0 || plot >= view.huts) return 0;
  return Math.max(0, Math.min(OUTSIDE.HUT_ROOM, view.population - plot * OUTSIDE.HUT_ROOM));
}
