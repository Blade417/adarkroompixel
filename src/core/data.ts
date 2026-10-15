/**
 * Static game data ported 1:1 from the original scripts (see docs/05-数据参考表.md).
 * Strings are the original English keys; translate with I18n.t at display time.
 * Balance values must not change (design decision #2).
 */
export type Cost = Record<string, number>;
export type CostFn = (count: number) => Cost;
export type ItemType = 'building' | 'tool' | 'upgrade' | 'weapon' | 'good' | 'special';

export interface Craftable {
  type: ItemType;
  maximum?: number;
  cost: CostFn;
  availableMsg?: string;
  buildMsg?: string;
  maxMsg?: string;
}

const fixed = (c: Cost): CostFn => () => c;

// ---------------------------------------------------------------- Room

export const ROOM = {
  FIRE_COOL_DELAY: 5 * 60 * 1000,
  ROOM_WARM_DELAY: 30 * 1000,
  BUILDER_STATE_DELAY: 0.5 * 60 * 1000,
  STOKE_COOLDOWN: 10,
  NEED_WOOD_DELAY: 15 * 1000
};

export const FIRE = [
  { value: 0, text: 'dead' },
  { value: 1, text: 'smoldering' },
  { value: 2, text: 'flickering' },
  { value: 3, text: 'burning' },
  { value: 4, text: 'roaring' }
] as const;

export const TEMPERATURE = [
  { value: 0, text: 'freezing' },
  { value: 1, text: 'cold' },
  { value: 2, text: 'mild' },
  { value: 3, text: 'warm' },
  { value: 4, text: 'hot' }
] as const;

export const CRAFTABLES: Record<string, Craftable> = {
  'trap': {
    type: 'building', maximum: 10, cost: (n) => ({ wood: 10 + n * 10 }),
    availableMsg: 'builder says she can make traps to catch any creatures might still be alive out there',
    buildMsg: 'more traps to catch more creatures', maxMsg: "more traps won't help now"
  },
  'cart': {
    type: 'building', maximum: 1, cost: fixed({ wood: 30 }),
    availableMsg: 'builder says she can make a cart for carrying wood',
    buildMsg: 'the rickety cart will carry more wood from the forest'
  },
  'hut': {
    type: 'building', maximum: 20, cost: (n) => ({ wood: 100 + n * 50 }),
    availableMsg: "builder says there are more wanderers. says they'll work, too.",
    buildMsg: 'builder puts up a hut, out in the forest. says word will get around.', maxMsg: 'no more room for huts.'
  },
  'lodge': {
    type: 'building', maximum: 1, cost: fixed({ wood: 200, fur: 10, meat: 5 }),
    availableMsg: 'villagers could help hunt, given the means',
    buildMsg: 'the hunting lodge stands in the forest, a ways out of town'
  },
  'trading post': {
    type: 'building', maximum: 1, cost: fixed({ wood: 400, fur: 100 }),
    availableMsg: 'a trading post would make commerce easier',
    buildMsg: 'now the nomads have a place to set up shop, they might stick around a while'
  },
  'tannery': {
    type: 'building', maximum: 1, cost: fixed({ wood: 500, fur: 50 }),
    availableMsg: 'builder says leather could be useful. says the villagers could make it.',
    buildMsg: 'tannery goes up quick, on the edge of the village'
  },
  'smokehouse': {
    type: 'building', maximum: 1, cost: fixed({ wood: 600, meat: 50 }),
    availableMsg: "should cure the meat, or it'll spoil. builder says she can fix something up.",
    buildMsg: 'builder finishes the smokehouse. she looks hungry.'
  },
  'workshop': {
    type: 'building', maximum: 1, cost: fixed({ wood: 800, leather: 100, scales: 10 }),
    availableMsg: 'builder says she could make finer things, if she had the tools',
    buildMsg: "workshop's finally ready. builder's excited to get to it"
  },
  'steelworks': {
    type: 'building', maximum: 1, cost: fixed({ wood: 1500, iron: 100, coal: 100 }),
    availableMsg: 'builder says the villagers could make steel, given the tools',
    buildMsg: 'a haze falls over the village as the steelworks fires up'
  },
  'armoury': {
    type: 'building', maximum: 1, cost: fixed({ wood: 3000, steel: 100, sulphur: 50 }),
    availableMsg: "builder says it'd be useful to have a steady source of bullets",
    buildMsg: "armoury's done, welcoming back the weapons of the past."
  },
  'torch': { type: 'tool', cost: fixed({ wood: 1, cloth: 1 }), buildMsg: 'a torch to keep the dark away' },
  'waterskin': { type: 'upgrade', maximum: 1, cost: fixed({ leather: 50 }), buildMsg: "this waterskin'll hold a bit of water, at least" },
  'cask': { type: 'upgrade', maximum: 1, cost: fixed({ leather: 100, iron: 20 }), buildMsg: 'the cask holds enough water for longer expeditions' },
  'water tank': { type: 'upgrade', maximum: 1, cost: fixed({ iron: 100, steel: 50 }), buildMsg: 'never go thirsty again' },
  'bone spear': { type: 'weapon', cost: fixed({ wood: 100, teeth: 5 }), buildMsg: "this spear's not elegant, but it's pretty good at stabbing" },
  'rucksack': { type: 'upgrade', maximum: 1, cost: fixed({ leather: 200 }), buildMsg: 'carrying more means longer expeditions to the wilds' },
  'wagon': { type: 'upgrade', maximum: 1, cost: fixed({ wood: 500, iron: 100 }), buildMsg: 'the wagon can carry a lot of supplies' },
  'convoy': { type: 'upgrade', maximum: 1, cost: fixed({ wood: 1000, iron: 200, steel: 100 }), buildMsg: 'the convoy can haul mostly everything' },
  'l armour': { type: 'upgrade', maximum: 1, cost: fixed({ leather: 200, scales: 20 }), buildMsg: "leather's not strong. better than rags, though." },
  'i armour': { type: 'upgrade', maximum: 1, cost: fixed({ leather: 200, iron: 100 }), buildMsg: "iron's stronger than leather" },
  's armour': { type: 'upgrade', maximum: 1, cost: fixed({ leather: 200, steel: 100 }), buildMsg: "steel's stronger than iron" },
  'iron sword': { type: 'weapon', cost: fixed({ wood: 200, leather: 50, iron: 20 }), buildMsg: 'sword is sharp. good protection out in the wilds.' },
  'steel sword': { type: 'weapon', cost: fixed({ wood: 500, leather: 100, steel: 20 }), buildMsg: 'the steel is strong, and the blade true.' },
  'rifle': { type: 'weapon', cost: fixed({ wood: 200, steel: 50, sulphur: 50 }), buildMsg: 'black powder and bullets, like the old days.' }
};

export const TRADE_GOODS: Record<string, Craftable> = {
  'scales': { type: 'good', cost: fixed({ fur: 150 }) },
  'teeth': { type: 'good', cost: fixed({ fur: 300 }) },
  'iron': { type: 'good', cost: fixed({ fur: 150, scales: 50 }) },
  'coal': { type: 'good', cost: fixed({ fur: 200, teeth: 50 }) },
  'steel': { type: 'good', cost: fixed({ fur: 300, scales: 50, teeth: 50 }) },
  'medicine': { type: 'good', cost: fixed({ scales: 50, teeth: 30 }) },
  'bullets': { type: 'good', cost: fixed({ scales: 10 }) },
  'energy cell': { type: 'good', cost: fixed({ scales: 10, teeth: 10 }) },
  'bolas': { type: 'weapon', cost: fixed({ teeth: 10 }) },
  'grenade': { type: 'weapon', cost: fixed({ scales: 100, teeth: 50 }) },
  'bayonet': { type: 'weapon', cost: fixed({ scales: 500, teeth: 250 }) },
  'alien alloy': { type: 'good', cost: fixed({ fur: 1500, scales: 750, teeth: 300 }) },
  'compass': { type: 'special', maximum: 1, cost: fixed({ fur: 400, scales: 20, teeth: 10 }) }
};

export const MISC_ITEMS: Record<string, { type: ItemType }> = {
  'laser rifle': { type: 'weapon' }
};

// ---------------------------------------------------------------- Outside

export const OUTSIDE = {
  GATHER_DELAY: 60,
  TRAPS_DELAY: 90,
  POP_DELAY: [0.5, 3] as [number, number],
  HUT_ROOM: 4
};

export interface WorkerIncome {
  delay: number;
  stores: Record<string, number>;
}

export const WORKERS: Record<string, WorkerIncome> = {
  'gatherer': { delay: 10, stores: { wood: 1 } },
  'hunter': { delay: 10, stores: { fur: 0.5, meat: 0.5 } },
  'trapper': { delay: 10, stores: { meat: -1, bait: 1 } },
  'tanner': { delay: 10, stores: { fur: -5, leather: 1 } },
  'charcutier': { delay: 10, stores: { meat: -5, wood: -5, 'cured meat': 1 } },
  'iron miner': { delay: 10, stores: { 'cured meat': -1, iron: 1 } },
  'coal miner': { delay: 10, stores: { 'cured meat': -1, coal: 1 } },
  'sulphur miner': { delay: 10, stores: { 'cured meat': -1, sulphur: 1 } },
  'steelworker': { delay: 10, stores: { iron: -1, coal: -1, steel: 1 } },
  'armourer': { delay: 10, stores: { steel: -1, sulphur: -1, bullets: 1 } }
};

/** building -> worker jobs it unlocks */
export const JOB_MAP: Record<string, string[]> = {
  'lodge': ['hunter', 'trapper'],
  'tannery': ['tanner'],
  'smokehouse': ['charcutier'],
  'iron mine': ['iron miner'],
  'coal mine': ['coal miner'],
  'sulphur mine': ['sulphur miner'],
  'steelworks': ['steelworker'],
  'armoury': ['armourer']
};

export const TRAP_DROPS = [
  { rollUnder: 0.5, name: 'fur', message: 'scraps of fur' },
  { rollUnder: 0.75, name: 'meat', message: 'bits of meat' },
  { rollUnder: 0.85, name: 'scales', message: 'strange scales' },
  { rollUnder: 0.93, name: 'teeth', message: 'scattered teeth' },
  { rollUnder: 0.995, name: 'cloth', message: 'tattered cloth' },
  { rollUnder: 1.0, name: 'charm', message: 'a crudely made charm' }
];

/** hut count -> location title (and music) */
export function villageTitle(huts: number): string {
  if (huts === 0) return 'A Silent Forest';
  if (huts === 1) return 'A Lonely Hut';
  if (huts <= 4) return 'A Tiny Village';
  if (huts <= 8) return 'A Modest Village';
  if (huts <= 14) return 'A Large Village';
  return 'A Raucous Village';
}

// ---------------------------------------------------------------- Path

export const PATH = { DEFAULT_BAG_SPACE: 10 };

export const WEIGHT: Record<string, number> = {
  'bone spear': 2, 'iron sword': 3, 'steel sword': 5, 'rifle': 5, 'bullets': 0.1,
  'energy cell': 0.2, 'laser rifle': 5, 'plasma rifle': 5, 'bolas': 0.5
};

/** things that can be packed besides the craftables (with their outfitting type) */
export const CARRYABLE_EXTRA: Record<string, { type: ItemType; desc?: string }> = {
  'cured meat': { type: 'tool', desc: 'restores' },
  'bullets': { type: 'tool', desc: 'use with rifle' },
  'grenade': { type: 'weapon' },
  'bolas': { type: 'weapon' },
  'laser rifle': { type: 'weapon' },
  'energy cell': { type: 'tool', desc: 'emits a soft red glow' },
  'bayonet': { type: 'weapon' },
  'charm': { type: 'tool' },
  'alien alloy': { type: 'tool' },
  'medicine': { type: 'tool', desc: 'restores' }
};

// ---------------------------------------------------------------- World

export const WORLD = {
  RADIUS: 30,
  VILLAGE_POS: [30, 30] as [number, number],
  STICKINESS: 0.5,
  LIGHT_RADIUS: 2,
  BASE_WATER: 10,
  MOVES_PER_FOOD: 2,
  MOVES_PER_WATER: 1,
  DEATH_COOLDOWN: 120,
  FIGHT_CHANCE: 0.2,
  BASE_HEALTH: 10,
  BASE_HIT_CHANCE: 0.8,
  MEAT_HEAL: 8,
  MEDS_HEAL: 20,
  HYPO_HEAL: 30,
  FIGHT_DELAY: 3
};

export const TILE = {
  VILLAGE: 'A', IRON_MINE: 'I', COAL_MINE: 'C', SULPHUR_MINE: 'S', FOREST: ';', FIELD: ',', BARRENS: '.',
  ROAD: '#', HOUSE: 'H', CAVE: 'V', TOWN: 'O', CITY: 'Y', OUTPOST: 'P', SHIP: 'W', BOREHOLE: 'B',
  BATTLEFIELD: 'F', SWAMP: 'M', CACHE: 'U', EXECUTIONER: 'X'
} as const;

export const TILE_PROBS: Record<string, number> = {
  [TILE.FOREST]: 0.15,
  [TILE.FIELD]: 0.35,
  [TILE.BARRENS]: 0.5
};

export interface Landmark {
  num: number;
  minRadius: number;
  maxRadius: number;
  scene: string;
  label: string;
}

export function landmarks(withCache: boolean): Record<string, Landmark> {
  const R = WORLD.RADIUS;
  const l: Record<string, Landmark> = {
    [TILE.OUTPOST]: { num: 0, minRadius: 0, maxRadius: 0, scene: 'outpost', label: 'An&nbsp;Outpost' },
    [TILE.IRON_MINE]: { num: 1, minRadius: 5, maxRadius: 5, scene: 'ironmine', label: 'Iron&nbsp;Mine' },
    [TILE.COAL_MINE]: { num: 1, minRadius: 10, maxRadius: 10, scene: 'coalmine', label: 'Coal&nbsp;Mine' },
    [TILE.SULPHUR_MINE]: { num: 1, minRadius: 20, maxRadius: 20, scene: 'sulphurmine', label: 'Sulphur&nbsp;Mine' },
    [TILE.HOUSE]: { num: 10, minRadius: 0, maxRadius: R * 1.5, scene: 'house', label: 'An&nbsp;Old&nbsp;House' },
    [TILE.CAVE]: { num: 5, minRadius: 3, maxRadius: 10, scene: 'cave', label: 'A&nbsp;Damp&nbsp;Cave' },
    [TILE.TOWN]: { num: 10, minRadius: 10, maxRadius: 20, scene: 'town', label: 'An&nbsp;Abandoned&nbsp;Town' },
    [TILE.CITY]: { num: 20, minRadius: 20, maxRadius: R * 1.5, scene: 'city', label: 'A&nbsp;Ruined&nbsp;City' },
    [TILE.SHIP]: { num: 1, minRadius: 28, maxRadius: 28, scene: 'ship', label: 'A&nbsp;Crashed&nbsp;Starship' },
    [TILE.BOREHOLE]: { num: 10, minRadius: 15, maxRadius: R * 1.5, scene: 'borehole', label: 'A&nbsp;Borehole' },
    [TILE.BATTLEFIELD]: { num: 5, minRadius: 18, maxRadius: R * 1.5, scene: 'battlefield', label: 'A&nbsp;Battlefield' },
    [TILE.SWAMP]: { num: 1, minRadius: 15, maxRadius: R * 1.5, scene: 'swamp', label: 'A&nbsp;Murky&nbsp;Swamp' },
    [TILE.EXECUTIONER]: { num: 1, minRadius: 28, maxRadius: 28, scene: 'executioner', label: 'A&nbsp;Ravaged&nbsp;Battleship' }
  };
  if (withCache) {
    l[TILE.CACHE] = { num: 1, minRadius: 10, maxRadius: R * 1.5, scene: 'cache', label: 'A&nbsp;Destroyed&nbsp;Village' };
  }
  return l;
}

export type WeaponType = 'unarmed' | 'melee' | 'ranged';

export interface Weapon {
  verb: string;
  type: WeaponType;
  damage: number | 'stun';
  cooldown: number;
  cost?: Cost;
}

export const WEAPONS: Record<string, Weapon> = {
  'fists': { verb: 'punch', type: 'unarmed', damage: 1, cooldown: 2 },
  'bone spear': { verb: 'stab', type: 'melee', damage: 2, cooldown: 2 },
  'iron sword': { verb: 'swing', type: 'melee', damage: 4, cooldown: 2 },
  'steel sword': { verb: 'slash', type: 'melee', damage: 6, cooldown: 2 },
  'bayonet': { verb: 'thrust', type: 'melee', damage: 8, cooldown: 2 },
  'rifle': { verb: 'shoot', type: 'ranged', damage: 5, cooldown: 1, cost: { bullets: 1 } },
  'laser rifle': { verb: 'blast', type: 'ranged', damage: 8, cooldown: 1, cost: { 'energy cell': 1 } },
  'grenade': { verb: 'lob', type: 'ranged', damage: 15, cooldown: 5, cost: { grenade: 1 } },
  'bolas': { verb: 'tangle', type: 'ranged', damage: 'stun', cooldown: 15, cost: { bolas: 1 } },
  'plasma rifle': { verb: 'disintegrate', type: 'ranged', damage: 12, cooldown: 1, cost: { 'energy cell': 1 } },
  'energy blade': { verb: 'slice', type: 'melee', damage: 10, cooldown: 2 },
  'disruptor': { verb: 'stun', type: 'ranged', damage: 'stun', cooldown: 15 }
};

export interface Perk {
  name: string;
  desc: string;
  notify: string;
}

export const PERKS: Record<string, Perk> = {
  'boxer': { name: 'boxer', desc: 'punches do more damage', notify: 'learned to throw punches with purpose' },
  'martial artist': { name: 'martial artist', desc: 'punches do even more damage.', notify: 'learned to fight quite effectively without weapons' },
  'unarmed master': { name: 'unarmed master', desc: 'punch twice as fast, and with even more force', notify: 'learned to strike faster without weapons' },
  'barbarian': { name: 'barbarian', desc: 'melee weapons deal more damage', notify: 'learned to swing weapons with force' },
  'slow metabolism': { name: 'slow metabolism', desc: 'go twice as far without eating', notify: 'learned how to ignore the hunger' },
  'desert rat': { name: 'desert rat', desc: 'go twice as far without drinking', notify: 'learned to love the dry air' },
  'evasive': { name: 'evasive', desc: 'dodge attacks more effectively', notify: "learned to be where they're not" },
  'precise': { name: 'precise', desc: 'land blows more often', notify: 'learned to predict their movement' },
  'scout': { name: 'scout', desc: 'see farther', notify: 'learned to look ahead' },
  'stealthy': { name: 'stealthy', desc: 'better avoid conflict in the wild', notify: 'learned how not to be seen' },
  'gastronome': { name: 'gastronome', desc: 'restore more health when eating', notify: 'learned to make the most of food' }
};

// ---------------------------------------------------------------- Fabricator

export interface FabricatorItem extends Craftable {
  name: string;
  blueprintRequired?: boolean;
  quantity?: number;
}

export const FABRICATOR: Record<string, FabricatorItem> = {
  'energy blade': { name: 'energy blade', type: 'weapon', cost: fixed({ 'alien alloy': 1 }), buildMsg: 'the blade hums, charged particles sparking and fizzing.' },
  'fluid recycler': { name: 'fluid recycler', type: 'upgrade', maximum: 1, cost: fixed({ 'alien alloy': 2 }), buildMsg: 'water out, water in. waste not, want not.' },
  'cargo drone': { name: 'cargo drone', type: 'upgrade', maximum: 1, cost: fixed({ 'alien alloy': 2 }), buildMsg: 'the workhorse of the wanderer fleet.' },
  'kinetic armour': { name: 'kinetic armour', type: 'upgrade', maximum: 1, blueprintRequired: true, cost: fixed({ 'alien alloy': 2 }), buildMsg: "wanderer soldiers succeed by subverting the enemy's rage." },
  'disruptor': { name: 'disruptor', type: 'weapon', blueprintRequired: true, cost: fixed({ 'alien alloy': 1 }), buildMsg: 'somtimes it is best not to fight.' },
  'hypo': { name: 'hypo', type: 'tool', blueprintRequired: true, quantity: 5, cost: fixed({ 'alien alloy': 1 }), buildMsg: 'a handful of hypos. life in a vial.' },
  'stim': { name: 'stim', type: 'tool', blueprintRequired: true, cost: fixed({ 'alien alloy': 1 }), buildMsg: 'sometimes it is best to fight without restraint.' },
  'plasma rifle': { name: 'plasma rifle', type: 'weapon', blueprintRequired: true, cost: fixed({ 'alien alloy': 1 }), buildMsg: 'the peak of wanderer weapons technology, sleek and deadly.' },
  'glowstone': { name: 'glow stone', type: 'tool', blueprintRequired: true, cost: fixed({ 'alien alloy': 1 }), buildMsg: 'a smooth, perfect sphere. its light is inextinguishable.' }
};

/** blueprint loot item -> fabricator recipe it unlocks */
export const BLUEPRINTS: Record<string, string> = {
  'hypo blueprint': 'hypo',
  'kinetic armour blueprint': 'kinetic armour',
  'disruptor blueprint': 'disruptor',
  'plasma rifle blueprint': 'plasma rifle',
  'stim blueprint': 'stim',
  'glowstone blueprint': 'glowstone'
};

// ---------------------------------------------------------------- Ship / Space

export const SHIP = {
  LIFTOFF_COOLDOWN: 120,
  ALLOY_PER_HULL: 1,
  ALLOY_PER_THRUSTER: 1,
  BASE_HULL: 0,
  BASE_THRUSTERS: 1
};

export const SPACE = {
  SHIP_SPEED: 3,
  BASE_ASTEROID_DELAY: 500,
  BASE_ASTEROID_SPEED: 1500,
  FTB_SPEED: 60000,
  /** logical play field (the original used a 700x700 px panel) */
  WIDTH: 700,
  HEIGHT: 700,
  /** asteroid glyph box in the original 32px font */
  ASTEROID_W: 20,
  ASTEROID_H: 37,
  FRAME_MS: 16
};

export const ASTEROID_CHARS = ['#', '$', '%', '&', 'H'];

export function altitudeName(altitude: number): string {
  if (altitude < 10) return 'Troposphere';
  if (altitude < 20) return 'Stratosphere';
  if (altitude < 30) return 'Mesosphere';
  if (altitude < 45) return 'Thermosphere';
  if (altitude < 60) return 'Exosphere';
  return 'Space';
}

// ---------------------------------------------------------------- Prestige / Score

export const PRESTIGE_STORES: { store: string; type: 'g' | 'w' | 'a' }[] = [
  { store: 'wood', type: 'g' }, { store: 'fur', type: 'g' }, { store: 'meat', type: 'g' },
  { store: 'iron', type: 'g' }, { store: 'coal', type: 'g' }, { store: 'sulphur', type: 'g' },
  { store: 'steel', type: 'g' }, { store: 'cured meat', type: 'g' }, { store: 'scales', type: 'g' },
  { store: 'teeth', type: 'g' }, { store: 'leather', type: 'g' }, { store: 'bait', type: 'g' },
  { store: 'torch', type: 'g' }, { store: 'cloth', type: 'g' }, { store: 'bone spear', type: 'w' },
  { store: 'iron sword', type: 'w' }, { store: 'steel sword', type: 'w' }, { store: 'bayonet', type: 'w' },
  { store: 'rifle', type: 'w' }, { store: 'laser rifle', type: 'w' }, { store: 'bullets', type: 'a' },
  { store: 'energy cell', type: 'a' }, { store: 'grenade', type: 'a' }, { store: 'bolas', type: 'a' }
];

export const SCORE_FACTORS = [1, 1.5, 1, 2, 2, 3, 3, 2, 2, 2, 2, 1.5, 1, 1, 10, 30, 50, 100, 150, 150, 3, 3, 5, 4];

// ---------------------------------------------------------------- Events

export const EVENTS = {
  TIME_RANGE: [3, 6] as [number, number],
  FIGHT_SPEED: 100,
  EAT_COOLDOWN: 5,
  MEDS_COOLDOWN: 7,
  HYPO_COOLDOWN: 7,
  SHIELD_COOLDOWN: 10,
  STIM_COOLDOWN: 10,
  LEAVE_COOLDOWN: 1,
  STUN_DURATION: 4000,
  ENERGISE_MULTIPLIER: 4,
  EXPLOSION_DURATION: 3000,
  ENRAGE_DURATION: 4000,
  MEDITATE_DURATION: 5000,
  BOOST_DURATION: 3000,
  BOOST_DAMAGE: 10,
  DOT_TICK: 1000
};
