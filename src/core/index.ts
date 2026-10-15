/** Public surface of the headless core. */
export { Game, type GameOptions, type Income } from './game';
export { Clock } from './clock';
export { Store, parsePath, type StateTree } from './store';
export { I18n, LANGUAGES, parseLegacyStrings, type Language, type Dictionary } from './i18n';
export { seededRng, scriptedRng, mathRng, type Rng } from './rng';
export { MemoryStorage, SAVE_KEY, LEGACY_SAVE_KEY, encodeSave, decodeSave, type StorageLike } from './save';
export { pickScene, type ButtonView, type ActiveEvent } from './events/runner';
export type { Combat, CombatAction, Fighter } from './events/combat';
export * as data from './data';
export type { ContentSources, GameEvent, LocationId, GameEventDef, EventScene } from './types';
