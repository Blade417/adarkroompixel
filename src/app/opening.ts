import type { Game } from '../core/game';

/** Give the recovery beat a pause before continuing the single-room edition's story. */
export class OpeningProgress {
  private readyAt: number | null = null;

  constructor(private readonly game: Game) {}

  update(): void {
    const g = this.game;
    if (g.active !== 'room' || g.room.builderLevel !== 3 || g.room.temperature < 3) {
      this.readyAt = null;
      return;
    }
    this.readyAt ??= g.clock.now + 12_000;
    if (g.clock.now >= this.readyAt && !g.events.active()) g.room.offerHelp();
  }
}
