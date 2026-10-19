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
  beast: 'site-beast', 'beastly matriarch': 'matriarch',
  man: 'mine-guard', chief: 'mine-chief', soldier: 'soldier', veteran: 'veteran',
  thug: 'thug', scavenger: 'scavenger', madman: 'madman', vigilante: 'vigilante',
  sniper: 'city-sniper', commando: 'city-commando', 'frail man': 'city-frail-man',
  'old man': 'city-old-man', youth: 'city-youth', squatters: 'city-squatters',
  deformed: 'city-deformed', lizards: 'city-lizards', bird: 'city-bird',
  rats: 'city-rats', tentacles: 'city-tentacles',
  'chitinous horror': 'warship-horror', 'chitinous queen': 'warship-queen',
  operative: 'warship-operative', researcher: 'warship-researcher', 'ancient beast': 'warship-beast',
  'automated turret': 'warship-auto-turret', 'mechanical guard': 'warship-guard',
  'mechanical quadruped': 'warship-quadruped', 'broken medic': 'warship-medic',
  'defence turret': 'warship-defence-turret', 'unruly welder': 'warship-welder',
  'unstable prototype': 'warship-prototype', 'murderous robot': 'warship-sparring',
  'unstable automaton': 'warship-automaton', 'malformed experiment': 'warship-experiment',
  'immortal wanderer': 'warship-immortal',
  'shivering man': 'wild-shivering', 'man-eater': 'wild-man-eater', 'feral terror': 'wild-feral-terror'
};

/** Mine battles happen at the occupied perimeter, not inside the iron-mine tunnel. */
export const MID_SITES = {
  coalmine: { tile: TILE.COAL_MINE, art: 'coal', label: '煤矿', background: 'mine-yard-background' },
  sulphurmine: { tile: TILE.SULPHUR_MINE, art: 'sulphur', label: '硫矿', background: 'mine-yard-background' },
  town: { tile: TILE.TOWN, art: 'town', label: '荒镇', background: 'town-background' }
} as const;

export const DEEP_SITES = {
  city: { tile: TILE.CITY, art: 'city', label: '城市废墟', background: 'city-street-background' },
  battlefield: { tile: TILE.BATTLEFIELD, art: 'battlefield', label: '古战场', background: 'barrens-background' },
  borehole: { tile: TILE.BOREHOLE, art: 'borehole', label: '深钻井', background: 'barrens-background' },
  ship: { tile: TILE.SHIP, art: 'shipwreck', label: '坠毁飞船', background: 'barrens-background' },
  swamp: { tile: TILE.SWAMP, art: 'swamp', label: '幽暗沼泽', background: 'swamp-background' },
  executioner: { tile: TILE.EXECUTIONER, art: 'warship', label: '残破战舰', background: 'barrens-background' }
} as const;

export const SPECIAL_SITES = {
  cache: { tile: TILE.CACHE, art: 'cache', label: '被毁的村庄' }
} as const;

const CITY_HOSPITAL = new Set(['b7', 'b8', 'c10', 'c11', 'c12', 'c13', 'd10', 'd11',
  'end10', 'end11', 'end12', 'end13', 'end14', 'end15']);
const CITY_SUBWAY = new Set(['c3', 'd3', 'end3']);

/** The original event selects the deck; tile flags and enemy reuse never select it. */
export const WARSHIP_BACKGROUNDS: Record<string, string> = {
  'executioner-antechamber': 'warship-antechamber-background',
  'executioner-engineering': 'warship-engineering-background',
  'executioner-martial': 'warship-martial-background',
  'executioner-medical': 'warship-medical-background',
  'executioner-command': 'warship-command-background'
};

export function landmarkArt(tile: string): string | null {
  const bare = tile.replace(/!$/, '');
  const site = [...Object.values(EARLY_SITES), ...Object.values(MID_SITES), ...Object.values(DEEP_SITES), ...Object.values(SPECIAL_SITES)].find(s => s.tile === bare);
  return site ? 'landmark-' + site.art : null;
}

/** Resolve from the active event, never from an enemy or the tile under a random fight. */
export function sitePresentation(game: Game): { background: string; overlay: string | null; label: string; resident?: string } | null {
  if (game.active !== 'world') return null;
  const event = game.events.active();
  if (!event) return null;
  for (const [id, site] of Object.entries(EARLY_SITES)) {
    if (event.def !== game.content.events.Setpieces[id]) continue;
    const entrance = event.sceneName === 'start' || id === 'outpost';
    return { background: entrance ? 'background' : site.art + '-background',
      overlay: entrance ? 'site-' + site.art : null, label: site.label };
  }
  for (const [id, site] of Object.entries(MID_SITES)) {
    if (event.def !== game.content.events.Setpieces[id]) continue;
    return { background: site.background, overlay: event.sceneName === 'start' ? 'site-' + site.art : null, label: site.label };
  }
  for (const [id, site] of Object.entries(DEEP_SITES)) {
    if (id === 'executioner') continue;
    if (event.def !== game.content.events.Setpieces[id]) continue;
    const background = id === 'city'
      ? CITY_HOSPITAL.has(event.sceneName) ? 'city-hospital-background'
        : CITY_SUBWAY.has(event.sceneName) ? 'city-subway-background' : site.background
      : id === 'swamp' && event.sceneName !== 'start' ? 'swamp-cabin-background' : site.background;
    // The swamp background already contains its cabin; a second miniature cabin would duplicate it.
    return { background, overlay: event.sceneName === 'start' && id !== 'swamp' ? 'site-' + site.art : null, label: site.label,
      ...(id === 'swamp' && event.sceneName !== 'start' ? { resident: 'swamp-elder' } : {}) };
  }
  if (event.def === game.content.events.Setpieces.cache) {
    const entrance = event.sceneName === 'start';
    return { background: entrance ? 'barrens-background' : 'cache-interior-background',
      overlay: entrance ? 'site-cache' : null, label: SPECIAL_SITES.cache.label };
  }
  // Event identity keeps interiors stable across reloads and changes to world flags.
  const warshipEvent = Object.entries(game.content.events.Executioner).find(([, def]) => def === event.def)?.[0];
  if (warshipEvent) {
    const entrance = warshipEvent === 'executioner-intro' && event.sceneName === 'start';
    return { background: entrance ? DEEP_SITES.executioner.background
        : WARSHIP_BACKGROUNDS[warshipEvent] ?? 'warship-corridor-background',
      overlay: entrance ? 'site-warship' : null, label: DEEP_SITES.executioner.label };
  }
  return null;
}
