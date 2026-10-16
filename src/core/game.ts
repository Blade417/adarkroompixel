/**
 * Game: the headless core. Owns state, time, rules and content; knows nothing about rendering.
 * The presentation layer drives it with intents (room.tendFire(), world.move('north'), ...) and
 * advances time with tick(ms); it observes it through `bus` events and by reading state.
 */
import { Clock } from './clock';
import { Cooldowns } from './cooldowns';
import { PERKS, PRESTIGE_STORES, SCORE_FACTORS, TILE, WORLD } from './data';
import { Emitter } from './emitter';
import { I18n, type Dictionary, type Language } from './i18n';
import { Notifications } from './notifications';
import { mathRng, type Rng } from './rng';
import { MemoryStorage, SAVE_KEY, SAVE_VERSION, decodeSave, encodeSave, type StorageLike } from './save';
import { Store, type StateTree, type StateUpdate } from './store';
import type { ContentSources, GameEvent, LocationId } from './types';
import { loadContent, type LoadedContent } from './content/loader';
import { EventRunner } from './events/runner';
import { Room } from './locations/room';
import { Outside } from './locations/outside';
import { Path } from './locations/path';
import { World } from './locations/world';
import { Fabricator } from './locations/fabricator';
import { Ship } from './locations/ship';
import { Space } from './locations/space';
import type { TimerId } from './clock';

export interface GameOptions {
  /** Optional recipe scope for editions that implement only part of the original game. */
  craftables?: readonly string[];
  content: ContentSources;
  storage?: StorageLike;
  rng?: Rng;
  language?: Language;
  dictionaries?: Partial<Record<Language, Dictionary[]>>;
  /** start from this state instead of the stored save */
  state?: StateTree;
  autoSave?: boolean;
}

export interface Income {
  delay: number;
  stores: Record<string, number>;
  timeLeft?: number;
}

/** tab order of the original header */
const TAB_ORDER: LocationId[] = ['room', 'outside', 'path', 'fabricator', 'ship'];

export class Game {
  readonly craftables: ReadonlySet<string> | undefined;
  readonly store = new Store();
  readonly clock = new Clock();
  readonly i18n = new I18n();
  readonly bus = new Emitter<GameEvent>();
  /** swappable so tests can pin rolls after setup */
  rng: Rng;
  readonly storage: StorageLike;
  readonly notifications: Notifications;
  readonly cooldowns: Cooldowns;

  readonly room: Room;
  readonly outside: Outside;
  readonly path: Path;
  readonly world: World;
  readonly fabricator: Fabricator;
  readonly ship: Ship;
  readonly space: Space;
  readonly events: EventRunner;
  readonly content: LoadedContent;

  active: LocationId | null = null;
  /** true while an event panel is open (no travelling) */
  keyLock = false;
  tabNavigation = true;
  /** the game has been won; state is reset to the prestige data */
  over = false;
  started = false;

  private autoSave: boolean;
  private saveTimer: TimerId | null = null;
  private incomeTimer: TimerId | null = null;
  private initialState?: StateTree;

  readonly t = (key: string, ...args: unknown[]): string => this.i18n.t(key, ...args);

  constructor(opts: GameOptions) {
    this.craftables = opts.craftables ? new Set(opts.craftables) : undefined;
    this.rng = opts.rng ?? mathRng;
    this.storage = opts.storage ?? new MemoryStorage();
    this.autoSave = opts.autoSave ?? true;
    this.initialState = opts.state;
    for (const [lang, dicts] of Object.entries(opts.dictionaries ?? {}) as [Language, Dictionary[]][]) {
      for (const d of dicts) this.i18n.addDictionary(lang, d);
    }
    this.i18n.setLanguage(opts.language ?? 'en');
    this.notifications = new Notifications(() => this.active, () => this.clock.now, (s) => this.i18n.terminate(s));
    this.cooldowns = new Cooldowns(this.clock, this.store);
    this.room = new Room(this);
    this.outside = new Outside(this);
    this.path = new Path(this);
    this.world = new World(this);
    this.fabricator = new Fabricator(this);
    this.ship = new Ship(this);
    this.space = new Space(this);
    this.events = new EventRunner(this);
    this.content = loadContent(this, opts.content);
    this.bus.on(e => {
      if (['world:move', 'world:home', 'world:died', 'combat:attack', 'combat:end', 'event:scene', 'event:update'].includes(e.type)) this.requestSave();
    });
  }

  // ------------------------------------------------------------- startup (Engine.init)

  start(): void {
    if (this.started) return;
    this.started = true;
    this.store.state = this.initialState ? structuredClone(this.initialState) : this.loadSaved() ?? {};
    // a brand-new game (or the prestige-only state left after an ending) starts at the current version;
    // a save without a version is a 1.0 save and goes through the migrations
    if (this.store.state.version === undefined && !this.store.state.stores) this.store.set('version', SAVE_VERSION, true);
    this.migrate();
    this.store.init();
    this.store.onDirty = () => this.requestSave();
    this.store.subscribe((e) => this.onState(e));

    const s = this.store;
    this.events.init(this.content.events);
    this.room.init();
    if (s.get('stores.wood') !== undefined) this.outside.init();
    if (s.num('stores.compass') > 0) this.path.init();
    if (s.get('features.location.fabricator')) this.fabricator.init();
    if (s.get('features.location.spaceShip')) this.ship.init();
    this.cooldowns.restore();
    this.incomeTimer = this.clock.setTimeout(() => this.collectIncome(), 1000);
    this.travelTo('room');
    this.room.refreshOptions();
    const expedition = s.get('runtime.expedition');
    if (expedition?.version === 1 && expedition.world?.state) {
      this.path.init();
      this.world.resume(expedition.world);
      this.active = 'world';
      this.events.resume(expedition.events);
      this.cooldowns.resume(expedition.cooldowns);
      this.music('MUSIC_WORLD');
    }
  }

  /** advance game time */
  tick(ms: number): void {
    this.clock.advance(ms);
  }

  private onState(e: StateUpdate): void {
    this.room.onStateUpdate(e.category, e.stateName);
    this.outside.onStateUpdate(e.category, e.stateName);
    this.bus.emit({ type: 'state', category: e.category, stateName: e.stateName });
  }

  // ------------------------------------------------------------- locations

  locationObject(id: LocationId): Room | Outside | Path | World | Fabricator | Ship | Space {
    return this[id];
  }

  /** locations reachable from the header tabs, in order */
  tabs(): LocationId[] {
    return TAB_ORDER.filter((id) => id === 'room' || (this[id] as { initialized: boolean }).initialized);
  }

  title(id: LocationId = this.active ?? 'room'): string {
    return this.t(this.locationObject(id).title());
  }

  canTravel(): boolean {
    return !this.keyLock && !this.events.active() && this.active !== 'world' && this.active !== 'space' && this.tabs().length > 1;
  }

  travelTo(id: LocationId): boolean {
    if (this.active === id) return false;
    if (this.active !== null && (!this.canTravel() || !this.tabs().includes(id))) return false;
    this.setActive(id);
    return true;
  }

  /** low-level location switch used by travel and by scripted transitions (death, home, crash) */
  setActive(id: LocationId): void {
    const from = this.active;
    this.active = id;
    this.bus.emit({ type: 'location', from, to: id });
    if (id !== 'world' && id !== 'space') (this.locationObject(id) as { onArrival(): void }).onArrival();
    this.notifications.printQueue(id);
  }

  // ------------------------------------------------------------- shared services

  notify(location: LocationId | null, text: string | undefined, noQueue?: boolean): void {
    this.notifications.notify(location, text, noQueue);
    this.requestSave();
  }

  music(key: string): void {
    this.bus.emit({ type: 'audio', channel: 'music', key });
  }

  sfx(key: string): void {
    this.bus.emit({ type: 'audio', channel: 'sfx', key });
  }

  /** AudioLibrary key for an audio file path used by content */
  audioKey(path: string): string {
    for (const k in this.content.audio) if (this.content.audio[k] === path) return k;
    return path;
  }

  addPerk(name: string): void {
    this.store.set(`character.perks["${name}"]`, true);
    const perk = PERKS[name];
    if (perk) this.notify(null, this.t(perk.notify));
  }

  hasPerk(name: string): boolean {
    return Boolean(this.store.get(`character.perks["${name}"]`));
  }

  perks(): string[] {
    const p = this.store.get('character.perks') || {};
    return Object.keys(p).filter((k) => p[k]);
  }

  // ------------------------------------------------------------- income ($SM income functions)

  setIncome(source: string, options: Income): void {
    const existing = this.store.get(`income["${source}"]`);
    if (existing !== undefined) options.timeLeft = existing.timeLeft;
    this.store.set(`income["${source}"]`, options);
  }

  getIncome(source: string): Partial<Income> {
    return this.store.get(`income["${source}"]`) ?? {};
  }

  /** net change per second of every store from all income sources */
  netIncome(): Record<string, number> {
    const net: Record<string, number> = {};
    const income = this.store.get('income') || {};
    for (const src in income) {
      const e = income[src];
      if (!e?.stores || !e.delay) continue;
      for (const k in e.stores) net[k] = (net[k] ?? 0) + e.stores[k] / e.delay;
    }
    return net;
  }

  private collectIncome(): void {
    const s = this.store;
    let changed = false;
    const income = s.get('income');
    if (income !== undefined && this.active !== 'space') {
      for (const source in income) {
        const inc = income[source];
        if (typeof inc.timeLeft !== 'number') inc.timeLeft = 0;
        inc.timeLeft--;
        if (inc.timeLeft <= 0) {
          if (source === 'thieves') this.addStolen(inc.stores);
          let ok = true;
          if (source !== 'thieves') {
            for (const k in inc.stores) {
              if (s.num(`stores["${k}"]`) + inc.stores[k] < 0) {
                ok = false;
                break;
              }
            }
          }
          if (ok) s.addM('stores', inc.stores, true);
          changed = true;
          if (typeof inc.delay === 'number') inc.timeLeft = inc.delay;
        }
      }
    }
    if (changed) {
      s.fireUpdate('income');
      this.requestSave();
    }
    this.incomeTimer = this.clock.setTimeout(() => this.collectIncome(), 1000);
  }

  startThieves(): void {
    this.store.set('game.thieves', 1);
    this.setIncome('thieves', { delay: 10, stores: { wood: -10, fur: -5, meat: -5 } });
  }

  private addStolen(stores: Record<string, number>): void {
    for (const k in stores) {
      const short = this.store.num(`stores["${k}"]`) + stores[k];
      this.store.add(`game.stolen["${k}"]`, short < 0 ? -stores[k] + short : -stores[k]);
    }
  }

  // ------------------------------------------------------------- prestige & score

  prestigeStores(reduce: boolean): number[] {
    const rand = (type: 'g' | 'w' | 'a'): number => {
      let amount: number;
      if (type === 'g') amount = Math.floor(this.rng.random() * 10);
      else if (type === 'w') amount = Math.floor(Math.floor(this.rng.random() * 10) / 2);
      else amount = Math.ceil(this.rng.random() * 10 * Math.ceil(this.rng.random() * 10));
      return amount !== 0 ? amount : 1;
    };
    return PRESTIGE_STORES.map((p) => Math.floor(this.store.num(`stores["${p.store}"]`) / (reduce ? rand(p.type) : 1)));
  }

  calculateScore(): number {
    const stores = this.prestigeStores(false);
    let score = 0;
    SCORE_FACTORS.forEach((f, i) => (score += stores[i] * f));
    score += this.store.num('stores["alien alloy"]') * 10;
    score += this.store.num('stores["fleet beacon"]') * 500;
    score += this.ship.hull * 50;
    return Math.floor(score);
  }

  /** the destroyed village: hand back what the previous generation left */
  collectPrestige(): void {
    const prev = this.store.get('previous.stores');
    if (Array.isArray(prev) && prev.length) {
      const toAdd: Record<string, number> = {};
      PRESTIGE_STORES.forEach((p, i) => (toAdd[p.store] = prev[i]));
      this.store.addM('stores', toAdd);
      this.store.set('previous.stores', [], true);
    }
  }

  /** the ascent succeeded: score, pass on the prestige, end this game */
  finish(): void {
    if (this.over) return;
    this.over = true;
    const expansion = this.store.num('stores["fleet beacon"]') > 0;
    const score = this.calculateScore();
    const total = this.store.num('previous.score') + score;
    this.store.set('playStats.score', score, true);
    this.store.set('previous.stores', this.prestigeStores(true), true);
    this.store.set('previous.score', total, true);
    this.stop();
    this.music('MUSIC_ENDING');
    this.deleteSave(true);
    this.bus.emit({ type: 'ending', score, total, expansion });
  }

  /** stop every running system (ending / disposal) */
  stop(): void {
    this.room.stop();
    this.outside.stop();
    this.events.stop();
    this.clock.clear(this.incomeTimer);
    this.clock.clear(this.saveTimer);
    this.saveTimer = null;
    this.cooldowns.clearAll();
  }

  // ------------------------------------------------------------- saving

  requestSave(): void {
    if (!this.autoSave || this.over || this.saveTimer !== null || !this.started) return;
    this.saveTimer = this.clock.setTimeout(() => {
      this.saveTimer = null;
      this.saveNow();
    }, 250, true);
  }

  saveNow(): void {
    if (this.over) return;
    if (this.path.initialized) this.store.set('outfit', { ...this.path.outfit }, true);
    const world = this.active === 'world' ? this.world.snapshot() : null;
    if (world) this.store.set('runtime.expedition', { version: 1, world, events: this.events.snapshot(),
      cooldowns: this.cooldowns.snapshot(['combat:', 'event:']) }, true);
    else this.store.remove('runtime.expedition', true);
    this.storage.setItem(SAVE_KEY, JSON.stringify(this.store.state));
  }

  private loadSaved(): StateTree | null {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  exportCode(): string {
    this.saveNow();
    return encodeSave(this.storage.getItem(SAVE_KEY) ?? '{}');
  }

  /** validate an export code and store it as the save; the caller restarts the game */
  importCode(code: string): boolean {
    const state = decodeSave(code);
    if (!state) return false;
    this.storage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  }

  /** wipe the save; prestige (score and the previous generation's stores) survives */
  deleteSave(keepPrestige = true): void {
    const previous = keepPrestige ? this.store.get('previous') : undefined;
    const fresh: StateTree = previous ? { previous: structuredClone(previous) } : {};
    this.storage.setItem(SAVE_KEY, JSON.stringify(fresh));
  }

  /** port of StateManager.updateOldState */
  private migrate(): void {
    const s = this.store;
    let version = s.get('version');
    if (typeof version !== 'number') version = 1.0;
    if (version === 1.0) {
      s.remove('outside.workers.hunter', true);
      s.remove('income.hunter', true);
      version = 1.1;
    }
    if (version === 1.1) {
      if (s.get('world')) {
        this.world.placeLandmark(15, WORLD.RADIUS * 1.5, TILE.SWAMP, s.get('world.map'));
      }
      version = 1.2;
    }
    if (version === 1.2) {
      s.remove('room.fire', true);
      s.remove('room.temperature', true);
      s.remove('room.buttons', true);
      if (s.get('room')) {
        s.set('features.location.room', true, true);
        s.set('game.builder.level', s.get('room.builder'), true);
        s.remove('room', true);
      }
      if (s.get('outside')) {
        s.set('features.location.outside', true, true);
        s.set('game.population', s.get('outside.population'), true);
        s.set('game.buildings', s.get('outside.buildings'), true);
        s.set('game.workers', s.get('outside.workers'), true);
        s.set('game.outside.seenForest', s.get('outside.seenForest'), true);
        s.remove('outside', true);
      }
      if (s.get('world')) {
        s.set('features.location.world', true, true);
        s.set('game.world.map', s.get('world.map'), true);
        s.set('game.world.mask', s.get('world.mask'), true);
        s.set('character.starved', s.num('character.starved'), true);
        s.set('character.dehydrated', s.num('character.dehydrated'), true);
        s.remove('world', true);
      }
      if (s.get('ship')) {
        s.set('features.location.spaceShip', true, true);
        s.set('game.spaceShip.hull', s.num('ship.hull'), true);
        s.set('game.spaceShip.thrusters', s.num('ship.thrusters'), true);
        s.set('game.spaceShip.seenWarning', s.get('ship.seenWarning'), true);
        s.set('game.spaceShip.seenShip', s.get('ship.seenShip'), true);
        s.remove('ship', true);
      }
      for (const [from, to] of [['punches', 'character.punches'], ['perks', 'character.perks'], ['thieves', 'game.thieves'], ['stolen', 'game.stolen'], ['cityCleared', 'character.cityCleared']]) {
        if (s.get(from)) {
          s.set(to, s.get(from), true);
          s.remove(from, true);
        }
      }
      version = 1.3;
    }
    s.set('version', version, true);
  }
}
