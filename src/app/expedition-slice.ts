import { Game, MemoryStorage, seededRng, type ContentSources, type Dictionary } from '../core';
import { TILE, WORLD } from '../core/data';
import type { Direction } from '../core/locations/world';
import { EARLY_ENCOUNTERS, type EarlyEncounterId } from './expedition-catalog';

/** Isolated art/playability fixture. Deliberately never reads or writes browser storage. */
export class ExpeditionSlice {
  readonly game: Game;
  readonly trail: [number, number][] = [];
  direction: Direction = 'south';
  encountered = false;
  receipt: Record<string, number> | null = null;
  encounterId: EarlyEncounterId = 'snarling beast';
  wieldedWeapon = 'bone spear';
  lastStrike: { id: string; time: number } | null = null;
  private departureStores: Record<string, number> = {};

  constructor(content: ContentSources, dictionaries: Dictionary[] = []) {
    const size = WORLD.RADIUS * 2 + 1;
    const map = Array.from({ length: size }, () => Array<string>(size).fill(TILE.FOREST));
    map[WORLD.RADIUS][WORLD.RADIUS] = TILE.VILLAGE;
    this.game = new Game({
      content, storage: new MemoryStorage(), autoSave: false, rng: seededRng(42),
      language: 'zh', dictionaries: { zh: dictionaries },
      state: {
        version: 1.3,
        features: { location: { room: true, outside: true, world: true }, executioner: true },
        game: {
          fire: { value: 4, text: 'roaring' }, temperature: { value: 4, text: 'hot' },
          builder: { level: 4 }, buildings: {}, population: 0, workers: {},
          world: { map, mask: Array.from({ length: size }, () => Array<boolean>(size).fill(false)) }
        },
        stores: { compass: 1, 'cured meat': 12, 'bone spear': 1, 'iron sword': 1, 'steel sword': 1,
          rifle: 1, bullets: 6, bolas: 2, waterskin: 1, rucksack: 1 }
      }
    });
    const g = this.game;
    g.start();
    // A short presentation fixture: no settlement events or ambient story interruptions.
    g.room.stop(); g.outside.stop(); g.events.stop();
    g.world.lightMap(WORLD.RADIUS, WORLD.RADIUS, g.store.get('game.world.mask'));
    g.travelTo('path');
    g.path.increaseSupply('cured meat', 8);
    g.path.increaseSupply('bone spear', 1);
    g.bus.on(event => {
      if (event.type === 'event:start') this.encountered = true;
      if (event.type === 'world:home') {
        const stores = g.store.get('stores') as Record<string, number>;
        this.receipt = Object.fromEntries([...new Set([...Object.keys(stores), ...Object.keys(this.departureStores)])]
          .map(id => [id, (stores[id] ?? 0) - (this.departureStores[id] ?? 0)] as const).filter(([, delta]) => delta !== 0));
      }
    });
  }

  get encounter() { return EARLY_ENCOUNTERS.find(e => e.id === this.encounterId)!; }

  selectEncounter(id: string): boolean {
    const entry = EARLY_ENCOUNTERS.find(e => e.id === id);
    if (this.phase !== 'pack' || !entry) return false;
    this.encounterId = entry.id;
    const map: string[][] = this.game.store.get('game.world.map');
    // The immediate village ring remains forest, as in the original generator.
    for (let x = 0; x < map.length; x++) for (let y = 0; y < map[x].length; y++) {
      const distance = Math.abs(x - WORLD.RADIUS) + Math.abs(y - WORLD.RADIUS);
      map[x][y] = distance === 0 ? TILE.VILLAGE : distance <= 1 ? TILE.FOREST : entry.terrain;
    }
    return true;
  }

  get displayWeapon(): string {
    const combat = this.game.events.active()?.combat;
    if (combat) {
      const choices = combat.attacks();
      const usable = choices.filter(a => !a.cost || Object.entries(a.cost).every(([id, n]) => (this.game.path.outfit[id] ?? 0) >= n));
      return usable.find(a => a.id === this.wieldedWeapon)?.id ?? usable[0]?.id ?? 'fists';
    }
    return (this.game.path.outfit[this.wieldedWeapon] ?? 0) > 0 ? this.wieldedWeapon
      : Object.keys(this.game.path.outfit).find(id => ['bone spear', 'iron sword', 'steel sword', 'rifle', 'bolas'].includes(id) && this.game.path.outfit[id] > 0) ?? 'fists';
  }

  attack(id: string): boolean {
    if (this.phase !== 'combat' || !this.game.events.active()?.combat?.attack(id)) return false;
    this.wieldedWeapon = id;
    this.lastStrike = { id, time: this.game.clock.now };
    return true;
  }

  get phase(): 'pack' | 'world' | 'combat' | 'loot' | 'home' | 'dead' {
    const g = this.game;
    if (g.world.dead) return 'dead';
    if (g.events.active()) return g.events.active()!.afterCombat ? 'loot' : 'combat';
    if (g.active === 'world') return 'world';
    return this.receipt ? 'home' : 'pack';
  }

  pack(item: string, delta: number): void {
    if (this.phase !== 'pack') return;
    if (delta > 0) this.game.path.increaseSupply(item, delta);
    else this.game.path.decreaseSupply(item, -delta);
  }

  depart(): boolean {
    if (this.phase !== 'pack') return false;
    const g = this.game;
    this.departureStores = { ...g.store.get('stores') };
    if (!g.path.embark()) return false;
    this.trail.push([...g.world.curPos]);
    return true;
  }

  move(direction: Direction): boolean {
    if (this.phase !== 'world') return false;
    const g = this.game;
    const delta = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[direction];
    const distance = Math.abs(g.world.curPos[0] + delta[0] - WORLD.RADIUS) + Math.abs(g.world.curPos[1] + delta[1] - WORLD.RADIUS);
    const originalRng = g.rng;
    let draw = 0;
    // Force only the encounter roll (after footsteps), through World.checkFight itself.
    // This also lets the core reset its quiet-step counter correctly after the tutorial encounter.
    if (!this.encountered && distance >= 4) g.rng = { random: () => {
      const value = originalRng.random();
      draw++;
      if (draw === 2) return 0;
      if (draw === 3) {
        const eligible = g.events.content.Encounters.filter(e => e.isAvailable?.());
        const index = eligible.findIndex(e => e.scenes.start.enemy === this.encounterId);
        return index >= 0 ? (index + .5) / eligible.length : value;
      }
      return value;
    } };
    let moved: boolean;
    try { moved = g.world.move(direction); }
    finally { g.rng = originalRng; }
    if (!moved) return false;
    this.direction = direction;
    this.trail.push([...g.world.curPos]);
    return true;
  }

  dispose(): void { this.game.stop(); }
}
