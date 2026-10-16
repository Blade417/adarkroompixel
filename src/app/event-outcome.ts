import type { Game } from '../core/game';

export interface EventChange { kind: 'stores' | 'buildings' | 'population'; id: string; amount: number }
type Snapshot = Record<string, number>;

/** Immediate event effects only: excludes passive income accrued while reading choices. */
export class EventOutcome {
  changes: EventChange[] = [];
  private before: Snapshot = {};
  private choosing = false;

  constructor(private readonly game: Game) {
    game.bus.on(event => {
      if (event.type === 'event:start') { this.before = this.snapshot(); this.changes = []; }
      if (event.type === 'event:scene' && !this.choosing) this.changes = this.diff(this.before, this.snapshot());
    });
  }

  choose(id: string): boolean {
    const before = this.snapshot(), previousScene = this.game.events.active()?.scene;
    this.choosing = true;
    let ok = false;
    try { ok = this.game.events.click(id); }
    finally { this.choosing = false; }
    if (ok) {
      const changes = this.diff(before, this.snapshot());
      if (changes.length || previousScene !== this.game.events.active()?.scene) this.changes = changes;
      this.game.requestSave();
    }
    return ok;
  }

  private snapshot(): Snapshot {
    const snapshot: Snapshot = { 'population:residents': this.game.outside.population };
    for (const [kind, path] of [['stores', 'stores'], ['buildings', 'game.buildings']] as const) {
      for (const [id, count] of Object.entries(this.game.store.get(path) ?? {})) {
        if (typeof count === 'number') snapshot[`${kind}:${id}`] = count;
      }
    }
    return snapshot;
  }

  private diff(before: Snapshot, after: Snapshot): EventChange[] {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(key => {
      const amount = (after[key] ?? 0) - (before[key] ?? 0), split = key.indexOf(':');
      return amount ? [{ kind: key.slice(0, split) as EventChange['kind'], id: key.slice(split + 1), amount }] : [];
    });
  }
}
