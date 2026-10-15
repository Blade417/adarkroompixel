import { describe, expect, it } from 'vitest';
import { lastLog, logHas, startGame, villageState } from './helpers';

const SEC = 1000;

describe('the opening (Room)', () => {
  it('starts dark and freezing', () => {
    const g = startGame();
    expect(g.active).toBe('room');
    expect(g.room.fire).toBe(0);
    expect(g.room.temperature).toBe(0);
    expect(g.notifications.texts()).toEqual(['the room is freezing.', 'the fire is dead.']);
    expect(g.title()).toBe('A Dark Room');
  });

  it('the first fire is free, then the stranger arrives on the original schedule', () => {
    const g = startGame();
    expect(g.room.tendFire()).toBe(true);
    expect(g.room.fire).toBe(3);
    expect(g.title()).toBe('A Firelit Room');
    expect(logHas(g, 'the light from the fire spills from the windows, out into the dark')).toBe(true);

    // stoking is on a 10 s cooldown
    expect(g.room.tendFire()).toBe(false);

    g.tick(30 * SEC);
    expect(g.room.builderLevel).toBe(1);
    expect(logHas(g, 'a ragged stranger stumbles through the door')).toBe(true);
    expect(g.room.temperature).toBe(1);
    expect(g.store.get('stores.wood')).toBeUndefined();

    g.tick(15 * SEC);
    expect(g.store.get('stores.wood')).toBe(4);
    expect(g.tabs()).toEqual(['room', 'outside']);
    expect(logHas(g, 'the wood is running out')).toBe(true);

    // temperature climbs one step per 30 s towards the fire level (3)
    g.tick(45 * SEC);
    expect(g.room.temperature).toBe(3);
    expect(g.room.builderLevel).toBe(2);
    g.tick(30 * SEC);
    expect(g.room.builderLevel).toBe(3);

    // she gets up the next time we come into the room
    expect(g.travelTo('outside')).toBe(true);
    expect(logHas(g, 'the sky is grey and the wind blows relentlessly')).toBe(true);
    g.travelTo('room');
    expect(g.room.builderLevel).toBe(4);
    expect(g.getIncome('builder')).toMatchObject({ delay: 10, stores: { wood: 2 } });
    expect(lastLog(g)[0]).toContain('she builds things');
  });

  it('the fire cools one level every five minutes', () => {
    const g = startGame();
    g.room.tendFire();
    g.tick(5 * 60 * SEC);
    expect(g.room.fire).toBe(2);
    g.tick(10 * 60 * SEC);
    expect(g.room.fire).toBe(0);
  });

  it('lighting costs 5 wood once wood exists; stoking 1', () => {
    const g = startGame(villageState({ game: { fire: { value: 0, text: 'dead' }, builder: { level: -1 } }, stores: { wood: 3 } }));
    expect(g.room.tendFire()).toBe(false);
    expect(lastLog(g)[0]).toBe('not enough wood to get the fire going.');
    g.store.set('stores.wood', 6);
    expect(g.room.tendFire()).toBe(true);
    expect(g.store.get('stores.wood')).toBe(1);
    g.tick(10 * SEC);
    expect(g.room.tendFire()).toBe(true);
    expect(g.store.get('stores.wood')).toBe(0);
    expect(g.room.fire).toBe(4);
  });

  it('the builder keeps a low fire going', () => {
    const g = startGame(villageState({ game: { fire: { value: 2, text: 'flickering' } } }));
    g.tick(5 * 60 * SEC);
    // she adds one, then it cools one: stays at flickering, one wood spent
    expect(g.room.fire).toBe(2);
    expect(logHas(g, 'builder stokes the fire')).toBe(true);
  });
});

describe('building, crafting and trading', () => {
  it('reveals options when half the wood is there and announces them once', () => {
    const g = startGame(villageState({ stores: { wood: 5 } }));
    expect(g.room.options().build).toEqual(['trap']);
    expect(logHas(g, 'builder says she can make traps')).toBe(true);
    expect(g.room.options().build).not.toContain('hut');
  });

  it('uses the original cost curves', () => {
    const g = startGame(villageState({ stores: { wood: 10000 } }));
    expect(g.room.costOf('trap')).toEqual({ wood: 10 });
    g.room.build('trap');
    expect(g.room.costOf('trap')).toEqual({ wood: 20 });
    expect(g.room.costOf('hut')).toEqual({ wood: 100 });
    g.room.build('hut');
    g.room.build('hut');
    expect(g.room.costOf('hut')).toEqual({ wood: 200 });
    expect(g.store.get('stores.wood')).toBe(10000 - 10 - 100 - 150);
    expect(g.store.get('game.buildings')).toMatchObject({ trap: 1, hut: 2 });
  });

  it('enforces maximums and announces them once', () => {
    const g = startGame(villageState({ stores: { wood: 100000 } }));
    for (let i = 0; i < 12; i++) g.room.build('trap');
    expect(g.store.get('game.buildings.trap')).toBe(10);
    expect(g.notifications.texts().filter((t) => t === "more traps won't help now.")).toHaveLength(1);
  });

  it('the builder will not build in the cold', () => {
    const g = startGame(villageState({ game: { temperature: { value: 1, text: 'cold' } } }));
    expect(g.room.build('trap')).toBe(false);
    expect(lastLog(g)[0]).toBe('builder just shivers.');
  });

  it('crafting needs a workshop; trading needs a trading post', () => {
    const g = startGame(villageState({ stores: { wood: 5000, leather: 500, fur: 1000, scales: 100, teeth: 100 } }));
    expect(g.room.options().craft).toEqual([]);
    expect(g.room.options().buy).toEqual([]);
    g.room.build('workshop');
    g.room.build('trading post');
    expect(g.room.options().craft).toContain('waterskin');
    expect(g.room.options().buy).toEqual(expect.arrayContaining(['scales', 'teeth', 'compass']));
    expect(g.room.buy('compass')).toBe(true);
    expect(g.store.get('stores.compass')).toBe(1);
    expect(g.room.buy('compass')).toBe(false); // maximum 1
    expect(g.tabs()).toContain('path');
    expect(logHas(g, 'the compass points')).toBe(true);
  });
});
