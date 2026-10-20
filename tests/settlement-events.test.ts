import { describe, expect, it } from 'vitest';
import { EventOutcome } from '../src/app/event-outcome';
import { MemoryStorage, scriptedRng } from '../src/core';
import { beastReward, SETTLEMENT_EVENTS } from '../src/core/events/settlement';
import { TILE } from '../src/core/data';
import type { GameEventDef, LocationId } from '../src/core/types';
import { expeditionState, makeGame, startGame, villageState } from './helpers';

const minute = 60_000;
function village() {
  return startGame(villageState({ marketing: { penrose: true }, game: { buildings: { hut: 5, trap: 3, lodge: 1 }, population: 20 }, stores: { wood: 1000, fur: 0, meat: 0 } }));
}
function queue(g: ReturnType<typeof village>, def: GameEventDef, casualtyRoll = .5) {
  const pool = g.events.candidates();
  const index = pool.indexOf(def);
  expect(index).toBeGreaterThanOrEqual(0);
  g.rng = scriptedRng([(index + .01) / pool.length, casualtyRoll, 0]);
  g.events.triggerEvent();
}

describe('scaled beast rewards and casualties', () => {
  it.each([[1, 5], [4, 10], [12, 20], [20, 30], [40, 55], [80, 100], [800, 100]])('scales the reward for %i residents', (population, amount) => {
    expect(beastReward(population)).toEqual({ fur: amount, meat: amount, teeth: Math.max(1, Math.floor(amount / 10)) });
  });
  it.each([1, 2, 4, 12, 20, 40, 80])('bounds casualties for %i residents without negative population', population => {
    const g = startGame(villageState({ game: { buildings: { hut: 20 }, population }, stores: { fur: 0, meat: 0 } }));
    g.rng = scriptedRng([.999]);
    g.events.startEvent(g.content.events.Outside[4]);
    expect(g.outside.population).toBe(Math.max(0, population - Math.min(10, Math.ceil(population / 8))));
    expect(g.store.num('stores.fur')).toBe(beastReward(population).fur);
  });
  it('also scales the ruined-trap chase, closing the second flat-100 reward path', () => {
    const g = village();
    g.events.startEvent(g.content.events.Outside[0]);
    g.rng = scriptedRng([.999]);
    g.events.click('track');
    expect(g.store.num('stores.fur')).toBe(30);
    expect(g.store.num('stores.meat')).toBe(30);
  });
  it('keeps trap rolls random, including rare-only checks and bait consumption', () => {
    const g = startGame(villageState({ game: { buildings: { trap: 1 } }, stores: { fur: 0, meat: 0, bait: 1 } }));
    g.rng = scriptedRng([.999]);
    expect(g.outside.checkTraps()).toEqual({ charm: 2 });
    expect(g.store.num('stores.fur')).toBe(0);
    expect(g.store.num('stores.meat')).toBe(0);
    expect(g.store.num('stores.bait')).toBe(0);
  });
});

describe('global settlement scheduling and deferred presentation', () => {
  it('offers the same settlement pool on every page, without moving the player', () => {
    const g = village();
    const baseline = g.events.candidates();
    expect(baseline).toContain(g.content.events.Room[1]);
    expect(baseline).toContain(g.content.events.Outside[4]);
    for (const location of ['room', 'outside', 'path', 'world', 'ship', 'space'] as LocationId[]) {
      g.active = location;
      expect(g.events.candidates()).toEqual(baseline);
      expect(g.active).toBe(location);
    }
  });
  it('keeps locked village content unavailable and preserves terrain encounter predicates', () => {
    const g = startGame();
    expect(g.events.candidates().some(e => g.content.events.Outside.includes(e))).toBe(false);
    const h = startGame(expeditionState());
    h.path.outfit = { 'cured meat': 10 }; h.path.embark();
    const [x, y] = h.world.curPos;
    h.world.state!.map[x][y] = TILE.FOREST;
    expect(h.content.events.Encounters[0].isAvailable?.()).toBe(true);
    h.world.state!.map[x][y] = TILE.FIELD;
    expect(h.content.events.Encounters[0].isAvailable?.()).toBe(false);
  });
  it('settles an attack during combat without touching the fight, its timers, or the travel bag', () => {
    const g = startGame(expeditionState({ game: { buildings: { hut: 5 }, population: 20 }, stores: { fur: 0, meat: 0 } }));
    g.path.outfit = { 'cured meat': 10 }; g.path.embark();
    g.events.startEvent(g.content.events.Encounters[0]);
    const fight = g.events.active(), bag = { ...g.path.outfit };
    queue(g, g.content.events.Outside[4]);
    expect(g.events.active()).toBe(fight);
    expect(g.events.active()?.combat).toBeTruthy();
    expect(g.events.pendingCount).toBe(1);
    expect(g.outside.population).toBe(18);
    expect(g.store.num('stores.fur')).toBe(30);
    expect(g.path.outfit).toEqual(bag);
    expect(g.keyLock).toBe(true);
    expect(g.events.presentNext()).toBe(false);
    g.saveNow(); g.stop();
    const restored = makeGame({ storage: g.storage }); restored.start();
    expect(restored.events.active()?.combat).toBeTruthy();
    expect(restored.events.pendingCount).toBe(1);
    expect(restored.store.num('stores.fur')).toBe(30);
    expect(restored.path.outfit).toEqual(bag);
  });
  it('applies a queued consequence only once through save, reload, presentation and acknowledgement', () => {
    const storage = new MemoryStorage();
    const g = startGame(villageState({ game: { buildings: { hut: 5 }, population: 20 }, stores: { wood: 1000, fur: 0, meat: 0 } }), { storage });
    g.events.deferPresentation = true;
    queue(g, g.content.events.Outside[4]);
    expect(g.events.active()).toBeNull();
    g.saveNow(); g.stop();
    const h = makeGame({ storage }); h.start();
    const outcome = new EventOutcome(h);
    expect(h.events.pendingCount).toBe(1);
    expect(h.events.presentNext()).toBe(true);
    expect(h.outside.population).toBe(18);
    expect(h.store.num('stores.fur')).toBe(30);
    expect(outcome.changes).toContainEqual({ kind: 'population', id: 'residents', amount: -2 });
    h.saveNow(); h.stop();
    const next = makeGame({ storage }); next.start();
    expect(next.events.active()?.def).toBe(next.content.events.Outside[4]);
    expect(next.events.pendingCount).toBe(0);
    expect(next.store.num('stores.fur')).toBe(30);
    expect(next.outside.population).toBe(18);
    next.events.click('end'); next.saveNow(); next.stop();
    const done = makeGame({ storage }); done.start();
    expect(done.events.active()).toBeNull();
    expect(done.store.num('stores.fur')).toBe(30);
  });
  it('persists shared disaster cooldown, individual cooldown and the next scheduled time', () => {
    const g = village(); g.events.deferPresentation = true;
    queue(g, g.content.events.Outside[4]);
    expect(g.events.candidates().some(e => g.content.events.Outside.includes(e))).toBe(false);
    g.events.presentNext(); // Presentation stays deferred until the player is ready.
    g.events.stop(); g.tick(7 * minute);
    expect(g.events.candidates()).toContain(g.content.events.Outside[0]);
    expect(g.events.candidates()).not.toContain(g.content.events.Outside[4]);
    g.saveNow();
    const h = makeGame({ storage: g.storage }); h.start();
    expect(h.events.candidates()).not.toContain(h.content.events.Outside[4]);
    const saved = h.store.get('game.pixel.settlementEvents');
    expect(saved.history['Outside:4']).toBe(0);
    expect(saved.elapsed).toBe(7 * minute);
  });
  it('does not reset the global timer when changing pages', () => {
    const g = village(); g.events.stop(); g.rng = scriptedRng([0]);
    g.events.deferPresentation = true; g.events.scheduleNextEvent();
    g.tick(2 * minute); g.travelTo('outside'); g.tick(minute);
    expect(g.events.pendingCount).toBe(1);
  });
  it('continues the remaining global interval after reload', () => {
    const g = village(); g.events.stop(); g.rng = scriptedRng([0]);
    g.events.deferPresentation = true; g.events.scheduleNextEvent();
    g.tick(2 * minute); g.saveNow(); g.stop();
    const h = makeGame({ storage: g.storage }); h.start(); h.events.deferPresentation = true;
    h.tick(minute - 1); expect(h.events.pendingCount).toBe(0);
    h.tick(1); expect(h.events.pendingCount).toBe(1);
  });
  it('makes beast attacks eligible again after their cooldown, rather than excluding them forever', () => {
    const g = village(); queue(g, g.content.events.Outside[4]);
    g.events.click('end'); g.events.stop(); g.outside.stop();
    g.events.deferPresentation = true;
    g.tick(SETTLEMENT_EVENTS.beastDelay - 1);
    expect(g.events.candidates()).not.toContain(g.content.events.Outside[4]);
    g.tick(1);
    expect(g.events.candidates()).toContain(g.content.events.Outside[4]);
  });
  it('caps unread messages and avoids duplicate pending events', () => {
    const g = village(); g.events.deferPresentation = true;
    for (let n = 0; n < 20; n++) { g.events.triggerEvent(); }
    expect(g.events.pendingCount).toBeLessThanOrEqual(SETTLEMENT_EVENTS.maxPending);
    g.saveNow();
    const ids = g.store.get('game.pixel.settlementEvents.pending').map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
