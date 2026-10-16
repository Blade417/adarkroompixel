import type { Game } from '../core/game';
import { TILE, WEAPONS } from '../core/data';
import type { Direction } from '../core/locations/world';
import { EARLY_ENCOUNTERS } from './expedition-catalog';

export interface ExpeditionView {
  readonly game: Game;
  readonly trail: [number, number][];
  readonly direction: Direction;
  readonly phase: string;
  readonly encounter: { background: string };
  readonly displayWeapon: string;
  readonly lastStrike: { id: string; time: number } | null;
}

/** The live game's expedition. No resources, map overrides or guaranteed encounters. */
export class Expedition implements ExpeditionView {
  opened = false;
  paused = false;
  trail: [number, number][] = [];
  direction: Direction = 'south';
  wieldedWeapon = 'fists';
  lastStrike: { id: string; time: number } | null = null;
  receipt: Record<string, number> | null = null;
  private packed: Record<string, number> = {};

  constructor(readonly game: Game) {
    game.bus.on(event => {
      if (event.type === 'world:home') {
        this.receipt = Object.fromEntries([...new Set([...Object.keys(this.packed), ...Object.keys(event.returned)])]
          .map(id => [id, (event.returned[id] ?? 0) - (this.packed[id] ?? 0)])
          .filter(([, n]) => n !== 0));
        this.remember();
      }
      if (event.type === 'world:died') {
        game.store.set('game.pixel.expeditionDeath', true);
        this.remember();
      }
    });
  }

  restore(): void {
    const saved = this.game.store.get('game.pixel.expeditionView');
    if (saved) {
      this.trail = saved.trail ?? [];
      this.direction = saved.direction ?? 'south';
      this.wieldedWeapon = saved.weapon ?? 'fists';
      this.packed = saved.packed ?? {};
      this.receipt = saved.receipt ?? null;
    }
    this.opened = this.game.active === 'world';
    this.paused = this.opened;
  }

  private remember(): void {
    this.game.store.set('game.pixel.expeditionView', {
      trail: this.trail.slice(-500), direction: this.direction, weapon: this.wieldedWeapon,
      packed: { ...this.packed }, receipt: this.receipt
    });
  }

  get phase(): 'pack' | 'world' | 'combat' | 'event' | 'loot' | 'home' | 'dead' {
    if (this.game.world.dead || this.game.store.get('game.pixel.expeditionDeath')) return 'dead';
    const ev = this.game.events.active();
    if (ev?.afterCombat) return 'loot';
    if (ev?.combat) return 'combat';
    if (ev) return 'event';
    if (this.game.active === 'world') {
      return 'world';
    }
    return this.receipt ? 'home' : 'pack';
  }

  get encounter(): { background: string } {
    const enemy = this.game.events.active()?.scene.enemy;
    return EARLY_ENCOUNTERS.find(e => e.id === enemy) ?? {
      background: this.game.active === 'world' && this.game.world.getTerrain() === TILE.FIELD ? 'field-background'
        : this.game.active === 'world' && this.game.world.getTerrain() === TILE.BARRENS ? 'barrens-background' : 'background'
    };
  }

  get displayWeapon(): string {
    const combat = this.game.events.active()?.combat;
    const choices = combat ? combat.attacks().filter(a => !a.cost || Object.entries(a.cost).every(([id, n]) => (this.game.path.outfit[id] ?? 0) >= n)).map(a => a.id)
      : Object.keys(WEAPONS).filter(id => (this.game.path.outfit[id] ?? 0) > 0);
    return choices.includes(this.wieldedWeapon) ? this.wieldedWeapon : choices[0] ?? 'fists';
  }

  open(): boolean {
    if (this.opened) return true;
    if (!this.game.path.initialized || this.game.events.active()) return false;
    if (!this.game.travelTo('path')) return false;
    this.opened = true; this.paused = false;
    return true;
  }

  close(): boolean {
    if (this.game.active === 'world' || this.game.events.active()) return false;
    this.game.world.dead = false;
    this.game.store.remove('game.pixel.expeditionDeath');
    this.receipt = null; this.opened = false; this.paused = false;
    this.remember();
    this.game.travelTo('room');
    this.game.store.set('game.pixel.location', 'room');
    this.game.saveNow();
    return true;
  }

  prepareAgain(): void {
    if (this.phase !== 'home' && this.phase !== 'dead') return;
    this.game.world.dead = false;
    this.game.store.remove('game.pixel.expeditionDeath');
    this.receipt = null; this.paused = false;
    this.game.travelTo('path'); this.remember();
  }

  pack(id: string, delta: number): void {
    if (this.paused || this.phase !== 'pack') return;
    if (!this.game.path.carryable().some(item => item.name === id)) return;
    if (delta > 0) this.game.path.increaseSupply(id, delta);
    else this.game.path.decreaseSupply(id, -delta);
  }

  depart(): boolean {
    if (this.paused || this.phase !== 'pack' || this.game.events.active()) return false;
    this.game.path.updateOutfitting();
    this.packed = { ...this.game.path.outfit };
    if (!this.game.path.embark()) return false;
    this.receipt = null; this.trail = [[...this.game.world.curPos]];
    this.remember(); this.game.saveNow();
    return true;
  }

  move(direction: Direction): boolean {
    if (this.paused || this.phase !== 'world' || !this.game.world.move(direction)) return false;
    this.direction = direction; this.trail.push([...this.game.world.curPos]);
    if (this.trail.length > 500) this.trail.splice(0, this.trail.length - 500);
    this.remember(); this.game.saveNow();
    return true;
  }

  attack(id: string): boolean {
    if (this.paused || this.phase !== 'combat' || !this.game.events.active()?.combat?.attack(id)) return false;
    this.wieldedWeapon = id; this.lastStrike = { id, time: this.game.clock.now };
    this.remember(); this.game.saveNow();
    return true;
  }
}
