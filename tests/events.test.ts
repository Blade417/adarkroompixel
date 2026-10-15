import { describe, expect, it } from 'vitest';
import { MemoryStorage, pickScene, scriptedRng } from '../src/core';
import { logHas, makeGame, startGame, villageState } from './helpers';

const SEC = 1000;

describe('scene branching', () => {
  it('picks the smallest probability key above the roll', () => {
    const next = { '0.3': 'stuff', '1': 'nothing' };
    expect(pickScene(next, 0.29)).toBe('stuff');
    expect(pickScene(next, 0.3)).toBe('nothing');
    expect(pickScene({ '1': 'cloth', '0.5': 'scales', '0.8': 'teeth' }, 0.6)).toBe('teeth');
  });
});

describe('random events (original content)', () => {
  it('schedules events every 3-6 minutes from the available pool', () => {
    const g = startGame(villageState({ stores: { fur: 500 } }));
    g.rng = scriptedRng([0]);
    g.events.stop();
    g.events.scheduleNextEvent();
    g.tick(3 * 60 * SEC);
    expect(g.events.active()).not.toBeNull();
    expect(g.keyLock).toBe(true);
    expect(g.travelTo('outside')).toBe(false);
  });

  it('The Nomad trades furs for goods', () => {
    const g = startGame(villageState({ stores: { fur: 400, scales: 30, teeth: 10 } }));
    g.events.startEvent(g.content.events.Room[0]);
    const buttons = Object.fromEntries(g.events.buttons().map((b) => [b.id, b.enabled]));
    expect(buttons).toMatchObject({ buyScales: true, buyTeeth: true, buyCompass: true, goodbye: true });
    g.events.click('buyScales');
    expect(g.store.get('stores')).toMatchObject({ fur: 300, scales: 31 });
    g.events.click('goodbye');
    expect(g.events.active()).toBeNull();
    expect(g.keyLock).toBe(false);
  });

  it('disables choices that cannot be paid for', () => {
    const g = startGame(villageState({ stores: { fur: 60 } }));
    g.events.startEvent(g.content.events.Room[3]); // the beggar
    const b = Object.fromEntries(g.events.buttons().map((x) => [x.id, x.enabled]));
    expect(b).toEqual({ '50furs': true, '100furs': false, deny: true });
  });

  it('The Shady Builder: 60% steals, 40% builds', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 5 } }, stores: { wood: 1000 } }));
    g.events.startEvent(g.content.events.Room[4]);
    g.rng = scriptedRng([0.7]);
    g.events.click('build');
    expect(g.store.get('game.buildings.hut')).toBe(6);
    expect(g.store.get('stores.wood')).toBe(700);
  });

  it('The Mysterious Wanderer returns 60 s later with interest', () => {
    const g = startGame(villageState({ stores: { wood: 1000 } }));
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Room[5]);
    g.events.click('wood100');
    expect(g.store.get('stores.wood')).toBe(900);
    g.events.click('leave');
    g.tick(59 * SEC);
    expect(g.store.get('stores.wood')).toBe(900);
    g.tick(1 * SEC);
    expect(g.store.get('stores.wood')).toBe(1200);
    expect(logHas(g, 'the mysterious wanderer returns, cart piled high with wood')).toBe(true);
  });

  it('(bug fix) the wanderer still returns after a reload', () => {
    const storage = new MemoryStorage();
    const g = startGame(villageState({ stores: { fur: 1000 } }), { storage });
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Room[6]);
    g.events.click('fur500');
    g.events.click('leave');
    g.tick(20 * SEC);
    g.saveNow();
    expect(g.store.get('wait')).toBeTruthy();

    const h = makeGame({ storage });
    h.start();
    expect(h.store.get('stores.fur')).toBe(500);
    h.tick(39 * SEC);
    expect(h.store.get('stores.fur')).toBe(500);
    h.tick(2 * SEC);
    expect(h.store.get('stores.fur')).toBe(2000);
    expect(h.store.get('wait')).toBeUndefined();
  });

  it('The Thief: hanging him returns what was stolen; sparing him teaches stealth', () => {
    const base = villageState({ game: { thieves: 1, stolen: { wood: 50, fur: 10 } }, income: { thieves: { delay: 10, stores: { wood: -10 } } }, stores: { wood: 0, fur: 0 } });
    const g = startGame(base);
    g.events.startEvent(g.content.events.Global[0]);
    g.events.click('kill');
    expect(g.store.get('stores')).toMatchObject({ wood: 50, fur: 10 });
    expect(g.store.get('game.thieves')).toBe(2);
    expect(g.store.get('income.thieves')).toBeUndefined();

    const h = startGame(base);
    h.events.startEvent(h.content.events.Global[0]);
    h.events.click('spare');
    expect(h.hasPerk('stealthy')).toBe(true);
  });

  it('The Master teaches a perk for food, fur and a torch', () => {
    const g = startGame(villageState({ features: { location: { world: true } }, stores: { 'cured meat': 100, fur: 100, torch: 1 } }));
    g.events.startEvent(g.content.events.Room[8]);
    g.events.click('agree');
    g.events.click('force');
    expect(g.hasPerk('barbarian')).toBe(true);
    expect(g.store.get('stores')).toMatchObject({ 'cured meat': 0, fur: 0, torch: 0 });
  });

  it('A Fire burns down a full hut and its people', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 20 }, population: 80 } }));
    g.travelTo('outside');
    g.events.startEvent(g.content.events.Outside[1]);
    expect(g.store.get('game.buildings.hut')).toBe(19);
    expect(g.store.get('game.population')).toBe(76);
  });
});
