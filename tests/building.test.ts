import { describe, expect, it } from 'vitest';
import { BuilderWorkshop, PIXEL_BUILDABLES } from '../src/app/building';
import { ForestJourney } from '../src/app/forest';
import { MemoryStorage } from '../src/core/save';
import { makeGame, startGame, villageState } from './helpers';

describe('pixel construction and its forest effects', () => {
  it('distinguishes a revealed recipe from ownership and charges the full cost on success', () => {
    const g = startGame(villageState({ stores: { wood: 15 } }), { craftables: PIXEL_BUILDABLES });
    const workshop = new BuilderWorkshop(g);
    expect(workshop.options()).toEqual(['trap', 'cart']);
    expect(g.store.num('game.buildings.cart')).toBe(0);
    expect(workshop.build('cart')).toBe(false);
    expect(g.store.num('stores.wood')).toBe(15);
    g.store.set('stores.wood', 30);
    expect(workshop.build('cart')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(0);
    expect(g.store.num('game.buildings.cart')).toBe(1);
    g.store.set('stores.wood', 100);
    expect(workshop.build('cart')).toBe(false);
    expect(g.store.num('stores.wood')).toBe(100);
  });

  it('keeps unsupported recipes and their hints out of the current edition', () => {
    const g = startGame(villageState(), { craftables: PIXEL_BUILDABLES });
    expect(g.room.options()).toEqual({ build: ['trap', 'cart'], craft: [], buy: [] });
    expect(g.room.build('hut')).toBe(false);
    expect(g.store.num('stores.wood')).toBe(1000);
    expect(g.notifications.texts().join('\n')).not.toContain('more wanderers');
  });

  it('requires recovery, the room, warmth and no active event', () => {
    const g = startGame(villageState({ game: { builder: { level: 2 } } }));
    const workshop = new BuilderWorkshop(g);
    expect(workshop.available).toBe(false);
    expect(workshop.build('trap')).toBe(false);
    g.store.set('game.builder.level', 4);
    g.events.startEvent({ title: 'interruption', scenes: { start: { text: ['wait'], buttons: {} } } });
    expect(workshop.build('trap')).toBe(false);
    g.events.endEvent();
    g.travelTo('outside');
    expect(workshop.build('trap')).toBe(false);
    g.travelTo('room');
    g.store.set('game.temperature.value', 1);
    expect(workshop.build('trap')).toBe(false);
    expect(g.store.num('game.buildings.trap')).toBe(0);
    expect(g.store.num('stores.wood')).toBe(1000);
  });

  it('charges increasing trap costs and stops at ten', () => {
    const g = startGame(villageState());
    const workshop = new BuilderWorkshop(g);
    for (let i = 0; i < 10; i++) expect(workshop.build('trap')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(450); // 10 + 20 + ... + 100
    expect(workshop.build('trap')).toBe(false);
    expect(g.store.num('game.buildings.trap')).toBe(10);
    expect(g.store.num('stores.wood')).toBe(450);
  });

  it('makes the cart affect both gathering points without resetting or shortening cooldowns', () => {
    const g = startGame(villageState({ stores: { wood: 42 } }), { craftables: PIXEL_BUILDABLES });
    const trip = new ForestJourney(g);
    expect(trip.yieldFor('branches')).toBe(4);
    expect(new BuilderWorkshop(g).build('cart')).toBe(true);
    trip.travel('outside');
    expect(trip.yieldFor('branches')).toBe(20);
    expect(trip.yieldFor('deadwood')).toBe(40);
    expect(trip.gather('branches')).toBe(true);
    expect(trip.gather('deadwood')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(72);
    expect(trip.gather('branches')).toBe(false);
    expect(trip.remaining('branches')).toBe(20_000);
    expect(trip.remaining('deadwood')).toBe(45_000);
    const next = makeGame({ storage: new MemoryStorage(), craftables: PIXEL_BUILDABLES });
    expect(next.importCode(g.exportCode())).toBe(true);
    next.start();
    const restored = new ForestJourney(next);
    restored.restoreLocation();
    expect(restored.outside).toBe(true);
    expect(restored.yieldFor('branches')).toBe(20);
    expect(restored.gather('branches')).toBe(false);
    expect(next.store.num('stores.wood')).toBe(72);
  });

  it('checks only built traps in the forest and restores the shared 90-second cooldown', () => {
    const g = startGame(villageState({ stores: { wood: 100 } }));
    const trip = new ForestJourney(g);
    expect(trip.checkTraps()).toBeNull();
    trip.travel('outside');
    expect(trip.checkTraps()).toBeNull();
    trip.travel('room');
    expect(new BuilderWorkshop(g).build('trap')).toBe(true);
    expect(trip.checkTraps()).toBeNull();
    trip.travel('outside');
    g.rng = { random: () => 0.1 };
    expect(trip.checkTraps()).toEqual({ fur: 1 });
    expect(trip.checkTraps()).toBeNull();
    expect(g.store.num('stores.fur')).toBe(1);
    g.tick(10_000);
    const next = makeGame({ storage: new MemoryStorage() });
    next.importCode(g.exportCode()); next.start();
    const restored = new ForestJourney(next); restored.restoreLocation();
    expect(restored.trapCount).toBe(1);
    expect(restored.trapsRemaining).toBe(80_000);
    expect(restored.checkTraps()).toBeNull();
    next.rng = { random: () => 0.1 };
    next.tick(80_000);
    expect(restored.checkTraps()).toEqual({ fur: 1 });
    expect(next.store.num('stores.fur')).toBe(2);
  });
});
