import type { Game } from '../core/game';
import { Outside } from '../core/locations/outside';
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
  /** First-trip hints follow completed actions, so reading the log never dismisses them. */
  get guideTarget(): 'door' | 'branches' | null {
    if (!this.unlocked) return null;
    if (this.outside) return this.game.store.get('game.pixel.foraged') ? null : 'branches';
    return this.game.store.get('game.outside.seenForest') ? null : 'door';
  }
  remaining(id: ForageId): number { return this.game.cooldowns.remaining(`pixel-forage-${id}`); }
  progress(id: ForageId): number { return 1 - this.game.cooldowns.progress(`pixel-forage-${id}`); }
  yieldFor(id: ForageId): number {
    // The original cart multiplies carrying capacity from 10 to 50; keep that ratio here.
    return FORAGE[id].wood * (this.game.store.num('game.buildings.cart') > 0 ? 5 : 1);
  }
  get trapCount(): number { return this.game.store.num('game.buildings.trap'); }
  get trapsRemaining(): number { return this.game.cooldowns.remaining(Outside.TRAPS_COOLDOWN); }
  checkTraps(): Record<string, number> | null {
    const g = this.game;
    if (g.over || !this.outside || !this.unlocked || g.keyLock || g.events.active()) return null;
    const drops = g.outside.checkTraps();
    if (drops) g.requestSave();
    return drops;
  }

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
    const wood = this.yieldFor(id);
    g.store.add('stores.wood', wood);
    if (!g.store.get('game.pixel.foraged')) g.store.set('game.pixel.foraged', true);
    g.notify('outside', uiStrings(g.i18n.lang)(id === 'branches' ? 'forest.branches.log' : 'forest.deadwood.log', wood));
    g.sfx('GATHER_WOOD');
    g.requestSave();
    return true;
  }
}
