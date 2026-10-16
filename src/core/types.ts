/** Shared core types. */
export type LocationId = 'room' | 'outside' | 'path' | 'world' | 'fabricator' | 'ship' | 'space';

/** the original event scene-graph format (see docs/02 §2.4) */
export interface EventButton {
  text: string;
  cost?: Record<string, number>;
  reward?: Record<string, number>;
  notification?: string;
  available?: () => boolean;
  onChoose?: (textarea?: string | null) => void;
  onClick?: () => void;
  nextScene?: 'end' | Record<string, string>;
  nextEvent?: string;
  link?: string;
  cooldown?: number;
}

export interface FighterRef {
  /** 'wanderer' (the player) or 'enemy' */
  id: 'wanderer' | 'enemy';
}

export interface EventScene {
  text?: string[];
  notification?: string;
  reward?: Record<string, number>;
  onLoad?: (this: EventScene) => void;
  loot?: Record<string, { min: number; max: number; chance: number }>;
  textarea?: string;
  readonly?: boolean;
  blink?: boolean;
  buttons?: Record<string, EventButton>;
  // combat
  combat?: boolean;
  enemy?: string;
  enemyName?: string;
  chara?: string;
  health?: number;
  damage?: number;
  hit?: number;
  attackDelay?: number;
  ranged?: boolean;
  deathMessage?: string;
  specials?: { delay: number; action: (fighter: any) => string | void }[];
  atHealth?: Record<string, (fighter: any) => string | void>;
  explosion?: number;
  nextScene?: string;
  [key: string]: any;
}

export interface GameEventDef {
  title: string;
  isAvailable?: () => boolean;
  audio?: string;
  scenes: Record<string, EventScene>;
}

/** original source text of the content scripts, keyed by file name */
export interface ContentSources {
  audioLibrary: string;
  global: string;
  room: string;
  outside: string;
  encounters: string;
  setpieces: string;
  marketing: string;
  executioner: string;
}

/** what the presentation layer can listen to */
export type GameEvent =
  | { type: 'state'; category: string; stateName: string }
  | { type: 'location'; from: LocationId | null; to: LocationId }
  | { type: 'locations' }
  | { type: 'audio'; channel: 'sfx' | 'music' | 'eventMusic' | 'stopEventMusic'; key?: string }
  | { type: 'event:start' | 'event:scene' | 'event:end' | 'event:update' }
  | { type: 'combat:attack'; attacker: 'wanderer' | 'enemy'; kind: 'melee' | 'ranged' | 'unarmed'; result: string }
  | { type: 'combat:status'; fighter: 'wanderer' | 'enemy'; status: string }
  | { type: 'combat:end'; won: boolean }
  | { type: 'world:move'; pos: [number, number]; tile: string }
  | { type: 'world:died' }
  | { type: 'world:home'; returned: Record<string, number> }
  | { type: 'world:fight' }
  | { type: 'space:start' }
  | { type: 'space:hit'; hull: number }
  | { type: 'space:crash' }
  | { type: 'ending'; score: number; total: number; expansion: boolean }
  | { type: 'build'; thing: string }
  | { type: 'unlock'; thing: string };
