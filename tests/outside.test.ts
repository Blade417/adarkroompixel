import { describe, expect, it } from 'vitest';
import { scriptedRng } from '../src/core';
import { logHas, startGame, villageState } from './helpers';

const SEC = 1000;

describe('the village (Outside)', () => {
  it('gathering wood: +10, +50 with a cart, 60 s cooldown', () => {
    const g = startGame(villageState({ stores: { wood: 0 } }));
    g.travelTo('outside');
    expect(g.outside.gatherWood()).toBe(true);
    expect(g.store.get('stores.wood')).toBe(10);
    expect(g.outside.gatherWood()).toBe(false);
    g.tick(60 * SEC);
    g.store.set('game.buildings["cart"]', 1);
    g.outside.gatherWood();
    expect(g.store.get('stores.wood')).toBe(60);
  });

  it('traps: one roll per trap plus one per baited trap, bait is used up', () => {
    const g = startGame(villageState({ game: { buildings: { trap: 4 } }, stores: { bait: 2 } }));
    g.travelTo('outside');
    g.rng = scriptedRng([0.1]); // every roll -> fur
    const drops = g.outside.checkTraps();
    expect(drops).toEqual({ fur: 6 });
    expect(g.store.get('stores.fur')).toBe(6);
    expect(g.store.get('stores.bait')).toBe(0);
    expect(logHas(g, 'the traps contain scraps of fur')).toBe(true);
    expect(g.outside.checkTraps()).toBeNull(); // 90 s cooldown
  });

  it('trap drop table matches the original thresholds', () => {
    const g = startGame(villageState({ game: { buildings: { trap: 6 } } }));
    g.travelTo('outside');
    g.rng = scriptedRng([0.49, 0.74, 0.84, 0.92, 0.99, 0.999]);
    expect(g.outside.checkTraps()).toEqual({ fur: 1, meat: 1, scales: 1, teeth: 1, cloth: 1, charm: 1 });
  });

  it('population grows into empty huts (50%-100% of the free space)', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 5 } } }));
    expect(g.outside.maxPopulation()).toBe(20);
    g.rng = scriptedRng([0.999]);
    g.outside.increasePopulation();
    expect(g.store.get('game.population')).toBe(19);
    g.rng = scriptedRng([0]);
    g.outside.increasePopulation();
    // one free slot: floor(0 * 0.5 + 0.5) = 0 is bumped to the minimum of 1
    expect(g.store.get('game.population')).toBe(20);
  });

  it('titles follow the hut count', () => {
    const g = startGame(villageState());
    const cases: [number, string][] = [[0, 'A Silent Forest'], [1, 'A Lonely Hut'], [4, 'A Tiny Village'], [8, 'A Modest Village'], [14, 'A Large Village'], [15, 'A Raucous Village']];
    for (const [huts, title] of cases) {
      g.store.set('game.buildings["hut"]', huts);
      expect(g.title('outside')).toBe(title);
    }
  });

  it('workers: buildings unlock jobs, gatherers are the rest, income every 10 s', () => {
    const g = startGame(villageState({
      game: { buildings: { hut: 3, lodge: 1 }, population: 10 },
      stores: { wood: 0, fur: 0, meat: 0 }
    }));
    expect(Object.keys(g.store.get('game.workers'))).toEqual(['hunter', 'trapper']);
    g.outside.increaseWorker('hunter', 4);
    g.outside.increaseWorker('hunter', 10); // only 6 gatherers left
    expect(g.store.get('game.workers.hunter')).toBe(10);
    expect(g.outside.numGatherers()).toBe(0);
    g.outside.decreaseWorker('hunter', 6);
    // first collection happens on the first 1 s tick, then every 10 s
    g.tick(1 * SEC);
    expect(g.store.get('stores.wood')).toBe(6); // 6 gatherers (this fixture has no builder income)
    expect(g.store.get('stores.fur')).toBe(2);
    g.tick(10 * SEC);
    expect(g.store.get('stores.wood')).toBe(12);
    expect(g.netIncome().wood).toBeCloseTo(0.6);
  });

  it('a worker group stalls when its inputs run out', () => {
    const g = startGame(villageState({
      game: { buildings: { hut: 3, tannery: 1 }, population: 4, workers: { tanner: 4 } },
      stores: { wood: 0, fur: 10, leather: 0 }
    }));
    g.tick(1 * SEC);
    // 4 tanners need 20 fur: the whole group skips this round
    expect(g.store.get('stores.leather')).toBe(0);
    expect(g.store.get('stores.fur')).toBe(10);
  });

  it('killing villagers takes them out of jobs once the gatherers are gone', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 3, lodge: 1 }, population: 10, workers: { hunter: 8, trapper: 0 } } }));
    g.outside.killVillagers(5);
    expect(g.store.get('game.population')).toBe(5);
    expect(g.store.get('game.workers.hunter')).toBe(5);
  });

  it('thieves appear once a store passes 5000 after the world is found', () => {
    const g = startGame(villageState({ features: { location: { world: true } }, stores: { wood: 4000 } }));
    expect(g.store.get('game.thieves')).toBeUndefined();
    g.store.set('stores.wood', 6000);
    expect(g.store.get('game.thieves')).toBe(1);
    expect(g.getIncome('thieves')).toMatchObject({ stores: { wood: -10, fur: -5, meat: -5 } });
  });
});
