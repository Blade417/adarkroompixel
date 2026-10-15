/** Outside: forest and village — gathering, traps, population, workers. Port of outside.js rules. */
import { JOB_MAP, OUTSIDE, TRAP_DROPS, WORKERS, villageTitle } from '../data';
import type { Game } from '../game';
import type { TimerId } from '../clock';

const VILLAGE_MUSIC: Record<string, string> = {
  'A Silent Forest': 'MUSIC_SILENT_FOREST',
  'A Lonely Hut': 'MUSIC_LONELY_HUT',
  'A Tiny Village': 'MUSIC_TINY_VILLAGE',
  'A Modest Village': 'MUSIC_MODEST_VILLAGE',
  'A Large Village': 'MUSIC_LARGE_VILLAGE',
  'A Raucous Village': 'MUSIC_RAUCOUS_VILLAGE'
};

export class Outside {
  readonly id = 'outside' as const;
  initialized = false;
  popTimer: TimerId | null = null;

  static readonly GATHER_COOLDOWN = 'gatherButton';
  static readonly TRAPS_COOLDOWN = 'trapsButton';

  constructor(private g: Game) {}

  get huts(): number {
    return this.g.store.num('game.buildings["hut"]');
  }

  get population(): number {
    return this.g.store.num('game.population');
  }

  title(): string {
    return villageTitle(this.huts);
  }

  init(): void {
    const s = this.g.store;
    if (s.get('features.location.outside') === undefined) {
      s.set('features.location.outside', true);
      if (!s.get('game.buildings')) s.set('game.buildings', {});
      if (!s.get('game.population')) s.set('game.population', 0);
      if (!s.get('game.workers')) s.set('game.workers', {});
    }
    this.initialized = true;
    this.updateVillage();
    this.updateVillageIncome();
    this.g.bus.emit({ type: 'locations' });
  }

  onArrival(): void {
    if (!this.g.store.get('game.outside.seenForest')) {
      this.g.notify('outside', this.g.t('the sky is grey and the wind blows relentlessly'));
      this.g.store.set('game.outside.seenForest', true);
    }
    this.updateVillage();
    this.g.music(VILLAGE_MUSIC[this.title()]);
  }

  stop(): void {
    this.g.clock.clear(this.popTimer);
    this.popTimer = null;
  }

  // ------------------------------------------------------------- population

  maxPopulation(): number {
    return this.huts * OUTSIDE.HUT_ROOM;
  }

  increasePopulation(): void {
    const t = this.g.t;
    const space = this.maxPopulation() - this.population;
    if (space > 0) {
      let num = Math.floor(this.g.rng.random() * (space / 2) + space / 2);
      if (num === 0) num = 1;
      if (num === 1) this.g.notify(null, t('a stranger arrives in the night'));
      else if (num < 5) this.g.notify(null, t('a weathered family takes up in one of the huts.'));
      else if (num < 10) this.g.notify(null, t('a small group arrives, all dust and bones.'));
      else if (num < 30) this.g.notify(null, t('a convoy lurches in, equal parts worry and hope.'));
      else this.g.notify(null, t("the town's booming. word does get around."));
      this.g.store.add('game.population', num);
    }
    this.schedulePopIncrease();
  }

  schedulePopIncrease(): void {
    const [lo, hi] = OUTSIDE.POP_DELAY;
    const next = Math.floor(this.g.rng.random() * (hi - lo)) + lo;
    this.popTimer = this.g.clock.setTimeout(() => this.increasePopulation(), next * 60 * 1000);
  }

  killVillagers(num: number): void {
    const s = this.g.store;
    s.add('game.population', -num);
    if (s.num('game.population') < 0) s.set('game.population', 0);
    const remaining = this.numGatherers();
    if (remaining < 0) {
      let gap = -remaining;
      const workers = s.get('game.workers') || {};
      for (const k in workers) {
        const n = s.num(`game.workers["${k}"]`);
        if (n < gap) {
          gap -= n;
          s.set(`game.workers["${k}"]`, 0);
        } else {
          s.add(`game.workers["${k}"]`, -gap);
          break;
        }
      }
    }
  }

  /** destroy `num` huts (full or partly full ones by default); returns the number of dead */
  destroyHuts(num: number, allowEmpty?: boolean): number {
    const s = this.g.store;
    let dead = 0;
    for (let i = 0; i < num; i++) {
      const population = s.num('game.population');
      const rate = population / OUTSIDE.HUT_ROOM;
      const full = Math.floor(rate);
      const huts = allowEmpty ? this.huts : Math.ceil(rate);
      if (!huts) break;
      const target = Math.floor(this.g.rng.random() * huts) + 1;
      let inhabitants = 0;
      if (target <= full) inhabitants = OUTSIDE.HUT_ROOM;
      else if (target === full + 1) inhabitants = population % OUTSIDE.HUT_ROOM;
      s.set('game.buildings["hut"]', s.num('game.buildings["hut"]') - 1);
      if (inhabitants) {
        this.killVillagers(inhabitants);
        dead += inhabitants;
      }
    }
    return dead;
  }

  // ------------------------------------------------------------- workers

  numGatherers(): number {
    const s = this.g.store;
    let num = s.num('game.population');
    const workers = s.get('game.workers') || {};
    for (const k in workers) num -= s.num(`game.workers["${k}"]`);
    return num;
  }

  /** worker counts including gatherers, in display order */
  workers(): { name: string; count: number }[] {
    const workers = this.g.store.get('game.workers') || {};
    const list = [{ name: 'gatherer', count: this.numGatherers() }];
    for (const k of Object.keys(workers).sort()) list.push({ name: k, count: this.g.store.num(`game.workers["${k}"]`) });
    return list;
  }

  increaseWorker(worker: string, amount = 1): void {
    const free = this.numGatherers();
    if (free > 0 && this.g.store.get(`game.workers["${worker}"]`) !== undefined) {
      this.g.store.add(`game.workers["${worker}"]`, Math.min(free, amount));
    }
  }

  decreaseWorker(worker: string, amount = 1): void {
    const cur = this.g.store.num(`game.workers["${worker}"]`);
    if (cur > 0) this.g.store.add(`game.workers["${worker}"]`, -Math.min(cur, amount));
  }

  /** add worker slots unlocked by a building; returns true if any were added */
  checkWorker(building: string): boolean {
    const s = this.g.store;
    let added = false;
    for (const job of JOB_MAP[building] ?? []) {
      if (typeof s.get(`game.buildings["${building}"]`) === 'number' && typeof s.get(`game.workers["${job}"]`) !== 'number') {
        s.set(`game.workers["${job}"]`, 0);
        added = true;
      }
    }
    return added;
  }

  updateVillage(): void {
    const buildings = this.g.store.get('game.buildings') || {};
    for (const k in buildings) this.checkWorker(k);
    if (this.huts > 0 && this.popTimer === null) this.schedulePopIncrease();
  }

  updateVillageIncome(): void {
    for (const worker in WORKERS) {
      const income = WORKERS[worker];
      let num = worker === 'gatherer' ? this.numGatherers() : this.g.store.get(`game.workers["${worker}"]`);
      if (typeof num !== 'number') continue;
      if (num < 0) num = 0;
      const stores: Record<string, number> = {};
      const cur = this.g.getIncome(worker);
      let needsUpdate = false;
      for (const store in income.stores) {
        stores[store] = income.stores[store] * num;
        if (cur.stores?.[store] !== stores[store]) needsUpdate = true;
      }
      if (needsUpdate) this.g.setIncome(worker, { delay: income.delay, stores });
    }
  }

  /** content compatibility no-ops (village view updates are presentation work) */
  updateTrapButton(): void {}

  // ------------------------------------------------------------- actions

  gatherWood(): boolean {
    if (this.g.cooldowns.isCooling(Outside.GATHER_COOLDOWN)) return false;
    this.g.cooldowns.start(Outside.GATHER_COOLDOWN, OUTSIDE.GATHER_DELAY);
    this.g.notify('outside', this.g.t('dry brush and dead branches litter the forest floor'));
    const amount = this.g.store.num('game.buildings["cart"]') > 0 ? 50 : 10;
    this.g.store.add('stores.wood', amount);
    this.g.sfx('GATHER_WOOD');
    return true;
  }

  canCheckTraps(): boolean {
    return this.g.store.num('game.buildings["trap"]') > 0;
  }

  checkTraps(): Record<string, number> | null {
    if (!this.canCheckTraps() || this.g.cooldowns.isCooling(Outside.TRAPS_COOLDOWN)) return null;
    this.g.cooldowns.start(Outside.TRAPS_COOLDOWN, OUTSIDE.TRAPS_DELAY);
    const s = this.g.store;
    const t = this.g.t;
    const drops: Record<string, number> = {};
    const msg: string[] = [];
    const numTraps = s.num('game.buildings["trap"]');
    const numBait = s.num('stores.bait');
    const numDrops = numTraps + (numBait < numTraps ? numBait : numTraps);
    for (let i = 0; i < numDrops; i++) {
      const roll = this.g.rng.random();
      for (const drop of TRAP_DROPS) {
        if (roll < drop.rollUnder) {
          if (drops[drop.name] === undefined) {
            drops[drop.name] = 0;
            msg.push(t(drop.message));
          }
          drops[drop.name]++;
          break;
        }
      }
    }
    let text = t('the traps contain ');
    msg.forEach((m, l) => {
      if (msg.length > 1 && l > 0 && l < msg.length - 1) text += ', ';
      else if (msg.length > 1 && l === msg.length - 1) text += t(' and ');
      text += m;
    });
    const baitUsed = numBait < numTraps ? numBait : numTraps;
    const result = { ...drops };
    drops['bait'] = -baitUsed;
    this.g.notify('outside', text);
    s.addM('stores', drops);
    this.g.sfx('CHECK_TRAPS');
    return result;
  }

  // ------------------------------------------------------------- reactions

  onStateUpdate(category: string, stateName: string): void {
    if (!this.initialized) return;
    if (category === 'stores' || stateName.startsWith('game.buildings')) {
      this.updateVillage();
      if (stateName.startsWith('game.buildings')) this.updateVillageIncome();
    } else if (stateName.startsWith('game.workers') || stateName.startsWith('game.population')) {
      this.updateVillage();
      this.updateVillageIncome();
    }
  }
}
