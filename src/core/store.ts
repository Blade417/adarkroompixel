/**
 * Game state store. Same data layout as the original `State` object (so original saves load as-is),
 * same semantics as the original StateManager, but no eval and a typed update bus.
 */
export type StateTree = Record<string, any>;

export interface StateUpdate {
  /** first path segment: 'stores', 'game', 'income', ... ('all' for bulk changes) */
  category: string;
  stateName: string;
}

export type UpdateListener = (e: StateUpdate) => void;

export const MAX_STORE = 99999999999999;

export const CATEGORIES = [
  'features', 'stores', 'character', 'income', 'timers', 'game', 'playStats',
  'previous', 'outfit', 'config', 'wait', 'cooldown'
] as const;

/** Split 'game.buildings["hut"]', "stores['alien alloy']", 'outfit[cured meat]', 'wait.Room[4].x' into keys. */
export function parsePath(path: string): string[] {
  return path.split(/[.[\]'"]+/).filter((w) => w !== '');
}

export function categoryOf(path: string): string {
  return parsePath(path)[0] ?? path;
}

export class Store {
  state: StateTree;
  private listeners = new Set<UpdateListener>();
  /** called after every non-silent write (persistence hook) */
  onDirty: () => void = () => {};

  constructor(state: StateTree = {}) {
    this.state = state;
  }

  init(): void {
    for (const c of CATEGORIES) {
      if (!this.get(c)) this.set(c, {}, true);
    }
  }

  subscribe(fn: UpdateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get(path: string, requestZero?: boolean): any {
    let obj: any = this.state;
    for (const w of parsePath(path)) {
      if (obj === null || obj === undefined || typeof obj !== 'object') {
        obj = undefined;
        break;
      }
      obj = obj[w];
    }
    if (!obj && requestZero) return 0;
    return obj;
  }

  /** numeric read helper: missing / non-number -> 0 */
  num(path: string): number {
    const v = this.get(path, true);
    return typeof v === 'number' && !isNaN(v) ? v : 0;
  }

  set(path: string, value: any, noEvent?: boolean): void {
    const words = parsePath(path);
    if (typeof value === 'number' && value > MAX_STORE) value = MAX_STORE;
    let obj: any = this.state;
    for (let i = 0; i < words.length - 1; i++) {
      const w = words[i];
      if (obj[w] === undefined || obj[w] === null || typeof obj[w] !== 'object') obj[w] = {};
      obj = obj[w];
    }
    const last = words[words.length - 1];
    obj[last] = value;
    // stores can never be negative
    if (words[0] === 'stores' && typeof obj[last] === 'number' && obj[last] < 0) obj[last] = 0;
    if (!noEvent) {
      this.onDirty();
      this.fireUpdate(path);
    }
  }

  setM(parent: string, list: Record<string, any>, noEvent?: boolean): void {
    if (this.get(parent) === undefined) this.set(parent, {}, true);
    for (const k in list) this.set(`${parent}["${k}"]`, list[k], true);
    if (!noEvent) {
      this.onDirty();
      this.fireUpdate(parent);
    }
  }

  /** returns 1 if the value could not be added (not a number) */
  add(path: string, value: number, noEvent?: boolean): number {
    const old = this.get(path, true);
    if (typeof old === 'number' && isNaN(old)) {
      this.set(path, value, noEvent);
      return 0;
    }
    if (typeof old !== 'number' || typeof value !== 'number') return 1;
    this.set(path, old + value, noEvent);
    return 0;
  }

  addM(parent: string, list: Record<string, number>, noEvent?: boolean): number {
    let err = 0;
    if (this.get(parent) === undefined) this.set(parent, {}, true);
    for (const k in list) err += this.add(`${parent}["${k}"]`, list[k], true);
    if (!noEvent) {
      this.onDirty();
      this.fireUpdate(parent);
    }
    return err;
  }

  remove(path: string, noEvent?: boolean): void {
    const words = parsePath(path);
    let obj: any = this.state;
    for (let i = 0; i < words.length - 1; i++) {
      obj = obj?.[words[i]];
      if (obj === undefined || obj === null) break;
    }
    if (obj && typeof obj === 'object') delete obj[words[words.length - 1]];
    if (!noEvent) {
      this.onDirty();
      this.fireUpdate(path);
    }
  }

  /** remove empty objects under (and including) path */
  removeBranch(path: string, noEvent?: boolean): void {
    const node = this.get(path);
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) {
        if (node[k] && typeof node[k] === 'object') this.removeBranch(`${path}["${k}"]`, true);
      }
      if (Object.keys(node).length === 0) this.remove(path, true);
    }
    if (!noEvent) {
      this.onDirty();
      this.fireUpdate(path);
    }
  }

  fireUpdate(stateName?: string): void {
    const e: StateUpdate = stateName === undefined
      ? { category: 'all', stateName: 'all' }
      : { category: categoryOf(stateName), stateName };
    for (const fn of [...this.listeners]) fn(e);
  }
}
