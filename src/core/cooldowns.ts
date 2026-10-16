/**
 * Action cooldowns (the original Button cooldown bars).
 * Persistent cooldowns are mirrored into state.cooldown[id] (remaining seconds), like the original,
 * so an embark / lift-off cooldown survives a reload.
 */
import type { Clock, TimerId } from './clock';
import type { Store } from './store';

interface Entry {
  endsAt: number;
  duration: number;
  persist: boolean;
  timer: TimerId;
}
export type CooldownSnapshot = Record<string, { remaining: number; duration: number }>;

export class Cooldowns {
  private entries = new Map<string, Entry>();
  private ticker: TimerId | null = null;
  /** the original disables persistence while an event panel is open */
  persistEnabled = true;

  constructor(private clock: Clock, private store: Store) {}

  /** resume cooldowns saved in state (seconds) */
  restore(): void {
    const saved = this.store.get('cooldown') || {};
    for (const id of Object.keys(saved)) {
      const left = Number(saved[id]);
      if (left > 0) this.start(id, left, true);
      else this.store.remove(`cooldown["${id}"]`, true);
    }
  }

  /** start (or restart) a cooldown of `seconds` */
  start(id: string, seconds: number, persist = true): void {
    if (seconds <= 0) return;
    this.clear(id);
    const ms = seconds * 1000;
    const timer = this.clock.setTimeout(() => this.clear(id), ms);
    const duration = this.clock.remaining(timer);
    const doPersist = persist && this.persistEnabled;
    this.entries.set(id, { endsAt: this.clock.now + duration, duration, persist: doPersist, timer });
    if (doPersist) {
      this.store.set(`cooldown["${id}"]`, seconds, true);
      this.ensureTicker();
    }
  }

  clear(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    this.clock.clear(e.timer);
    this.entries.delete(id);
    if (e.persist) this.store.remove(`cooldown["${id}"]`, true);
  }

  isCooling(id: string): boolean {
    return this.entries.has(id);
  }

  /** remaining milliseconds of game time */
  remaining(id: string): number {
    const e = this.entries.get(id);
    return e ? Math.max(0, e.endsAt - this.clock.now) : 0;
  }

  /** 1 -> just started, 0 -> ready */
  progress(id: string): number {
    const e = this.entries.get(id);
    return e ? Math.max(0, Math.min(1, (e.endsAt - this.clock.now) / e.duration)) : 0;
  }

  clearAll(): void {
    for (const id of [...this.entries.keys()]) this.clear(id);
  }

  snapshot(prefixes: string[]): CooldownSnapshot {
    return Object.fromEntries([...this.entries].filter(([id]) => prefixes.some(prefix => id.startsWith(prefix)))
      .map(([id, e]) => [id, { remaining: this.remaining(id), duration: e.duration }]));
  }

  resume(saved: CooldownSnapshot): void {
    for (const [id, e] of Object.entries(saved)) {
      this.clear(id);
      if (e.remaining <= 0) continue;
      const timer = this.clock.setTimeout(() => this.clear(id), e.remaining, true);
      this.entries.set(id, { endsAt: this.clock.now + e.remaining, duration: e.duration, timer, persist: false });
    }
  }

  private ensureTicker(): void {
    if (this.ticker !== null) return;
    // write residual seconds every half second (silently), like the original
    this.ticker = this.clock.setInterval(() => {
      let any = false;
      for (const [id, e] of this.entries) {
        if (!e.persist) continue;
        any = true;
        this.store.set(`cooldown["${id}"]`, Math.max(0, (e.endsAt - this.clock.now) / 1000), true);
      }
      if (!any && this.ticker !== null) {
        this.clock.clear(this.ticker);
        this.ticker = null;
      }
    }, 500, true);
  }
}
