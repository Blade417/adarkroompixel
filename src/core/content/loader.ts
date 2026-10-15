/**
 * Loads the original content scripts (original/script/events/*.js, audioLibrary.js) unchanged.
 * Each file runs in a function scope that provides the ~30 engine interfaces it uses
 * (see docs/06 §6.4), backed by the new core.
 */
import type { Game } from '../game';
import type { ContentSources, LocationId } from '../types';
import type { ContentEvents } from '../events/runner';

export interface LoadedContent {
  events: ContentEvents;
  audio: Record<string, string>;
  enemies: Record<string, any>;
}

const CONTENT_ORDER: (keyof ContentSources)[] = ['global', 'room', 'outside', 'encounters', 'setpieces', 'marketing', 'executioner'];

function run(src: string, scope: Record<string, unknown>, returnExpr = 'undefined'): any {
  const names = Object.keys(scope);
  const fn = new Function(...names, `${src}\n;return (${returnExpr});`);
  return fn(...names.map((n) => scope[n]));
}

export function loadContent(g: Game, sources: ContentSources): LoadedContent {
  const audio = run(sources.audioLibrary, {}, 'typeof AudioLibrary !== "undefined" ? AudioLibrary : {}') as Record<string, string>;

  const events: ContentEvents = {
    Global: [], Room: [], Outside: [], Marketing: [], Encounters: [], Setpieces: {}, Executioner: {},
    _LEAVE_COOLDOWN: 1,
    _lastSpecial: undefined,
    setStatus: (fighter: any, status: any) => g.events.active()?.combat?.setStatus(fighter, status),
    saveDelay: (action: () => void, stateName: string, delay?: number | false) => g.events.saveDelay(action, stateName, delay)
  };

  const s = g.store;
  const $SM = {
    get: (p: string, z?: boolean) => s.get(p, z),
    set: (p: string, v: unknown, n?: boolean) => s.set(p, v, n),
    add: (p: string, v: number, n?: boolean) => s.add(p, v, n),
    setM: (p: string, l: Record<string, unknown>, n?: boolean) => s.setM(p, l, n),
    addM: (p: string, l: Record<string, number>, n?: boolean) => s.addM(p, l, n),
    remove: (p: string, n?: boolean) => s.remove(p, n),
    removeBranch: (p: string, n?: boolean) => s.removeBranch(p, n),
    addPerk: (name: string) => g.addPerk(name),
    hasPerk: (name: string) => g.hasPerk(name),
    setIncome: (src: string, o: any) => g.setIncome(src, o),
    getIncome: (src: string) => g.getIncome(src)
  };

  const Engine = {
    get activeModule() {
      return g.active ? g.locationObject(g.active) : null;
    }
  };

  const Notifications = {
    notify: (module: { id?: LocationId } | null, text: string, noQueue?: boolean) => g.notify(module?.id ?? null, text, noQueue)
  };

  const win: Record<string, any> = {};
  // content rolls dice with Math.random(); route it through the game's (seedable) rng
  const ContentMath = Object.assign(Object.create(Math), { random: () => g.rng.random() });
  const scope: Record<string, unknown> = {
    _: g.t,
    Math: ContentMath,
    Events: events,
    $SM,
    World: g.world,
    Room: g.room,
    Outside: g.outside,
    Path: g.path,
    Ship: g.ship,
    Engine,
    Notifications,
    Prestige: { collectStores: () => g.collectPrestige() },
    AudioLibrary: audio,
    window: win,
    Enemies: undefined
  };

  let enemies: Record<string, any> = {};
  for (const key of CONTENT_ORDER) {
    const result = run(sources[key], scope, 'typeof Enemies !== "undefined" ? Enemies : undefined');
    if (result) {
      enemies = result;
      win.Enemies = result;
      scope.Enemies = result;
    }
  }
  return { events, audio, enemies };
}
