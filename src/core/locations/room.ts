/** Room: the fire, the temperature, the stranger, building / crafting / trading. Port of room.js rules. */
import { CRAFTABLES, FIRE, ROOM, TEMPERATURE, TRADE_GOODS, type Craftable, type Cost } from '../data';
import type { Game } from '../game';
import type { TimerId } from '../clock';

export type FireLevel = 0 | 1 | 2 | 3 | 4;

const FIRE_MUSIC = ['MUSIC_FIRE_DEAD', 'MUSIC_FIRE_SMOLDERING', 'MUSIC_FIRE_FLICKERING', 'MUSIC_FIRE_BURNING', 'MUSIC_FIRE_ROARING'];

export class Room {
  readonly id = 'room' as const;
  /** set when fire/temperature change while the player is elsewhere */
  changed = false;
  /** items whose build / buy option has been revealed (the original Room.buttons) */
  revealed = new Set<string>();
  private maxNotified = new Set<string>();
  private pathDiscovery = false;
  private fireTimer: TimerId | null = null;
  private tempTimer: TimerId | null = null;
  private builderTimer: TimerId | null = null;
  private forestTimer: TimerId | null = null;

  constructor(private g: Game) {}

  // ------------------------------------------------------------- state helpers

  get fire(): FireLevel {
    return (this.g.store.get('game.fire.value') ?? 0) as FireLevel;
  }

  get temperature(): number {
    return this.g.store.get('game.temperature.value') ?? 0;
  }

  get builderLevel(): number {
    return this.g.store.get('game.builder.level') ?? -1;
  }

  private setFire(v: number): void {
    this.g.store.set('game.fire', { ...FIRE[v] });
  }

  private setTemperature(v: number): void {
    this.g.store.set('game.temperature', { ...TEMPERATURE[v] });
  }

  title(): string {
    return this.fire < 2 ? 'A Dark Room' : 'A Firelit Room';
  }

  // ------------------------------------------------------------- lifecycle

  init(): void {
    const s = this.g.store;
    this.pathDiscovery = Boolean(s.get('stores["compass"]'));
    if (s.get('features.location.room') === undefined) {
      s.set('features.location.room', true);
      s.set('game.builder.level', -1);
    }
    if (s.get('game.temperature.value') === undefined) this.setTemperature(0);
    if (s.get('game.fire.value') === undefined) this.setFire(0);

    this.fireTimer = this.g.clock.setTimeout(() => this.coolFire(), ROOM.FIRE_COOL_DELAY);
    this.tempTimer = this.g.clock.setTimeout(() => this.adjustTemp(), ROOM.ROOM_WARM_DELAY);

    const lvl = this.builderLevel;
    if (lvl >= 0 && lvl < 3) {
      this.builderTimer = this.g.clock.setTimeout(() => this.updateBuilderState(), ROOM.BUILDER_STATE_DELAY);
    }
    // bug fix: the original only scheduled this on the 0 -> 1 transition, so reloading during the
    // 15 s after the stranger arrived left the forest locked forever
    if (lvl >= 1 && s.get('stores.wood') === undefined) {
      this.forestTimer = this.g.clock.setTimeout(() => this.unlockForest(), ROOM.NEED_WOOD_DELAY);
    }

    const t = this.g.t;
    this.g.notify('room', t('the room is {0}', t(TEMPERATURE[this.temperature].text)));
    this.g.notify('room', t('the fire is {0}', t(FIRE[this.fire].text)));
    // items already at their maximum in a loaded save must not re-announce it
    for (const k in CRAFTABLES) if (this.isMaxed(k)) this.maxNotified.add(k);
  }

  onArrival(): void {
    const t = this.g.t;
    if (this.changed) {
      this.g.notify('room', t('the fire is {0}', t(FIRE[this.fire].text)));
      this.g.notify('room', t('the room is {0}', t(TEMPERATURE[this.temperature].text)));
      this.changed = false;
    }
    this.offerHelp();
    this.music();
  }

  /** Complete recovery once, including when the pixel edition stays in the room. */
  offerHelp(): boolean {
    if (this.builderLevel !== 3) return false;
    this.g.store.set('game.builder.level', 4);
    this.g.setIncome('builder', { delay: 10, stores: { wood: 2 } });
    this.g.notify('room', this.g.t('the stranger is standing by the fire. she says she can help. says she builds things.'));
    this.g.requestSave();
    return true;
  }

  music(): void {
    this.g.music(FIRE_MUSIC[this.fire]);
  }

  stop(): void {
    for (const id of [this.fireTimer, this.tempTimer, this.builderTimer, this.forestTimer]) this.g.clock.clear(id);
  }

  // ------------------------------------------------------------- fire

  /** id of the shared light / stoke cooldown */
  static readonly FIRE_COOLDOWN = 'stokeButton';

  canTendFire(): boolean {
    return !this.g.cooldowns.isCooling(Room.FIRE_COOLDOWN);
  }

  /** light when dead, stoke otherwise (the single "fire" interaction of the remake) */
  tendFire(): boolean {
    return this.fire === 0 ? this.lightFire() : this.stokeFire();
  }

  lightFire(): boolean {
    if (!this.canTendFire()) return false;
    const s = this.g.store;
    const wood = s.get('stores.wood');
    if (wood < 5) {
      this.g.notify('room', this.g.t('not enough wood to get the fire going'));
      return false;
    } else if (wood > 4) {
      s.set('stores.wood', wood - 5);
    }
    this.g.cooldowns.start(Room.FIRE_COOLDOWN, ROOM.STOKE_COOLDOWN);
    this.setFire(3);
    this.g.sfx('LIGHT_FIRE');
    this.onFireChange();
    return true;
  }

  stokeFire(): boolean {
    if (!this.canTendFire()) return false;
    const s = this.g.store;
    const wood = s.get('stores.wood');
    if (wood === 0) {
      this.g.notify('room', this.g.t('the wood has run out'));
      return false;
    }
    if (wood > 0) s.set('stores.wood', wood - 1);
    this.g.cooldowns.start(Room.FIRE_COOLDOWN, ROOM.STOKE_COOLDOWN);
    if (this.fire < 4) this.setFire(this.fire + 1);
    this.g.sfx('STOKE_FIRE');
    this.onFireChange();
    return true;
  }

  /** wood is free until the first wood is ever gathered */
  isFireFree(): boolean {
    return !this.g.store.get('stores.wood');
  }

  private onFireChange(): void {
    const t = this.g.t;
    if (this.g.active !== 'room') this.changed = true;
    this.g.notify('room', t('the fire is {0}', t(FIRE[this.fire].text)), true);
    if (this.fire > 1 && this.builderLevel < 0) {
      this.g.store.set('game.builder.level', 0);
      this.g.notify('room', t('the light from the fire spills from the windows, out into the dark'));
      this.builderTimer = this.g.clock.setTimeout(() => this.updateBuilderState(), ROOM.BUILDER_STATE_DELAY);
    }
    this.g.clock.clear(this.fireTimer);
    this.fireTimer = this.g.clock.setTimeout(() => this.coolFire(), ROOM.FIRE_COOL_DELAY);
    if (this.g.active === 'room') this.music();
  }

  private coolFire(): void {
    const s = this.g.store;
    const wood = s.get('stores.wood');
    if (this.fire <= 2 && this.builderLevel > 3 && wood > 0) {
      this.g.notify('room', this.g.t('builder stokes the fire'), true);
      s.set('stores.wood', wood - 1);
      this.setFire(this.fire + 1);
    }
    if (this.fire > 0) {
      this.setFire(this.fire - 1);
      this.fireTimer = this.g.clock.setTimeout(() => this.coolFire(), ROOM.FIRE_COOL_DELAY);
      this.onFireChange();
    }
  }

  private adjustTemp(): void {
    const t = this.g.t;
    const old = this.temperature;
    if (this.temperature > 0 && this.temperature > this.fire) {
      this.setTemperature(this.temperature - 1);
      this.g.notify('room', t('the room is {0}', t(TEMPERATURE[this.temperature].text)), true);
    }
    if (this.temperature < 4 && this.temperature < this.fire) {
      this.setTemperature(this.temperature + 1);
      this.g.notify('room', t('the room is {0}', t(TEMPERATURE[this.temperature].text)), true);
    }
    if (this.temperature !== old) this.changed = true;
    this.tempTimer = this.g.clock.setTimeout(() => this.adjustTemp(), ROOM.ROOM_WARM_DELAY);
  }

  // ------------------------------------------------------------- the stranger

  private unlockForest(): void {
    this.g.store.set('stores.wood', 4);
    this.g.outside.init();
    this.g.notify('room', this.g.t('the wind howls outside'));
    this.g.notify('room', this.g.t('the wood is running out'));
  }

  private updateBuilderState(): void {
    const s = this.g.store;
    const t = this.g.t;
    let lvl = this.builderLevel;
    if (lvl === 0) {
      this.g.notify('room', t('a ragged stranger stumbles through the door and collapses in the corner'));
      s.set('game.builder.level', 1);
      lvl = 1;
      this.forestTimer = this.g.clock.setTimeout(() => this.unlockForest(), ROOM.NEED_WOOD_DELAY);
    } else if (lvl < 3 && this.temperature >= 3) {
      if (lvl === 1) this.g.notify('room', t('the stranger shivers, and mumbles quietly. her words are unintelligible.'));
      else if (lvl === 2) this.g.notify('room', t('the stranger in the corner stops shivering. her breathing calms.'));
      s.set('game.builder.level', lvl + 1);
      lvl++;
    }
    if (lvl < 3) {
      this.builderTimer = this.g.clock.setTimeout(() => this.updateBuilderState(), ROOM.BUILDER_STATE_DELAY);
    }
    this.g.requestSave();
  }

  // ------------------------------------------------------------- building & crafting

  count(thing: string, item: Craftable): number {
    const s = this.g.store;
    return item.type === 'building' ? s.num(`game.buildings["${thing}"]`) : s.num(`stores["${thing}"]`);
  }

  costOf(thing: string): Cost {
    const item = CRAFTABLES[thing] ?? TRADE_GOODS[thing];
    return item.cost(this.count(thing, item));
  }

  needsWorkshop(item: Craftable): boolean {
    return item.type === 'weapon' || item.type === 'upgrade' || item.type === 'tool';
  }

  isMaxed(thing: string): boolean {
    const item = CRAFTABLES[thing] ?? TRADE_GOODS[thing];
    return item.maximum !== undefined && this.count(thing, item) >= item.maximum;
  }

  /** the original craftUnlocked(): reveals the option, notifying availableMsg once */
  craftUnlocked(thing: string): boolean {
    if (this.g.craftables && !this.g.craftables.has(thing)) return false;
    const s = this.g.store;
    if (this.revealed.has(thing)) return true;
    if (this.builderLevel < 4) return false;
    const item = CRAFTABLES[thing];
    if (this.needsWorkshop(item) && s.num('game.buildings["workshop"]') === 0) return false;
    const cost = this.costOf(thing);
    if (s.get(`game.buildings["${thing}"]`) > 0) {
      this.revealed.add(thing);
      return true;
    }
    if (s.num('stores.wood') < (cost.wood ?? 0) * 0.5) return false;
    for (const c in cost) {
      if (!s.get(`stores["${c}"]`)) return false;
    }
    this.revealed.add(thing);
    if (!s.get(`game.buildings["${thing}"]`)) this.g.notify('room', this.g.t(item.availableMsg ?? ''));
    this.g.bus.emit({ type: 'unlock', thing });
    return true;
  }

  buyUnlocked(thing: string): boolean {
    const s = this.g.store;
    if (this.revealed.has(thing)) return true;
    if (s.num('game.buildings["trading post"]') > 0) {
      if (thing === 'compass' || s.get(`stores["${thing}"]`) !== undefined) return true;
    }
    return false;
  }

  /** visible build / craft / buy options, in the original order */
  options(): { build: string[]; craft: string[]; buy: string[] } {
    const build: string[] = [];
    const craft: string[] = [];
    const buy: string[] = [];
    for (const k in CRAFTABLES) {
      if (this.craftUnlocked(k)) (this.needsWorkshop(CRAFTABLES[k]) ? craft : build).push(k);
    }
    for (const k in TRADE_GOODS) {
      if (this.buyUnlocked(k)) buy.push(k);
    }
    return { build, craft, buy };
  }

  /** notify maxMsg the first time an item reaches its maximum */
  refreshOptions(): void {
    const opts = this.options();
    for (const k of [...opts.build, ...opts.craft]) {
      if (this.isMaxed(k)) {
        if (!this.maxNotified.has(k)) {
          this.maxNotified.add(k);
          const msg = CRAFTABLES[k].maxMsg;
          if (msg) this.g.notify('room', this.g.t(msg));
        }
      }
    }
  }

  canAfford(cost: Cost): boolean {
    return Object.entries(cost).every(([k, v]) => this.g.store.num(`stores["${k}"]`) >= v);
  }

  build(thing: string): boolean {
    if (this.g.craftables && !this.g.craftables.has(thing)) return false;
    const s = this.g.store;
    const t = this.g.t;
    if (this.temperature <= 1) {
      this.g.notify('room', t('builder just shivers'));
      return false;
    }
    const item = CRAFTABLES[thing];
    if (!item || this.isMaxed(thing)) return false;
    const cost = this.costOf(thing);
    const mod: Cost = {};
    for (const k in cost) {
      const have = s.num(`stores["${k}"]`);
      if (have < cost[k]) {
        this.g.notify('room', t('not enough ' + k));
        return false;
      }
      mod[k] = have - cost[k];
    }
    s.setM('stores', mod);
    this.g.notify('room', t(item.buildMsg ?? ''));
    if (item.type === 'building') s.add(`game.buildings["${thing}"]`, 1);
    else s.add(`stores["${thing}"]`, 1);
    this.g.sfx(item.type === 'building' ? 'BUILD' : 'CRAFT');
    this.g.bus.emit({ type: 'build', thing });
    return true;
  }

  buy(thing: string): boolean {
    const s = this.g.store;
    const good = TRADE_GOODS[thing];
    if (!good || this.isMaxed(thing)) return false;
    const cost = this.costOf(thing);
    const mod: Cost = {};
    for (const k in cost) {
      const have = s.num(`stores["${k}"]`);
      if (have < cost[k]) {
        this.g.notify('room', this.g.t('not enough ' + k));
        return false;
      }
      mod[k] = have - cost[k];
    }
    s.setM('stores', mod);
    this.g.notify('room', good.buildMsg ? this.g.t(good.buildMsg) : undefined);
    s.add(`stores["${thing}"]`, 1);
    this.g.sfx('BUY');
    return true;
  }

  // ------------------------------------------------------------- reactions to state changes

  onStateUpdate(category: string, stateName: string): void {
    if (category === 'stores' || category === 'income' || stateName.startsWith('game.buildings') || category === 'all') {
      this.checkStores();
      this.refreshOptions();
    }
  }

  /** side effects of the original updateStoresView: thieves and the path */
  private checkStores(): void {
    const s = this.g.store;
    const stores = s.get('stores') || {};
    for (const k in stores) {
      if (typeof stores[k] !== 'number' || isNaN(stores[k])) s.set(`stores["${k}"]`, 0, true);
      if (s.get('game.thieves') === undefined && stores[k] > 5000 && s.get('features.location.world')) {
        this.g.startThieves();
      }
    }
    if (s.get('stores.compass') && !this.pathDiscovery) {
      this.pathDiscovery = true;
      this.g.path.openPath();
    }
  }
}
