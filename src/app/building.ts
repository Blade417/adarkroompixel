import type { Game } from '../core/game';

/** Only these construction recipes have playable pixel-edition interactions so far. */
export const PIXEL_BUILDABLES = ['trap', 'cart'] as const;
export type PixelBuildable = typeof PIXEL_BUILDABLES[number];

export class BuilderWorkshop {
  constructor(private readonly game: Game) {}

  get available(): boolean { return this.game.room.builderLevel >= 4; }
  options(): PixelBuildable[] {
    return this.game.room.options().build.filter((id): id is PixelBuildable =>
      PIXEL_BUILDABLES.some(supported => supported === id));
  }

  build(id: PixelBuildable): boolean {
    const g = this.game;
    if (g.over || !this.available || g.active !== 'room' || g.keyLock || g.events.active() ||
      !PIXEL_BUILDABLES.some(supported => supported === id) || !this.options().includes(id)) return false;
    const built = g.room.build(id);
    if (built) g.requestSave();
    return built;
  }
}
