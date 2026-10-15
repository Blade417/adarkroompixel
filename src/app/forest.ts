import type { Game } from '../core/game';
import { uiStrings } from '../ui/strings';

/** Small near-forest loop for the pixel edition; the original village rules remain separate. */
export const FORAGE = {
  branches: { wood: 4, seconds: 20 },
  deadwood: { wood: 8, seconds: 45 }
} as const;
export type ForageId = keyof typeof FORAGE;
export type ForestTarget = ForageId | 'home' | 'door';
export type PixelPlace = 'room' | 'outside';

export class ForestJourney {
  constructor(private readonly game: Game) {}

  get unlocked(): boolean { return this.game.outside.initialized; }
  get outside(): boolean { return this.game.active === 'outside'; }
  remaining(id: ForageId): number { return this.game.cooldowns.remaining(`pixel-forage-${id}`); }
  progress(id: ForageId): number { return 1 - this.game.cooldowns.progress(`pixel-forage-${id}`); }

  travel(place: PixelPlace): boolean {
    if (this.game.over || (place === 'outside' && !this.unlocked)) return false;
    if (!this.game.travelTo(place)) return false;
    this.game.store.set('game.pixel.location', place);
    return true;
  }

  /** Called after core startup: existing saves without this field continue in the room. */
  restoreLocation(): void {
    if (this.game.store.get('game.pixel.location') === 'outside' && this.unlocked) this.travel('outside');
  }

  gather(id: ForageId): boolean {
    const g = this.game;
    if (g.over || !this.outside || !this.unlocked || g.keyLock || g.events.active() || this.remaining(id) > 0) return false;
    const spec = FORAGE[id];
    g.cooldowns.start(`pixel-forage-${id}`, spec.seconds);
    g.store.add('stores.wood', spec.wood);
    g.notify('outside', uiStrings(g.i18n.lang)(id === 'branches' ? 'forest.branches.log' : 'forest.deadwood.log', spec.wood));
    g.sfx('GATHER_WOOD');
    g.requestSave();
    return true;
  }
}
