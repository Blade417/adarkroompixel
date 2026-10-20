import type { Game } from '../game';
import type { ContentEvents } from './runner';

export const SETTLEMENT_EVENTS = {
  repeatDelay: 8 * 60_000,
  disasterDelay: 6 * 60_000,
  beastDelay: 12 * 60_000,
  maxPending: 6
};

/** Rewards reflect the settlement before casualties, rather than a flat early-game windfall. */
export function beastReward(population: number): Record<string, number> {
  const amount = Math.min(100, 5 + Math.floor(Math.max(0, population) / 4) * 5);
  return { fur: amount, meat: amount, teeth: Math.max(1, Math.floor(amount / 10)) };
}

/** Edition overrides live here; the archived original scripts remain intact. */
export function balanceSettlementEvents(g: Game, events: ContentEvents): void {
  const attack = events.Outside[4]?.scenes.start;
  if (attack) {
    attack.onLoad = function () {
      const population = g.outside.population;
      this.reward = beastReward(population);
      const limit = Math.min(10, Math.max(1, Math.ceil(population / 8)));
      g.outside.killVillagers(Math.floor(g.rng.random() * limit) + 1);
    };
  }
  const catchScene = events.Outside[0]?.scenes.catch;
  if (catchScene) catchScene.onLoad = function () { this.reward = beastReward(g.outside.population); };
}
