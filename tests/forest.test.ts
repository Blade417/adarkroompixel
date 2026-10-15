import { describe, expect, it } from 'vitest';
import { ForestJourney, FORAGE } from '../src/app/forest';
import { MemoryStorage } from '../src/core/save';
import { ROOM } from '../src/core/data';
import { fitNarrow, toCss } from '../src/pixel/fit';
import { makeGame, startGame, villageState } from './helpers';

describe('the near-forest trip', () => {
  it('keeps a new opening locked until the existing forest unlock', () => {
    const g = startGame(), trip = new ForestJourney(g);
    expect(trip.travel('outside')).toBe(false);
    expect(trip.gather('branches')).toBe(false);
    g.room.tendFire();
    g.clock.run(ROOM.BUILDER_STATE_DELAY + ROOM.NEED_WOOD_DELAY + 1000, 1000);
    expect(trip.unlocked).toBe(true);
    expect(trip.travel('outside')).toBe(true);
  });

  it('awards each node once, preserves independent cooldowns across travelling, and returns to the fire', () => {
    const g = startGame(villageState({ stores: { wood: 0 } })), trip = new ForestJourney(g);
    expect(trip.gather('branches')).toBe(false);
    expect(trip.travel('outside')).toBe(true);
    expect(trip.gather('branches')).toBe(true);
    expect(trip.gather('branches')).toBe(false);
    expect(trip.gather('deadwood')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(12);
    trip.travel('room'); trip.travel('outside');
    expect(trip.gather('deadwood')).toBe(false);
    g.tick(FORAGE.branches.seconds * 1000);
    expect(trip.gather('branches')).toBe(true);
    expect(trip.gather('deadwood')).toBe(false);
    expect(g.store.num('stores.wood')).toBe(16);
    trip.travel('room');
    expect(g.room.tendFire()).toBe(true);
    expect(g.store.num('stores.wood')).toBe(15);
  });

  it('restores the forest and remaining cooldown from an exported save', () => {
    const storage = new MemoryStorage();
    const g = startGame(villageState({ stores: { wood: 0 } }), { storage });
    const trip = new ForestJourney(g); trip.travel('outside'); trip.gather('branches');
    g.tick(5000); const code = g.exportCode();
    const restored = makeGame({ storage: new MemoryStorage() });
    expect(restored.importCode(code)).toBe(true); restored.start();
    const next = new ForestJourney(restored); next.restoreLocation();
    expect(next.outside).toBe(true);
    expect(restored.store.num('stores.wood')).toBe(4);
    expect(next.remaining('branches')).toBeGreaterThanOrEqual(14_500);
    expect(next.gather('branches')).toBe(false);
    restored.tick(15_000);
    expect(next.gather('branches')).toBe(true);
    expect(restored.store.num('stores.wood')).toBe(8);
  });

  it('blocks travel and gathering during events and keeps room time running outside', () => {
    const g = startGame(villageState({ stores: { wood: 0 } })), trip = new ForestJourney(g);
    trip.travel('outside');
    g.events.startEvent({ title: 'test interruption', scenes: { start: { text: ['wait'], buttons: {} } } });
    expect(g.events.active()).not.toBeNull();
    expect(trip.travel('room')).toBe(false);
    expect(trip.gather('deadwood')).toBe(false);
    g.events.endEvent();
    g.clock.run(ROOM.FIRE_COOL_DELAY + 1000, 1000);
    expect(g.room.fire).toBeLessThan(4);
    expect(g.active).toBe('outside');
  });

  it('keeps the room door and hearth, and all forest nodes, inside the 390px crop', () => {
    const room = fitNarrow(390, 300, 1, 224), forest = fitNarrow(390, 300, 1, 240);
    for (const [x, width] of [[47,58], [328,74]]) {
      const p = toCss(room,x,150); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x+width).toBeLessThanOrEqual(room.cssW);
    }
    for (const [x,width] of [[106,44],[174,64],[263,100]]) {
      const p = toCss(forest,x,160); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x+width).toBeLessThanOrEqual(forest.cssW);
    }
  });
});
