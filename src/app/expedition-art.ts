import type { Game } from '../core/game';
import { TILE } from '../core/data';

/** Visual identity only: scene rules, costs, damage and loot remain in the core. */
export const EARLY_SITES = {
  house: { tile: TILE.HOUSE, art: 'house', label: '废屋' },
  cave: { tile: TILE.CAVE, art: 'cave', label: '洞穴' },
  ironmine: { tile: TILE.IRON_MINE, art: 'mine', label: '铁矿' },
  outpost: { tile: TILE.OUTPOST, art: 'outpost', label: '前哨' }
} as const;

export const SITE_ENEMY_ART: Record<string, string> = {
  squatter: 'squatter', 'cave lizard': 'cave-lizard', lizard: 'lizard',
  beast: 'site-beast', 'beastly matriarch': 'matriarch'
};

export function landmarkArt(tile: string): string | null {
  const bare = tile.replace(/!$/, '');
  const site = Object.values(EARLY_SITES).find(s => s.tile === bare);
  return site ? 'landmark-' + site.art : null;
}

/** Resolve from the active event, never from an enemy or the tile under a random fight. */
export function sitePresentation(game: Game): { background: string; overlay: string | null; label: string } | null {
  if (game.active !== 'world') return null;
  const event = game.events.active();
  if (!event) return null;
  for (const [id, site] of Object.entries(EARLY_SITES)) {
    if (event.def !== game.content.events.Setpieces[id]) continue;
    const entrance = event.sceneName === 'start' || id === 'outpost';
    return { background: entrance ? 'background' : site.art + '-background',
      overlay: entrance ? 'site-' + site.art : null, label: site.label };
  }
  return null;
}
