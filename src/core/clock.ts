/**
 * Virtual game clock. All gameplay timing goes through it, so the same rules run
 * in real time in the browser and instantly (via advance) in tests.
 *
 * Mirrors Engine.setTimeout / setInterval of the original: when `hyper` is on,
 * scheduled durations are halved unless `exact` is requested.
 */
export type TimerId = number;

interface Timer {
  id: TimerId;
  due: number;
  interval: number | null;
  fn: () => void;
}
export interface TimerSnapshot { remaining: number; interval: number | null }

export class Clock {
  now = 0;
  hyper = false;
  private timers = new Map<TimerId, Timer>();
  private nextId = 1;
  private running = false;

  private scale(ms: number, exact?: boolean): number {
    return this.hyper && !exact ? ms / 2 : ms;
  }

  setTimeout(fn: () => void, ms: number, exact?: boolean): TimerId {
    const id = this.nextId++;
    this.timers.set(id, { id, due: this.now + Math.max(0, this.scale(ms, exact)), interval: null, fn });
    return id;
  }

  setInterval(fn: () => void, ms: number, exact?: boolean): TimerId {
    const id = this.nextId++;
    const interval = Math.max(1, this.scale(ms, exact));
    this.timers.set(id, { id, due: this.now + interval, interval, fn });
    return id;
  }

  clear(id: TimerId | null | undefined): void {
    if (id != null) this.timers.delete(id);
  }

  has(id: TimerId | null | undefined): boolean {
    return id != null && this.timers.has(id);
  }

  /** time left on a timer in ms (0 if gone) */
  remaining(id: TimerId | null | undefined): number {
    const t = id != null ? this.timers.get(id) : undefined;
    return t ? Math.max(0, t.due - this.now) : 0;
  }

  snapshot(id: TimerId | null | undefined): TimerSnapshot | null {
    const t = id == null ? undefined : this.timers.get(id);
    return t ? { remaining: Math.max(0, t.due - this.now), interval: t.interval } : null;
  }

  /** Restore already-scaled residual time; never applies hyper scaling a second time. */
  resume(fn: () => void, saved: TimerSnapshot): TimerId {
    const id = this.nextId++;
    this.timers.set(id, { id, due: this.now + saved.remaining, interval: saved.interval, fn });
    return id;
  }

  get pending(): number {
    return this.timers.size;
  }

  /** Advance time, firing every timer that becomes due (including ones scheduled meanwhile), in order. */
  advance(ms: number): void {
    if (this.running) throw new Error('Clock.advance is not re-entrant');
    this.running = true;
    const target = this.now + ms;
    try {
      for (;;) {
        let next: Timer | null = null;
        for (const t of this.timers.values()) {
          if (t.due <= target && (next === null || t.due < next.due || (t.due === next.due && t.id < next.id))) next = t;
        }
        if (!next) break;
        this.now = next.due;
        if (next.interval !== null) {
          next.due += next.interval;
        } else {
          this.timers.delete(next.id);
        }
        next.fn();
      }
      this.now = target;
    } finally {
      this.running = false;
    }
  }

  /** advance in steps (useful in tests for frame-driven systems) */
  run(ms: number, step = 1000): void {
    let left = ms;
    while (left > 0) {
      const d = Math.min(step, left);
      this.advance(d);
      left -= d;
    }
  }
}
