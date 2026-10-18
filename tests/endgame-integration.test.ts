import { describe, expect, it } from 'vitest';
import { Endgame } from '../src/app/endgame';
import { Expedition } from '../src/app/expedition';
import { ForestJourney } from '../src/app/forest';
import { MemoryStorage, SAVE_KEY, scriptedRng } from '../src/core';
import { expeditionState, makeGame, startGame, villageState } from './helpers';

function lateState() {
  return villageState({
    features: { location: { fabricator: true, spaceShip: true } },
    game: { spaceShip: { hull: 3, thrusters: 2 } },
    stores: { 'alien alloy': 20, wood: 100 },
    previous: { score: 500 }
  });
}

describe('live endgame adapter', () => {
  it('unlocks the ship only after discovering the original wreck event and bringing it home', () => {
    const state = expeditionState({ stores: { compass: 1, 'cured meat': 10 } });
    state.game.world.map[31][30] = 'W';
    const g = startGame(state), ex = new Expedition(g), m = new Endgame(g);
    ex.open(); ex.pack('cured meat', 2); ex.depart();
    expect(m.open('ship')).toBe(false);
    expect(ex.move('east')).toBe(true);
    expect(g.events.active()?.def.title).toBe('A Crashed Ship');
    expect(g.ship.initialized).toBe(false);
    g.events.click('leavel');
    expect(ex.move('west')).toBe(true);
    expect(g.ship.initialized).toBe(true);
    ex.close();
    expect(m.open('ship')).toBe(true);
    expect(g.ship.hull).toBe(0);
  });

  it('brings the original battleship device home before exposing the fabricator', () => {
    const state = expeditionState({
      character: { perks: { precise: true } },
      stores: { compass: 1, 'cured meat': 10, rifle: 1, bullets: 40, torch: 1, rucksack: 1 }
    });
    state.game.world.map[31][30] = 'X';
    const g = startGame(state), ex = new Expedition(g), m = new Endgame(g);
    ex.open();
    for (const [id, n] of Object.entries({ 'cured meat': 6, rifle: 1, bullets: 40, torch: 1 })) ex.pack(id, n);
    ex.depart(); g.rng = scriptedRng([.1]); ex.move('east');
    expect(m.open('fabricator')).toBe(false);
    g.events.click('enter'); g.events.click('continue'); g.events.click('continue');
    const win = () => {
      // Precise shots hit; the .85 enemy rolls miss. Only legal attacks advance the original scenes.
      g.rng = scriptedRng([.85]);
      for (let i = 0; i < 40 && !g.events.active()?.afterCombat; i++) {
        g.events.active()?.combat?.attack('rifle'); g.tick(1000);
      }
      expect(g.events.active()?.afterCombat).toBe(true);
      g.tick(1000);
      expect(g.events.click('continue')).toBe(true);
    };
    win(); win();
    expect(g.events.active()?.sceneName).toBe('5');
    g.events.click('power'); win();
    expect(g.events.active()?.sceneName).toBe('7');
    expect(g.fabricator.initialized).toBe(false);
    g.events.click('leave');
    ex.move('west'); ex.close();
    expect(g.fabricator.initialized).toBe(true);
    expect(m.open('fabricator')).toBe(true);
    expect(m.recipes().filter(r => r.available)).toHaveLength(3);
  });
  it('enforces blueprints, quantities, maxima and actual material costs', () => {
    const g = startGame(lateState()), m = new Endgame(g);
    expect(m.open('fabricator')).toBe(true);
    expect(m.recipes().filter(r => r.available)).toHaveLength(3);
    expect(m.fabricate('kinetic armour')).toBe(false);
    expect(g.store.num('stores["alien alloy"]')).toBe(20);
    g.store.set('character.blueprints.hypo', true);
    expect(m.fabricate('hypo')).toBe(true);
    expect(g.store.num('stores.hypo')).toBe(5);
    expect(g.store.num('stores["alien alloy"]')).toBe(19);
    expect(m.fabricate('fluid recycler')).toBe(true);
    expect(m.fabricate('fluid recycler')).toBe(false);
    expect(g.store.num('stores["alien alloy"]')).toBe(17);
    g.store.set('stores["alien alloy"]', 0);
    expect(m.fabricate('energy blade')).toBe(false);
    expect(m.recipes().find(r => r.id === 'energy blade')?.missing).toEqual({ 'alien alloy': 1 });
    expect(m.fabricate('unknown')).toBe(false);
  });

  it('blocks manufacturing and upgrades from other locations and during events', () => {
    const g = startGame(lateState()), m = new Endgame(g);
    expect(m.upgrade('hull')).toBe(false);
    expect(m.fabricate('energy blade')).toBe(false);
    m.open('ship');
    expect(m.upgrade('hull')).toBe(true);
    expect([g.ship.hull, g.store.num('stores["alien alloy"]')]).toEqual([4, 19]);
    g.events.startEvent({ title: 'blocked', scenes: { start: { buttons: {} } } });
    expect(m.upgrade('engine')).toBe(false);
    expect(m.open('fabricator')).toBe(false);
    expect(m.launch()).toBe(false);
  });

  it('returns from the fabricator and ship to the actual room, even though the forest view defaults to room', () => {
    const g = startGame(lateState()), m = new Endgame(g), journey = new ForestJourney(g);
    for (const place of ['fabricator', 'ship'] as const) {
      m.open(place);
      expect(journey.place).toBe('room');
      expect(journey.travel('room')).toBe(true);
      m.leave();
      expect(g.active).toBe('room');
      expect(m.opened).toBe(false);
    }
  });

  it('lets the first launch warning be cancelled without entering space or leaving a cooldown', () => {
    const g = startGame(lateState()), m = new Endgame(g);
    m.open('ship');
    expect(m.launch()).toBe(true);
    expect(g.active).toBe('ship');
    g.events.click('wait');
    expect(g.active).toBe('ship');
    expect(g.cooldowns.isCooling('liftoffButton')).toBe(false);
    expect(m.launch()).toBe(true);
    g.events.click('fly');
    expect(g.active).toBe('space');
    expect(m.open('fabricator')).toBe(false);
    expect(m.upgrade('hull')).toBe(false);
    expect(m.fabricate('energy blade')).toBe(false);
  });

  it('restores a damaged moving ship, existing rocks and exact remaining ascent time', () => {
    const storage = new MemoryStorage();
    const g = startGame(lateState(), { storage }), m = new Endgame(g);
    m.open('ship'); m.launch(); g.events.click('fly');
    g.rng = scriptedRng([0]);
    g.space.input.right = true;
    g.tick(12345);
    g.space.hull = 2;
    g.saveNow();
    const before = g.space.snapshot()!;
    const h = makeGame({ storage }); h.start();
    const n = new Endgame(h); n.restore();
    expect(h.active).toBe('space');
    expect(n.paused).toBe(true);
    expect(h.space.snapshot()).toEqual(before);
    expect(h.space.input.right).toBe(false);
    expect(h.space.hull).toBe(2);
    expect(h.space.shipX).toBe(g.space.shipX);
    h.rng = scriptedRng([0]);
    n.togglePause();
    h.tick(47654);
    expect(h.over).toBe(false);
    h.tick(1);
    expect(h.over).toBe(true);
    expect(n.ending?.total).toBe(500 + n.ending!.score);
  });

  it('does not reset the exact ascent timers when hyper speed is enabled', () => {
    const g = startGame(lateState()), m = new Endgame(g);
    g.clock.hyper = true;
    m.open('ship'); m.launch(); g.events.click('fly');
    g.rng = scriptedRng([0]);
    g.tick(10123); g.saveNow();
    const h = makeGame({ storage: g.storage }); h.start();
    h.rng = scriptedRng([0]); h.clock.hyper = true;
    h.tick(49876); expect(h.over).toBe(false);
    h.tick(1); expect(h.over).toBe(true);
  });

  it('crashes, clears the flight checkpoint, preserves upgrades and enforces retry cooldown', () => {
    const state = lateState(); state.game.spaceShip.hull = 1;
    const g = startGame(state), m = new Endgame(g);
    m.open('ship'); m.launch(); g.events.click('fly');
    g.rng = scriptedRng([0.5]);
    g.tick(2000);
    expect([g.active, g.ship.hull, m.crashed]).toEqual(['ship', 1, true]);
    g.saveNow();
    expect(JSON.parse(g.storage.getItem(SAVE_KEY)!).runtime?.space).toBeUndefined();
    expect(m.launch()).toBe(false);
    g.tick(120000);
    expect(m.launch()).toBe(true);
    expect(g.active).toBe('space');
  });

  for (const expansion of [false, true]) it(`persists ${expansion ? 'beacon' : 'normal'} ending once and preserves score/inheritance on next generation`, () => {
    const g = startGame(lateState()), m = new Endgame(g);
    if (expansion) g.store.set('stores["fleet beacon"]', 1);
    m.open('ship'); m.launch(); g.events.click('fly');
    g.rng = scriptedRng([0]);
    g.tick(60000);
    const ending = m.ending!;
    expect(ending.expansion).toBe(expansion);
    const saved = JSON.parse(g.storage.getItem(SAVE_KEY)!);
    expect(Object.keys(saved)).toEqual(['previous']);
    expect(saved.previous.ending).toEqual(ending);
    expect(saved.previous.stores).toHaveLength(24);
    g.tick(60000);
    expect(JSON.parse(g.storage.getItem(SAVE_KEY)!)).toEqual(saved);
    const h = makeGame({ storage: g.storage }); h.start();
    const n = new Endgame(h); n.restore();
    expect(n.ending).toEqual(ending);
    expect(h.over).toBe(true);
    expect(n.nextGeneration()).toBe(true);
    const next = JSON.parse(h.storage.getItem(SAVE_KEY)!);
    expect(next.previous.ending).toBeUndefined();
    expect(next.previous.stores).toEqual(saved.previous.stores);
    expect(next.previous.score).toBe(ending.total);
    const fresh = makeGame({ storage: h.storage }); fresh.start();
    const freshModel = new Endgame(fresh); freshModel.restore();
    expect(fresh.over).toBe(false);
    expect(freshModel.ending).toBeNull();
    expect(fresh.store.num('previous.score')).toBe(ending.total);
  });

  it('stops ascent timers when disposing the game', () => {
    const g = startGame(lateState()), m = new Endgame(g);
    m.open('ship'); m.launch(); g.events.click('fly');
    const altitude = g.space.altitude;
    g.stop(); g.tick(60000);
    expect(g.space.altitude).toBe(altitude);
    expect(g.over).toBe(false);
  });
});
