import type { Game } from '../core/game';
import { FABRICATOR, SHIP } from '../core/data';
import { SAVE_KEY } from '../core/save';

export interface Ending { score: number; total: number; expansion: boolean }
export type EndgamePlace = 'fabricator' | 'ship';

/** Original space.js beacon outro, with line breaks represented as paragraphs. */
export const BEACON_OUTRO = [
  'the beacon pulses gently as the ship glides through space. coordinates are locked. nothing to do but wait.',
  'the beacon glows a solid blue, and then goes dim. the ship slows. gradually, the vast wanderer homefleet comes into view. massive worldships drift unnaturally through clouds of debris, scarred and dead.',
  'the air is running out.',
  'the capsule is cold.'
];

export const FABRICATOR_PURPOSES: Record<string, string> = {
  'energy blade': 'A powerful melee weapon. Pack it before leaving.',
  'fluid recycler': 'Increases expedition water capacity. Works while owned.',
  'cargo drone': 'Increases expedition carrying capacity. Works while owned.',
  'kinetic armour': 'Increases maximum health and enables the combat shield. Works while owned.',
  disruptor: 'Stuns enemies without consuming ammunition. Pack it before leaving.',
  hypo: 'Restores health in combat. Pack the injections before leaving.',
  stim: 'Temporarily speeds up attacks in combat. Consumed on use.',
  'plasma rifle': 'A powerful ranged weapon. Uses energy cells.',
  glowstone: 'Lights dark places without consuming torches when carried.'
};

/** UI intents use the original rules; this adapter owns only navigation, pause and feedback. */
export class Endgame {
  paused = false;
  ending: Ending | null = null;
  crashed = false;

  constructor(readonly game: Game) {
    game.bus.on(event => {
      if (event.type === 'ending') this.ending = { score: event.score, total: event.total, expansion: event.expansion };
      if (event.type === 'space:crash') {
        this.crashed = true; this.paused = false;
        game.store.set('game.pixel.endgame', 'ship');
      }
      if (event.type === 'space:start') { this.crashed = false; this.paused = false; }
    });
  }

  get opened(): boolean {
    return Boolean(this.ending) || this.game.active === 'fabricator' || this.game.active === 'ship' || this.game.active === 'space';
  }
  get flying(): boolean { return this.game.active === 'space' && !this.game.over; }

  restore(): void {
    const g = this.game;
    this.ending = g.store.get('previous.ending') ?? null;
    if (this.ending) { g.stop(); g.over = true; g.music('MUSIC_ENDING'); return; }
    if (this.flying) { this.pause(); return; }
    const place = g.store.get('game.pixel.endgame');
    if (place === 'fabricator' || place === 'ship') this.open(place);
  }

  open(place: EndgamePlace): boolean {
    const g = this.game;
    if (g.over || !g.tabs().includes(place) || !g.canTravel()) return false;
    if (g.active !== place && !g.travelTo(place)) return false;
    g.store.set('game.pixel.endgame', place);
    g.saveNow();
    return true;
  }

  leave(): void { this.game.store.remove('game.pixel.endgame'); }
  pause(): void { if (this.flying) { this.paused = true; this.game.space.clearInput(); } }
  togglePause(): void { if (this.flying) { this.paused = !this.paused; this.game.space.clearInput(); this.game.saveNow(); } }

  private enabled(place: EndgamePlace): boolean {
    const g = this.game;
    return !g.over && !this.paused && g.active === place && !g.keyLock && !g.events.active();
  }

  fabricate(id: string): boolean {
    if (!this.enabled('fabricator')) return false;
    const ok = this.game.fabricator.fabricate(id);
    if (ok) this.game.saveNow();
    return ok;
  }

  upgrade(kind: 'hull' | 'engine'): boolean {
    if (!this.enabled('ship')) return false;
    const ok = kind === 'hull' ? this.game.ship.reinforceHull() : this.game.ship.upgradeEngine();
    if (ok) this.game.saveNow();
    return ok;
  }

  launch(): boolean {
    if (!this.enabled('ship')) return false;
    const ok = this.game.ship.checkLiftOff();
    this.game.saveNow();
    return ok;
  }

  recipes(): { id: string; available: boolean; maxed: boolean; cost: Record<string, number>; missing: Record<string, number> }[] {
    const g = this.game;
    return Object.entries(FABRICATOR).map(([id, item]) => {
      const cost = item.cost(0);
      return { id, cost, available: g.fabricator.canFabricate(id), maxed: g.fabricator.isMaxed(id),
        missing: Object.fromEntries(Object.entries(cost).filter(([key, amount]) => g.store.num(`stores["${key}"]`) < amount)
          .map(([key, amount]) => [key, amount - g.store.num(`stores["${key}"]`)])) };
    });
  }

  canUpgrade(kind: 'hull' | 'engine'): boolean {
    return this.enabled('ship') && this.game.store.num('stores["alien alloy"]') >= (kind === 'hull' ? SHIP.ALLOY_PER_HULL : SHIP.ALLOY_PER_THRUSTER);
  }

  /** Acknowledge only the saved ending; keep the original score and inheritance payload. */
  nextGeneration(): boolean {
    if (!this.ending) return false;
    const saved = JSON.parse(this.game.storage.getItem(SAVE_KEY) ?? '{}');
    if (!saved.previous) return false;
    delete saved.previous.ending;
    this.game.storage.setItem(SAVE_KEY, JSON.stringify({ previous: saved.previous }));
    return true;
  }
}
