import type { Game } from '../core/game';
import { rememberVillageClearing } from './village';
import type { ForestJourney } from './forest';
import { CRAFTABLES, JOB_MAP, WORKERS } from '../core/data';

export const PIXEL_BUILDABLES = ['trap', 'cart', 'hut', 'lodge', 'trading post', 'tannery', 'smokehouse', 'workshop', 'steelworks', 'armoury'] as const;
export type PixelBuildable = typeof PIXEL_BUILDABLES[number];
export const PIXEL_RECIPES = Object.keys(CRAFTABLES);
export const CRAFT_PURPOSES: Record<string, string> = {
  torch: 'A light source for exploring dark places. Pack it before leaving the village.',
  waterskin: 'Holds extra water for expeditions.',
  cask: 'Holds more water than a waterskin.',
  'water tank': 'The largest water container for long expeditions.',
  'bone spear': 'A simple weapon made of wood and teeth.',
  rucksack: 'Increases carrying capacity on expeditions.',
  wagon: 'A larger carrier for expedition supplies.',
  convoy: 'The greatest carrying capacity for expeditions.',
  'l armour': 'Leather armour offers basic protection.',
  'i armour': 'Iron armour offers stronger protection.',
  's armour': 'Steel armour offers the strongest crafted protection.',
  'iron sword': 'An iron weapon for close combat.',
  'steel sword': 'A stronger steel weapon for close combat.',
  rifle: 'A ranged weapon that uses bullets.'
};

export class BuilderWorkshop {
  constructor(private readonly game: Game, private readonly journey?: ForestJourney) {}

  get available(): boolean { return this.game.room.builderLevel >= 4; }
  get atSettlement(): boolean { return this.game.active === 'room' || this.journey?.place === 'village'; }
  private get enabled(): boolean {
    const g = this.game;
    return !g.over && this.available && this.atSettlement && !g.keyLock && !g.events.active();
  }
  options(): PixelBuildable[] {
    return this.game.room.options().build.filter((id): id is PixelBuildable =>
      PIXEL_BUILDABLES.some(supported => supported === id));
  }

  build(id: PixelBuildable): boolean {
    const g = this.game;
    if (!this.enabled ||
      !PIXEL_BUILDABLES.some(supported => supported === id) || !this.options().includes(id)) return false;
    const built = g.room.build(id);
    if (built) { if (id === 'hut') rememberVillageClearing(g); g.requestSave(); }
    return built;
  }

  craftOptions(): string[] { return this.game.room.options().craft; }
  buyOptions(): string[] { return this.game.room.options().buy; }

  craft(id: string): boolean {
    if (!this.enabled || !this.craftOptions().includes(id)) return false;
    const ok = this.game.room.build(id);
    if (ok) this.game.requestSave();
    return ok;
  }

  buy(id: string): boolean {
    if (!this.enabled || this.game.store.num('game.buildings["trading post"]') < 1 || !this.buyOptions().includes(id)) return false;
    const ok = this.game.room.buy(id);
    if (ok) this.game.requestSave();
    return ok;
  }

  jobs(): string[] {
    return Object.entries(JOB_MAP).filter(([building]) => this.game.store.num(`game.buildings["${building}"]`) > 0)
      .flatMap(([, jobs]) => jobs);
  }

  assign(job: string, amount: number): boolean {
    if (!this.enabled || this.journey?.place !== 'village' || !Number.isSafeInteger(amount) || !amount || !WORKERS[job] || !this.jobs().includes(job)) return false;
    const g = this.game, before = g.store.num(`game.workers["${job}"]`);
    if (amount > 0) g.outside.increaseWorker(job, amount);
    else g.outside.decreaseWorker(job, -amount);
    const changed = before !== g.store.num(`game.workers["${job}"]`);
    if (changed) g.requestSave();
    return changed;
  }
}
