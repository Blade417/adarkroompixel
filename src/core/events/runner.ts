/**
 * Event engine: interprets the original scene-graph content (random events, encounters,
 * setpieces, the Executioner) with the original rules. Port of the non-combat half of events.js.
 */
import { EVENTS } from '../data';
import type { Game } from '../game';
import type { TimerId } from '../clock';
import type { EventButton, EventScene, GameEventDef } from '../types';
import { Combat, type CombatSnapshot } from './combat';

/** the `Events` object the content scripts see and fill in */
export interface ContentEvents {
  Global: GameEventDef[];
  Room: GameEventDef[];
  Outside: GameEventDef[];
  Marketing: GameEventDef[];
  Encounters: GameEventDef[];
  Setpieces: Record<string, GameEventDef>;
  Executioner: Record<string, GameEventDef>;
  [key: string]: any;
}

export interface ActiveEvent {
  def: GameEventDef;
  sceneName: string;
  scene: EventScene;
  /** remaining loot on offer: item -> count */
  loot: Record<string, number> | null;
  combat: Combat | null;
  /** victory screen of a fight (deathMessage + loot + leave) */
  afterCombat: boolean;
}
export interface EventSnapshot {
  group: string; key: string; sceneName: string; loot: Record<string, number> | null;
  afterCombat: boolean; combat: CombatSnapshot | null;
}

export interface ButtonView {
  id: string;
  text: string;
  cost?: Record<string, number>;
  enabled: boolean;
  cooldown: number;
}

/** pick the next scene from a {probability: scene} map, exactly like the original */
export function pickScene(next: Record<string, string>, r: number): string | null {
  let lowest: number | null = null;
  for (const k in next) {
    const p = Number(k);
    if (r < p && (lowest === null || p < lowest)) lowest = p;
  }
  if (lowest === null) return null;
  for (const k in next) if (Number(k) === lowest) return next[k];
  return null;
}

export class EventRunner {
  content!: ContentEvents;
  stack: ActiveEvent[] = [];
  private pool: GameEventDef[] = [];
  private nextTimer: TimerId | null = null;
  private delayTimers: TimerId[] = [];

  constructor(private g: Game) {}

  init(content: ContentEvents): void {
    this.content = content;
    this.pool = [...content.Global, ...content.Room, ...content.Outside, ...content.Marketing];
    this.scheduleNextEvent();
    this.recallDelay('wait', content);
  }

  stop(): void {
    this.g.clock.clear(this.nextTimer);
    for (const t of this.delayTimers) this.g.clock.clear(t);
    this.delayTimers = [];
    this.active()?.combat?.clearTimeouts();
  }

  active(): ActiveEvent | null {
    return this.stack[0] ?? null;
  }

  snapshot(): EventSnapshot[] {
    return this.stack.map(ev => {
      for (const group of ['Global', 'Room', 'Outside', 'Marketing', 'Encounters', 'Setpieces', 'Executioner']) {
        const entries = Object.entries(this.content[group] as Record<string, GameEventDef>);
        const entry = entries.find(([, def]) => def === ev.def);
        if (entry) return { group, key: entry[0], sceneName: ev.sceneName, loot: ev.loot ? { ...ev.loot } : null,
          afterCombat: ev.afterCombat, combat: ev.combat?.snapshot() ?? null };
      }
      throw Error('Cannot save unknown event definition');
    });
  }

  resume(saved: EventSnapshot[]): void {
    for (const ev of this.stack) ev.combat?.clearTimeouts();
    // Restore scene references directly: onLoad/rewards/loot rolls must NEVER run twice.
    this.stack = saved.map(entry => {
      const def = this.content[entry.group]?.[entry.key] as GameEventDef | undefined;
      if (!def?.scenes[entry.sceneName]) throw Error('Unknown saved expedition scene');
      const ev: ActiveEvent = { def, sceneName: entry.sceneName, scene: def.scenes[entry.sceneName],
        loot: entry.loot ? { ...entry.loot } : null, afterCombat: entry.afterCombat, combat: null };
      if (entry.combat) { ev.combat = new Combat(this.g, this, ev.scene); ev.combat.resume(entry.combat); }
      return ev;
    });
    this.g.keyLock = this.stack.length > 0;
    this.g.tabNavigation = !this.g.keyLock;
    this.g.cooldowns.persistEnabled = !this.g.keyLock;
  }

  // ------------------------------------------------------------- scheduling

  scheduleNextEvent(scale?: number): void {
    const [lo, hi] = EVENTS.TIME_RANGE;
    let next = Math.floor(this.g.rng.random() * (hi - lo)) + lo;
    if (scale && scale > 0) next *= scale;
    this.nextTimer = this.g.clock.setTimeout(() => this.triggerEvent(), next * 60 * 1000);
  }

  triggerEvent(): void {
    if (!this.active()) {
      const possible = this.pool.filter((e) => e.isAvailable?.());
      if (possible.length === 0) {
        this.scheduleNextEvent(0.5);
        return;
      }
      this.startEvent(possible[Math.floor(this.g.rng.random() * possible.length)]);
    }
    this.scheduleNextEvent();
  }

  triggerFight(): void {
    const possible = this.content.Encounters.filter((e) => e.isAvailable?.());
    const fight = possible[Math.floor(this.g.rng.random() * possible.length)];
    this.startEvent(fight);
    if (possible.length > 0) {
      const d = this.g.world.getDistance();
      this.g.bus.emit({ type: 'audio', channel: 'eventMusic', key: d > 20 ? 'ENCOUNTER_TIER_3' : d > 10 ? 'ENCOUNTER_TIER_2' : 'ENCOUNTER_TIER_1' });
      this.g.bus.emit({ type: 'world:fight' });
    }
  }

  // ------------------------------------------------------------- lifecycle

  startEvent(def: GameEventDef | undefined): void {
    if (!def) return;
    if (def.audio) this.g.bus.emit({ type: 'audio', channel: 'eventMusic', key: this.g.audioKey(def.audio) });
    this.g.keyLock = true;
    this.g.tabNavigation = false;
    this.g.cooldowns.persistEnabled = false;
    this.stack.unshift({ def, sceneName: '', scene: {}, loot: null, combat: null, afterCombat: false });
    this.g.bus.emit({ type: 'event:start' });
    this.loadScene('start');
  }

  switchEvent(def: GameEventDef | undefined): void {
    if (!def) return;
    this.g.bus.emit({ type: 'audio', channel: 'stopEventMusic' });
    this.active()?.combat?.clearTimeouts();
    this.clearButtonCooldowns();
    this.stack.shift();
    this.startEvent(def);
  }

  endEvent(): void {
    const ev = this.active();
    if (!ev) return;
    ev.combat?.clearTimeouts();
    this.g.bus.emit({ type: 'audio', channel: 'stopEventMusic' });
    this.clearButtonCooldowns();
    this.stack.shift();
    this.g.keyLock = false;
    this.g.tabNavigation = true;
    this.g.cooldowns.persistEnabled = true;
    this.g.bus.emit({ type: 'event:end' });
  }

  loadScene(name: string): void {
    const ev = this.active()!;
    const scene = ev.def.scenes[name];
    this.clearButtonCooldowns();
    ev.combat?.clearTimeouts();
    ev.sceneName = name;
    ev.scene = scene;
    ev.loot = null;
    ev.combat = null;
    ev.afterCombat = false;
    scene.onLoad?.call(scene);
    if (this.active() !== ev) return; // onLoad switched or ended the event
    if (scene.notification) this.g.notify(null, scene.notification);
    if (scene.reward) this.g.store.addM('stores', scene.reward);
    if (scene.combat) {
      ev.combat = new Combat(this.g, this, scene);
      ev.combat.start();
    } else {
      if (scene.loot) ev.loot = this.rollLoot(scene.loot);
      this.startButtonCooldowns(scene.buttons);
    }
    this.g.bus.emit({ type: 'event:scene' });
  }

  // ------------------------------------------------------------- buttons

  private clearButtonCooldowns(): void {
    // event buttons never persist cooldowns; they are keyed under "event:" for the view
    for (const id of ['leaveBtn', ...Object.keys(this.active()?.scene.buttons ?? {})]) this.g.cooldowns.clear('event:' + id);
  }

  startButtonCooldowns(buttons: Record<string, EventButton> | undefined): void {
    for (const [id, b] of Object.entries(buttons ?? {})) {
      if (typeof b.cooldown === 'number') this.g.cooldowns.start('event:' + id, b.cooldown, false);
    }
  }

  /** costs with the glowstone exemption applied */
  private effectiveCost(b: EventButton): Record<string, number> {
    const cost = { ...(b.cost ?? {}) };
    if (this.g.path.outfit['glowstone']) delete cost.torch;
    return cost;
  }

  getQuantity(store: string): number {
    if (store === 'water') return this.g.world.water;
    if (store === 'hp') return this.g.world.health;
    const num = this.g.active === 'world' ? this.g.path.outfit[store] : this.g.store.num(`stores["${store}"]`);
    return typeof num !== 'number' || isNaN(num) || num < 0 ? 0 : num;
  }

  /** the scene's buttons as the player sees them (empty during an unresolved fight) */
  buttons(): ButtonView[] {
    const ev = this.active();
    if (!ev || (ev.combat && !ev.afterCombat)) return [];
    const scene = ev.scene;
    if (ev.afterCombat && !scene.buttons) {
      return [{ id: 'leaveBtn', text: this.g.t('leave'), enabled: !this.g.cooldowns.isCooling('event:leaveBtn'), cooldown: this.g.cooldowns.progress('event:leaveBtn') }];
    }
    return Object.entries(scene.buttons ?? {}).map(([id, b]) => {
      const cost = this.effectiveCost(b);
      let enabled = true;
      if (typeof b.available === 'function' && !b.available()) enabled = false;
      for (const k in cost) if (this.getQuantity(k) < cost[k]) enabled = false;
      if (this.g.cooldowns.isCooling('event:' + id)) enabled = false;
      return { id, text: b.text, cost: Object.keys(cost).length ? cost : undefined, enabled, cooldown: this.g.cooldowns.progress('event:' + id) };
    });
  }

  click(id: string, textarea?: string | null): boolean {
    const ev = this.active();
    if (!ev) return false;
    const view = this.buttons().find((b) => b.id === id);
    if (!view || !view.enabled) return false;

    if (id === 'leaveBtn' && ev.afterCombat && !ev.scene.buttons) {
      const next = ev.scene.nextScene;
      if (next && next !== 'end') this.loadScene(next);
      else this.endEvent();
      return true;
    }

    const info = ev.scene.buttons![id];
    const cost = this.effectiveCost(info);
    const costMod: Record<string, number> = {};
    for (const k in cost) {
      if (this.getQuantity(k) < cost[k]) return false;
      if (k === 'water') this.g.world.setWater(this.g.world.water - cost[k]);
      // bug fix: the original subtracted from an undefined World.hp, so hp costs were never paid
      else if (k === 'hp') this.g.world.setHp(this.g.world.health - cost[k]);
      else costMod[k] = -cost[k];
    }
    if (this.g.active === 'world') {
      for (const k in costMod) this.g.path.outfit[k] = (this.g.path.outfit[k] ?? 0) + costMod[k];
    } else if (Object.keys(costMod).length) {
      this.g.store.addM('stores', costMod);
    }

    if (typeof info.onChoose === 'function') info.onChoose(textarea ?? null);
    if (info.reward) this.g.store.addM('stores', info.reward);
    if (info.notification) this.g.notify(null, info.notification);
    info.onClick?.();
    if (this.active() !== ev) return true;

    if (info.link) {
      this.g.bus.emit({ type: 'event:update' });
      this.endEvent();
      return true;
    }
    if (info.nextEvent) {
      this.switchEvent(this.content.Setpieces[info.nextEvent] ?? this.content.Executioner[info.nextEvent]);
      return true;
    }
    if (info.nextScene) {
      if (info.nextScene === 'end') {
        this.endEvent();
      } else {
        const next = pickScene(info.nextScene, this.g.rng.random());
        if (next) this.loadScene(next);
        else this.endEvent();
      }
    }
    this.g.bus.emit({ type: 'event:update' });
    return true;
  }

  // ------------------------------------------------------------- loot

  rollLoot(list: NonNullable<EventScene['loot']>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const k in list) {
      const l = list[k];
      if (this.g.rng.random() < l.chance) {
        out[k] = Math.floor(this.g.rng.random() * (l.max - l.min)) + l.min;
      }
    }
    return out;
  }

  /** take up to `num` of a loot item, limited by free bag space; returns how many were taken */
  take(item: string, num = 1): number {
    const ev = this.active();
    if (!ev?.loot || !ev.loot[item]) return 0;
    const path = this.g.path;
    let taken = 0;
    while (taken < num && ev.loot[item] > 0 && path.weight(item) <= path.freeSpace()) {
      ev.loot[item]--;
      path.outfit[item] = (path.outfit[item] ?? 0) + 1;
      taken++;
    }
    if (ev.loot[item] === 0) delete ev.loot[item];
    if (taken) this.g.bus.emit({ type: 'event:update' });
    return taken;
  }

  takeAll(item: string): number {
    return this.take(item, Infinity);
  }

  /** whether everything on offer fits in the bag */
  canTakeEverything(): boolean {
    const ev = this.active();
    if (!ev?.loot) return false;
    let need = 0;
    for (const k in ev.loot) need += ev.loot[k] * this.g.path.weight(k);
    return need <= this.g.path.freeSpace();
  }

  /** take as much of everything as fits; also leaves if everything fitted and the scene has a single exit */
  takeEverything(): void {
    const ev = this.active();
    if (!ev?.loot) return;
    const all = this.canTakeEverything();
    for (const k of Object.keys(ev.loot)) this.takeAll(k);
    const buttons = this.buttons();
    if (all && buttons.length === 1 && buttons[0].enabled) this.click(buttons[0].id);
  }

  /** drop packed items back onto the loot pile to make room */
  drop(thing: string, num: number): void {
    const ev = this.active();
    const outfit = this.g.path.outfit;
    if (!ev || !outfit[thing]) return;
    const n = Math.min(num, outfit[thing]);
    outfit[thing] -= n;
    ev.loot = ev.loot ?? {};
    ev.loot[thing] = (ev.loot[thing] ?? 0) + n;
    this.g.bus.emit({ type: 'event:update' });
  }

  // ------------------------------------------------------------- delayed outcomes (Events.saveDelay)

  saveDelay(action: () => void, stateName: string, delay?: number | false): void {
    const s = this.g.store;
    const path = 'wait.' + stateName;
    if (delay) s.set(path, delay);
    else delay = s.num(path);
    const tick = this.g.clock.setInterval(() => s.set(path, s.num(path) - 0.5, true), 500);
    const done = this.g.clock.setTimeout(() => {
      this.g.clock.clear(tick);
      s.remove(path);
      s.removeBranch('wait');
      action();
    }, delay * 1000);
    this.delayTimers.push(tick, done);
  }

  /**
   * Resume delayed outcomes saved in state.wait by calling the stored action paths.
   * Bug fix: the content hard-codes paths like 'Room[4].scenes.wood100.action', but the wanderer
   * events moved to other indices when events were added, so the original silently dropped them
   * on reload. A path that no longer resolves is looked up by scene name within its group.
   */
  private recallDelay(stateName: string, content: ContentEvents): void {
    const s = this.g.store;
    const leaves: string[][] = [];
    const walk = (node: any, parts: string[]) => {
      for (const k of Object.keys(node ?? {})) {
        if (node[k] && typeof node[k] === 'object') walk(node[k], [...parts, k]);
        else leaves.push([...parts, k]);
      }
    };
    walk(s.get(stateName), []);
    for (const parts of leaves) {
      let owner: any = content;
      for (const p of parts.slice(0, -1)) owner = owner?.[p];
      const fnName = parts[parts.length - 1];
      if (!owner || typeof owner[fnName] !== 'function') {
        const [group, , scenesKey, scene] = parts;
        const list = content[group];
        owner = Array.isArray(list) && scenesKey === 'scenes'
          ? list.map((e: GameEventDef) => e.scenes?.[scene]).find((sc: any) => sc && typeof sc[fnName] === 'function')
          : undefined;
      }
      if (owner && typeof owner[fnName] === 'function') {
        owner[fnName]();
      } else {
        s.remove(`${stateName}.${parts.join('.')}`, true);
      }
    }
    s.removeBranch(stateName, true);
  }
}
