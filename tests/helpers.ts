import { Game, MemoryStorage, seededRng, type GameOptions, type StateTree } from '../src/core';
import { TILE, WORLD } from '../src/core/data';
import { nodeContent, nodeZhDictionaries } from '../src/node';

const content = nodeContent();
const zh = nodeZhDictionaries();

export function makeGame(opts: Partial<GameOptions> = {}): Game {
  return new Game({
    content,
    storage: opts.storage ?? new MemoryStorage(),
    rng: opts.rng ?? seededRng(42),
    dictionaries: { zh },
    ...opts
  });
}

export function startGame(state?: StateTree, opts: Partial<GameOptions> = {}): Game {
  const g = makeGame({ ...opts, state });
  g.start();
  return g;
}

/** a state with the room warm, the builder working and the village unlocked */
export function villageState(extra: StateTree = {}): StateTree {
  return deepMerge({
    version: 1.3,
    features: { location: { room: true, outside: true } },
    game: {
      fire: { value: 4, text: 'roaring' },
      temperature: { value: 4, text: 'hot' },
      builder: { level: 4 },
      buildings: {},
      population: 0,
      workers: {},
      outside: { seenForest: true }
    },
    stores: { wood: 1000 }
  }, extra);
}

/** a flat field map (no landmarks) so walking tests are deterministic */
export function flatWorld(fill: string = TILE.FIELD): { map: string[][]; mask: boolean[][] } {
  const size = WORLD.RADIUS * 2 + 1;
  const map = Array.from({ length: size }, () => new Array(size).fill(fill));
  map[WORLD.RADIUS][WORLD.RADIUS] = TILE.VILLAGE;
  const mask = Array.from({ length: size }, () => new Array(size).fill(false));
  return { map, mask };
}

/** village + path + an explicit world map, ready to embark */
export function expeditionState(extra: StateTree = {}): StateTree {
  return villageState(deepMerge({
    features: { location: { world: true }, executioner: true },
    game: { world: flatWorld() },
    stores: { compass: 1, 'cured meat': 20 }
  }, extra));
}

export function deepMerge(a: any, b: any): any {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out: any = { ...(a ?? {}) };
  for (const k of Object.keys(b)) out[k] = deepMerge(a?.[k], b[k]);
  return out;
}

export function lastLog(g: Game, n = 1): string[] {
  return g.notifications.texts().slice(-n);
}

export function logHas(g: Game, text: string): boolean {
  return g.notifications.texts().some((t) => t.includes(text));
}
