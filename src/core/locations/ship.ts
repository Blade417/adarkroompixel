/** Ship: the crashed wanderer vessel — hull, engine, lift off. Port of ship.js rules. */
import { SHIP } from '../data';
import type { Game } from '../game';

export class Ship {
  readonly id = 'ship' as const;
  initialized = false;

  static readonly LIFTOFF_COOLDOWN = 'liftoffButton';

  constructor(private g: Game) {}

  title(): string {
    return 'An Old Starship';
  }

  get hull(): number {
    return this.g.store.num('game.spaceShip.hull');
  }

  get thrusters(): number {
    return this.g.store.num('game.spaceShip.thrusters');
  }

  init(): void {
    const s = this.g.store;
    if (!s.get('features.location.spaceShip')) {
      s.set('features.location.spaceShip', true);
      s.setM('game.spaceShip', { hull: SHIP.BASE_HULL, thrusters: SHIP.BASE_THRUSTERS });
    }
    this.initialized = true;
    this.g.bus.emit({ type: 'locations' });
  }

  onArrival(): void {
    if (!this.g.store.get('game.spaceShip.seenShip')) {
      this.g.notify('ship', this.g.t('somewhere above the debris cloud, the wanderer fleet hovers. been on this rock too long.'));
      this.g.store.set('game.spaceShip.seenShip', true);
    }
    this.g.music('MUSIC_SHIP');
  }

  reinforceHull(): boolean {
    const s = this.g.store;
    if (s.num('stores["alien alloy"]') < SHIP.ALLOY_PER_HULL) {
      this.g.notify('ship', this.g.t('not enough alien alloy'));
      return false;
    }
    s.add('stores["alien alloy"]', -SHIP.ALLOY_PER_HULL);
    s.add('game.spaceShip.hull', 1);
    this.g.sfx('REINFORCE_HULL');
    return true;
  }

  upgradeEngine(): boolean {
    const s = this.g.store;
    if (s.num('stores["alien alloy"]') < SHIP.ALLOY_PER_THRUSTER) {
      this.g.notify('ship', this.g.t('not enough alien alloy'));
      return false;
    }
    s.add('stores["alien alloy"]', -SHIP.ALLOY_PER_THRUSTER);
    s.add('game.spaceShip.thrusters', 1);
    this.g.sfx('UPGRADE_ENGINE');
    return true;
  }

  canLiftOff(): boolean {
    return this.hull > 0 && !this.g.cooldowns.isCooling(Ship.LIFTOFF_COOLDOWN) && !this.g.events.active();
  }

  /** first time asks for confirmation via an event, like the original */
  checkLiftOff(): boolean {
    if (!this.canLiftOff()) return false;
    this.g.cooldowns.start(Ship.LIFTOFF_COOLDOWN, SHIP.LIFTOFF_COOLDOWN);
    if (!this.g.store.get('game.spaceShip.seenWarning')) {
      const t = this.g.t;
      this.g.events.startEvent({
        title: t('Ready to Leave?'),
        scenes: {
          start: {
            text: [t("time to get out of this place. won't be coming back.")],
            buttons: {
              fly: {
                text: t('lift off'),
                nextScene: 'end',
                onChoose: () => {
                  this.g.store.set('game.spaceShip.seenWarning', true);
                  this.liftOff();
                }
              },
              wait: {
                text: t('linger'),
                nextScene: 'end',
                onChoose: () => this.g.cooldowns.clear(Ship.LIFTOFF_COOLDOWN)
              }
            }
          }
        }
      });
    } else {
      this.liftOff();
    }
    return true;
  }

  liftOff(): void {
    this.g.setActive('space');
    this.g.space.onArrival();
    this.g.sfx('LIFT_OFF');
  }
}
