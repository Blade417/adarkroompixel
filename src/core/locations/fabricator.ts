/** Fabricator: wanderer technology built from alien alloy. Port of fabricator.js rules. */
import { FABRICATOR } from '../data';
import type { Game } from '../game';

export class Fabricator {
  readonly id = 'fabricator' as const;
  initialized = false;

  constructor(private g: Game) {}

  title(): string {
    return 'A Whirring Fabricator';
  }

  init(): void {
    if (!this.g.store.get('features.location.fabricator')) this.g.store.set('features.location.fabricator', true);
    this.initialized = true;
    this.g.bus.emit({ type: 'locations' });
  }

  onArrival(): void {
    if (!this.g.store.get('game.fabricator.seen')) {
      this.g.notify('fabricator', this.g.t('the familiar hum of wanderer machinery coming to life. finally, real tools.'));
      this.g.store.set('game.fabricator.seen', true);
    }
    this.g.music('MUSIC_SHIP');
  }

  canFabricate(thing: string): boolean {
    const item = FABRICATOR[thing];
    return Boolean(item) && (!item.blueprintRequired || Boolean(this.g.store.get(`character.blueprints['${thing}']`)));
  }

  /** recipes currently available */
  options(): string[] {
    return Object.keys(FABRICATOR).filter((k) => this.canFabricate(k));
  }

  blueprints(): string[] {
    const b = this.g.store.get('character.blueprints') || {};
    return Object.keys(b).filter((k) => b[k]);
  }

  isMaxed(thing: string): boolean {
    const item = FABRICATOR[thing];
    return item.maximum !== undefined && this.g.store.num(`stores["${thing}"]`) >= item.maximum;
  }

  fabricate(thing: string): boolean {
    const item = FABRICATOR[thing];
    if (!item || !this.canFabricate(thing)) return false;
    // bug fix: the original used Math.min(0, count), so the maximum was never enforced here
    if (this.isMaxed(thing)) return false;
    const s = this.g.store;
    const cost = item.cost(0);
    const mod: Record<string, number> = {};
    for (const [k, v] of Object.entries(cost)) {
      const have = s.num(`stores["${k}"]`);
      if (have < v) {
        this.g.notify('fabricator', this.g.t(`not enough ${k}`));
        return false;
      }
      mod[k] = have - v;
    }
    s.setM('stores', mod);
    s.add(`stores["${thing}"]`, item.quantity ?? 1);
    this.g.notify('fabricator', this.g.t(item.buildMsg ?? ''));
    this.g.sfx('CRAFT');
    this.g.bus.emit({ type: 'build', thing });
    return true;
  }
}
