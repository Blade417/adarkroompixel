import type { ExpeditionView } from './expedition';

/** Presentation metadata only. Ownership and armour priority come from Path. */
export const ARMOUR_RIGS: Record<string, string> = {
  none: 'body', leather: 'armour-leather', iron: 'armour-iron', steel: 'armour-steel', kinetic: 'armour-kinetic'
};

export const ARMOUR_NAMES: Record<string, string> = {
  none: 'No armour', leather: 'l armour', iron: 'i armour', steel: 's armour', kinetic: 'kinetic armour'
};

export function visibleWeapon(view: Pick<ExpeditionView, 'game' | 'displayWeapon' | 'lastStrike'>): string {
  const age = view.lastStrike ? view.game.clock.now - view.lastStrike.time : Infinity;
  return view.game.events.active()?.combat && age >= 0 && age < 320 ? view.lastStrike!.id : view.displayWeapon;
}

export type Projectile = 'bullet' | 'laser' | 'plasma' | 'disruptor' | 'grenade' | 'bolas';
export interface WeaponRig {
  restAngle: number;
  grip: number;
  gripY: number;
  projectile?: Projectile;
  thrown?: boolean;
}
const sword = { restAngle: -.85, grip: .22, gripY: .55 };
export const WEAPON_RIGS: Record<string, WeaponRig> = {
  'bone spear': { ...sword, grip: .35 },
  'iron sword': sword, 'steel sword': sword,
  bayonet: { ...sword, grip: .24 },
  rifle: { restAngle: -.12, grip: .38, gripY: .55, projectile: 'bullet' },
  'laser rifle': { restAngle: -.08, grip: .31, gripY: .73, projectile: 'laser' },
  'plasma rifle': { restAngle: -.08, grip: .31, gripY: .74, projectile: 'plasma' },
  'energy blade': { ...sword, grip: .18, gripY: .5 },
  disruptor: { restAngle: -.08, grip: .2, gripY: .72, projectile: 'disruptor' },
  grenade: { restAngle: .35, grip: .5, gripY: .55, projectile: 'grenade', thrown: true },
  bolas: { restAngle: .6, grip: .5, gripY: .55, projectile: 'bolas', thrown: true }
};

/** Every allowed attack is distinct, even with reduced motion; effects never apply damage. */
export function projectilePosition(progress: number, kind: Projectile, reduced: boolean): { x: number; y: number; angle: number } {
  const p = Math.max(0, Math.min(1, progress));
  const thrown = kind === 'grenade' || kind === 'bolas';
  return { x: reduced ? .75 : p, y: reduced || !thrown ? 0 : -Math.sin(p * Math.PI) * 36,
    angle: reduced || !thrown ? 0 : p * Math.PI * 3 };
}
