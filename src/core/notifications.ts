/**
 * Message log. Same rules as the original Notifications module:
 * a message aimed at a location the player is not in waits in that location's queue
 * and is printed on arrival (unless noQueue, in which case it is dropped).
 */
import type { LocationId } from './types';

export interface LogEntry {
  /** translated, terminated text */
  text: string;
  /** game-clock time it was printed */
  time: number;
  location: LocationId | null;
}

export class Notifications {
  log: LogEntry[] = [];
  private queues = new Map<LocationId, string[]>();
  private listeners = new Set<(e: LogEntry) => void>();
  static MAX_LOG = 500;

  constructor(
    private activeLocation: () => LocationId | null,
    private now: () => number,
    private terminate: (s: string) => string
  ) {}

  subscribe(fn: (e: LogEntry) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(location: LocationId | null, text: string | undefined, noQueue?: boolean): void {
    if (text === undefined || text === null || text === '') return;
    text = this.terminate(text);
    if (location !== null && this.activeLocation() !== location) {
      if (!noQueue) {
        if (!this.queues.has(location)) this.queues.set(location, []);
        this.queues.get(location)!.push(text);
      }
    } else {
      this.print(text, location);
    }
  }

  /** messages waiting at a location (for "unread" markers on tabs) */
  queued(location: LocationId): number {
    return this.queues.get(location)?.length ?? 0;
  }

  printQueue(location: LocationId): void {
    const q = this.queues.get(location);
    while (q && q.length) this.print(q.shift()!, location);
  }

  private print(text: string, location: LocationId | null): void {
    const entry: LogEntry = { text, time: this.now(), location };
    this.log.push(entry);
    if (this.log.length > Notifications.MAX_LOG) this.log.splice(0, this.log.length - Notifications.MAX_LOG);
    for (const fn of [...this.listeners]) fn(entry);
  }

  /** texts printed so far (newest last) */
  texts(): string[] {
    return this.log.map((e) => e.text);
  }
}
