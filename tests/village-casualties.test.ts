import { describe, expect, it } from 'vitest';
import { EventOutcome } from '../src/app/event-outcome';
import { inhabitants, villageView } from '../src/app/village';
import { MemoryStorage, scriptedRng } from '../src/core';
import { makeGame, startGame, villageState } from './helpers';

function village(population = 40, workers: Record<string, number> = {}, buildings: Record<string, number> = {}) {
  const g = startGame(villageState({ marketing: { penrose: true },
    game: { population, workers, buildings: { hut: 20, ...buildings } },
    stores: { wood: 0, fur: 0, meat: 0 } }));
  g.travelTo('outside');
  return g;
}
function candidates(g: ReturnType<typeof village>) {
  const { Global, Room, Outside, Marketing } = g.content.events;
  return [...Global, ...Room, ...Outside, ...Marketing].filter(e => e.isAvailable?.());
}

describe('village event eligibility and consecutive attacks', () => {
  it('does not force consecutive attacks when only one event initially qualifies', () => {
    const g = village();
    expect(candidates(g).map(e => e.title)).toEqual(['A Beast Attack']);
    g.rng = scriptedRng([0]); g.events.triggerEvent();
    expect(g.events.active()!.def.title).toBe('A Beast Attack');
    g.events.click('end');
    expect(g.events.candidates()).not.toContain(g.content.events.Outside[4]);
    g.events.triggerEvent();
    expect(g.events.active()?.def.title).not.toBe('A Beast Attack');
    expect(g.outside.population).toBe(39);
  });

  it('keeps visitor alternatives available after a cameo instead of repeating beast attacks', () => {
    const g = village(); g.store.remove('marketing.penrose');
    g.rng = scriptedRng([.999]); g.events.triggerEvent();
    expect(g.events.active()!.def.title).toBe('Penrose');
    expect(g.events.click('give in')).toBe(true); // Core updates a flag; no network/browser navigation.
    expect(g.store.get('marketing.penrose')).toBe(true);
    g.rng = scriptedRng([0]); g.events.triggerEvent();
    expect(g.events.active()!.def.title).toBe('A Beast Attack');
    g.events.click('end');
    expect(g.events.candidates()).toContain(g.content.events.Room[0]);
    expect(g.events.candidates()).not.toContain(g.content.events.Outside[4]);
  });

  it('unlocks alternatives only when their original conditions are satisfied', () => {
    const g = village(20, {}, { trap: 1 });
    expect(candidates(g).map(e => e.title)).toEqual(['A Ruined Trap', 'A Beast Attack']);
    g.store.set('stores.medicine', 1);
    expect(candidates(g).map(e => e.title)).toContain('Sickness');
    g.store.set('game.population', 60);
    expect(candidates(g).map(e => e.title)).toContain('Fire');
    expect(candidates(g).map(e => e.title)).toContain('Plague');
    g.store.set('game.cityCleared', true);
    expect(candidates(g).map(e => e.title)).toContain('A Military Raid');
  });

  it('requires residents but keeps village attacks eligible while exploring the world', () => {
    const g = village(0);
    expect(candidates(g)).toEqual([]);
    g.store.set('game.population', 40); g.active = 'world';
    expect(candidates(g)).toContain(g.content.events.Outside[4]);
  });
});

describe('actual village casualties, workforce and income', () => {
  it.each([0, .49, .999])('deducts the scaled beast roll once at scene load (%s)', roll => {
    const g = village(20), feedback = new EventOutcome(g);
    g.rng = scriptedRng([roll]);
    g.events.startEvent(g.content.events.Outside[4]);
    const dead = Math.floor(roll * 3) + 1;
    expect(g.outside.population).toBe(20 - dead);
    expect(feedback.changes).toContainEqual({ kind: 'population', id: 'residents', amount: -dead });
    expect(g.store.num('stores.fur')).toBe(30);
    expect(g.store.num('stores.meat')).toBe(30);
    expect(g.store.num('stores.teeth')).toBe(3);
    g.events.buttons(); g.events.buttons();
    expect(g.outside.population).toBe(20 - dead);
    feedback.choose('end');
    expect(g.outside.population).toBe(20 - dead);
    expect(g.outside.huts).toBe(20);
  });

  it('caps actual deaths at the population and removes every job when the whole village dies', () => {
    const g = village(1, { hunter: 1, tanner: 0 }, { lodge: 1, tannery: 1 });
    const feedback = new EventOutcome(g); g.rng = scriptedRng([.999]);
    g.events.startEvent(g.content.events.Outside[4]);
    expect(g.outside.population).toBe(0);
    expect(g.outside.numGatherers()).toBe(0);
    expect(g.store.get('game.workers')).toMatchObject({ hunter: 0, tanner: 0 });
    expect(feedback.changes).toContainEqual({ kind: 'population', id: 'residents', amount: -1 });
    expect(g.getIncome('hunter').stores).toEqual({ fur: 0, meat: 0 });
    expect(Object.values(g.getIncome('tanner').stores!).every(n => n === 0)).toBe(true);
    g.events.endEvent(); g.events.stop(); g.outside.stop();
    g.store.setM('stores', { fur: 0, meat: 0, leather: 0 });
    g.tick(10_000);
    expect(g.store.get('stores')).toMatchObject({ fur: 0, meat: 0, leather: 0 });
  });

  it('takes gatherers first, then reduces assigned jobs in the original saved order', () => {
    const g = village(12, { hunter: 5, tanner: 3, charcutier: 2 }, { lodge: 1, tannery: 1, smokehouse: 1 });
    g.outside.killVillagers(2);
    expect(g.store.get('game.workers')).toMatchObject({ hunter: 5, tanner: 3, charcutier: 2 });
    expect(g.outside.numGatherers()).toBe(0);
    g.outside.killVillagers(6);
    expect(g.outside.population).toBe(4);
    expect(g.store.get('game.workers')).toMatchObject({ hunter: 0, tanner: 2, charcutier: 2 });
    expect(g.getIncome('hunter').stores).toEqual({ fur: 0, meat: 0 });
    expect(g.getIncome('tanner').stores).toEqual({ fur: -10, leather: 2 });
    const view = villageView(g);
    expect(Array.from({ length: 20 }, (_, i) => inhabitants(view, i))).toEqual([4, ...Array(19).fill(0)]);
  });

  it('keeps resident, assignment and household totals consistent across casualty boundaries', () => {
    for (let population = 0; population <= 80; population += 4) {
      for (const killed of [0, 1, 5, 10, 40, 89]) {
        const hunter = Math.floor(population * .6), tanner = Math.floor(population * .3);
        const g = village(population, { hunter, tanner }, { lodge: 1, tannery: 1 });
        g.outside.killVillagers(killed);
        const remaining = Math.max(0, population - killed);
        const assigned = Object.values(g.store.get('game.workers') as Record<string, number>);
        expect(g.outside.population).toBe(remaining);
        expect(assigned.every(n => Number.isInteger(n) && n >= 0)).toBe(true);
        expect(assigned.reduce((a,b) => a+b, 0)).toBe(Math.min(hunter + tanner, remaining));
        expect(assigned.reduce((a,b) => a+b, 0) + g.outside.numGatherers()).toBe(remaining);
        expect(Array.from({ length: 20 }, (_, i) => inhabitants(villageView(g), i)).reduce((a,b) => a+b, 0)).toBe(remaining);
        g.stop();
      }
    }
  });

  it('reloads the deducted population and production without replaying the attack', () => {
    const storage = new MemoryStorage();
    const g = startGame(villageState({ game: { buildings: { hut: 4, lodge: 1 }, population: 12, workers: { hunter: 12 } } }), { storage });
    g.rng = scriptedRng([.999]);
    g.events.startEvent(g.content.events.Outside[4]);
    expect(g.outside.population).toBe(10);
    g.saveNow(); g.stop();
    const next = makeGame({ storage }); next.start();
    expect(next.outside.population).toBe(10);
    expect(next.store.num('game.workers.hunter')).toBe(10);
    expect(next.getIncome('hunter').stores).toEqual({ fur: 5, meat: 5 });
    expect(next.events.active()?.def).toBe(next.content.events.Outside[4]);
    expect(next.store.num('stores.fur')).toBe(20);
  });

  it('leaves homes available for new arrivals after deaths, without resurrecting assigned workers', () => {
    const g = village(4, { hunter: 4 }, { hut: 1, lodge: 1 });
    g.outside.killVillagers(4); g.rng = scriptedRng([0]);
    g.outside.increasePopulation();
    expect(g.outside.population).toBe(2); // One intact hut: original half-of-free-capacity arrival rule.
    expect(g.store.num('game.workers.hunter')).toBe(0);
    expect(g.outside.numGatherers()).toBe(2);
  });
});
