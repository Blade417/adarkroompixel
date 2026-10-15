/** Path: outfitting the expedition. Port of path.js rules. */
import { CARRYABLE_EXTRA, CRAFTABLES, FABRICATOR, PATH, WEAPONS, WEIGHT, WORLD } from '../data';
import type { Game } from '../game';

export class Path {
  readonly id = 'path' as const;
  initialized = false;
  /** items packed for the expedition (mutated directly while in the world, like the original) */
  outfit: Record<string, number> = {};

  static readonly EMBARK_COOLDOWN = 'embarkButton';

  constructor(private g: Game) {}

  title(): string {
    return 'A Dusty Path';
  }

  init(): void {
    if (this.initialized) return;
    this.g.world.init();
    this.initialized = true;
    this.outfit = { ...(this.g.store.get('outfit') || {}) };
    this.g.bus.emit({ type: 'locations' });
  }

  openPath(): void {
    this.init();
    this.g.notify('room', this.g.t('the compass points ' + this.g.world.dir));
  }

  onArrival(): void {
    this.updateOutfitting();
    this.g.music('MUSIC_DUSTY_PATH');
  }

  weight(thing: string): number {
    const w = WEIGHT[thing];
    return typeof w === 'number' ? w : 1;
  }

  capacity(): number {
    const s = this.g.store;
    if (s.num('stores["cargo drone"]') > 0) return PATH.DEFAULT_BAG_SPACE + 100;
    if (s.num('stores.convoy') > 0) return PATH.DEFAULT_BAG_SPACE + 60;
    if (s.num('stores.wagon') > 0) return PATH.DEFAULT_BAG_SPACE + 30;
    if (s.num('stores.rucksack') > 0) return PATH.DEFAULT_BAG_SPACE + 10;
    return PATH.DEFAULT_BAG_SPACE;
  }

  freeSpace(): number {
    let used = 0;
    for (const k in this.outfit) {
      let n = this.outfit[k];
      if (typeof n !== 'number' || isNaN(n)) n = this.outfit[k] = 0;
      used += n * this.weight(k);
    }
    return this.capacity() - used;
  }

  armour(): string {
    const s = this.g.store;
    if (s.num('stores["kinetic armour"]') > 0) return 'kinetic';
    if (s.num('stores["s armour"]') > 0) return 'steel';
    if (s.num('stores["i armour"]') > 0) return 'iron';
    if (s.num('stores["l armour"]') > 0) return 'leather';
    return 'none';
  }

  /** items that can be packed right now, with how many are owned and packed */
  carryable(): { name: string; type: string; have: number; packed: number; weight: number; desc?: string }[] {
    const all: Record<string, { type: string; desc?: string }> = { ...CARRYABLE_EXTRA, ...CRAFTABLES, ...FABRICATOR };
    const list = [];
    for (const k in all) {
      const item = all[k];
      const have = this.g.store.num(`stores["${k}"]`);
      if ((item.type === 'tool' || item.type === 'weapon') && have > 0) {
        let desc = item.desc;
        if (desc === 'restores') desc = this.g.t('restores') + ' ' + (k === 'medicine' ? WORLD.MEDS_HEAL : WORLD.MEAT_HEAL) + ' ' + this.g.t('hp');
        else if (desc) desc = this.g.t(desc);
        list.push({ name: k, type: item.type, have, packed: this.outfit[k] ?? 0, weight: this.weight(k), desc });
      }
    }
    return list;
  }

  /** keep the outfit within what is owned (bug fix: the original wrote a stray top-level state key) */
  updateOutfitting(): void {
    for (const k in this.outfit) {
      const have = this.g.store.get(`stores["${k}"]`);
      if (have !== undefined && have < this.outfit[k]) {
        this.outfit[k] = have;
        this.g.store.set(`outfit["${k}"]`, have, true);
      }
    }
  }

  increaseSupply(supply: string, amount = 1): void {
    const cur = this.outfit[supply] ?? 0;
    const have = this.g.store.num(`stores["${supply}"]`);
    if (this.freeSpace() >= this.weight(supply) && cur < have) {
      const byWeight = Math.floor(this.freeSpace() / this.weight(supply));
      this.outfit[supply] = cur + Math.min(amount, byWeight, have - cur);
      this.g.store.set(`outfit["${supply}"]`, this.outfit[supply]);
    }
  }

  decreaseSupply(supply: string, amount = 1): void {
    const cur = this.outfit[supply] ?? 0;
    if (cur > 0) {
      this.outfit[supply] = Math.max(0, cur - amount);
      this.g.store.set(`outfit["${supply}"]`, this.outfit[supply]);
    }
  }

  canEmbark(): boolean {
    return (this.outfit['cured meat'] ?? 0) > 0 && !this.g.cooldowns.isCooling(Path.EMBARK_COOLDOWN);
  }

  embark(): boolean {
    if (!this.canEmbark()) return false;
    for (const k in this.outfit) this.g.store.add(`stores["${k}"]`, -this.outfit[k]);
    this.g.world.onArrival();
    this.g.setActive('world');
    this.g.sfx('EMBARK');
    return true;
  }

  getDamage(thing: string): number | 'stun' | undefined {
    return WEAPONS[thing]?.damage;
  }
}
