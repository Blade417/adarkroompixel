import { TILE, WEAPONS } from '../core/data';

/** Presentation and fixture choices only. Damage, cost, eligibility and loot stay in the core. */
export const EARLY_ENCOUNTERS = [
  { id: 'snarling beast', name: '咆哮野兽', terrain: TILE.FOREST, place: '林缘', art: 'beast', background: 'background', chapter: '林间的低吼' },
  { id: 'gaunt man', name: '瘦弱男子', terrain: TILE.BARRENS, place: '荒地', art: 'gaunt', background: 'barrens-background', chapter: '荒地上的来者' },
  { id: 'strange bird', name: '怪鸟', terrain: TILE.FIELD, place: '草原', art: 'bird', background: 'field-background', chapter: '枯草中的尖啸' },
  { id: 'two-headed creature', name: '双头生物', terrain: TILE.FIELD, place: '草原', art: 'twohead', background: 'field-background', chapter: '两颗头颅，一个身影' }
] as const;
export type EarlyEncounterId = typeof EARLY_ENCOUNTERS[number]['id'];
export const SLICE_SUPPLIES = ['cured meat', 'bone spear', 'iron sword', 'steel sword', 'rifle', 'bullets', 'bolas'] as const;
export const WEAPON_ART: Record<string, string> = {
  'bone spear': 'weapon-spear', 'iron sword': 'weapon-iron', 'steel sword': 'weapon-steel', rifle: 'weapon-rifle', bolas: 'weapon-bolas',
  bayonet: 'weapon-bayonet', 'laser rifle': 'weapon-laser', grenade: 'weapon-grenade',
  'plasma rifle': 'weapon-plasma', 'energy blade': 'weapon-energy-blade', disruptor: 'weapon-disruptor'
};
export const WEAPON_NAMES: Record<string, string> = { fists: '徒手', 'bone spear': '骨矛', 'iron sword': '铁剑', 'steel sword': '钢剑', rifle: '步枪', bolas: '流星索',
  bayonet: '刺刀', 'laser rifle': '激光步枪', grenade: '手雷', 'plasma rifle': '等离子步枪', 'energy blade': '能量刃', disruptor: '干扰器' };
export function weaponLabel(id: string): string {
  const w = WEAPONS[id];
  return `${WEAPON_NAMES[id] ?? id} · ${w.damage === 'stun' ? '击晕' : `伤害 ${w.damage}`}`;
}
