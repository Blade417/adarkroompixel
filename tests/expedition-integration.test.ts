import { describe, expect, it } from 'vitest';
import { MemoryStorage, scriptedRng } from '../src/core';
import { SAVE_KEY } from '../src/core/save';
import { TILE, WORLD } from '../src/core/data';
import { Expedition } from '../src/app/expedition';
import { expeditionState, makeGame, startGame } from './helpers';

const R = WORLD.RADIUS;
function live(outfit: Record<string, number> = { 'cured meat': 6, 'bone spear': 1 }, state = expeditionState()) {
  const storage = new MemoryStorage();
  state.stores = { ...state.stores, ...outfit, 'cured meat': 30, rucksack: 1, waterskin: 1 };
  const g = startGame(state, { storage });
  const ex = new Expedition(g);
  expect(ex.open()).toBe(true);
  for (const [id, n] of Object.entries(outfit)) ex.pack(id, n);
  expect(ex.depart()).toBe(true);
  g.rng = scriptedRng([.9]);
  return { g, ex, storage };
}
function reload(g: ReturnType<typeof startGame>, storage: MemoryStorage) {
  g.saveNow(); g.stop();
  const resumed = makeGame({ storage, rng: scriptedRng([.1]) });
  resumed.start();
  const ex = new Expedition(resumed); ex.restore();
  return { g: resumed, ex };
}
function beast(g: ReturnType<typeof startGame>) {
  g.rng = scriptedRng([.1]);
  g.events.startEvent(g.content.events.Encounters[0]);
  return g.events.active()!.combat!;
}

describe('live expedition integration and save recovery', () => {
  it('resumes position, fog and fractional supply counters without paying or refilling again', () => {
    const { g, ex, storage } = live();
    ex.move('east');
    const snapshot = g.world.snapshot();
    const warehouse = { ...g.store.get('stores') };
    const next = reload(g, storage);
    expect(next.g.active).toBe('world');
    expect(next.ex.opened).toBe(true); expect(next.ex.paused).toBe(true);
    expect(next.g.world.snapshot()).toEqual(snapshot);
    expect(next.g.store.get('stores')).toEqual(warehouse);
    expect(next.ex.depart()).toBe(false);
    next.ex.paused = false; next.g.rng = scriptedRng([.9]); next.ex.move('east');
    expect(next.g.world.water).toBe(18);
    expect(next.g.path.outfit['cured meat']).toBe(5);
    expect(next.ex.trail).toHaveLength(3);
  });

  it('keeps a paid-for shot in flight and uses its original roll after reload', () => {
    const { g, storage } = live({ 'cured meat': 6, rifle: 1, bullets: 1 });
    const c = beast(g); c.attack('rifle'); g.tick(100);
    expect(c.enemy.hp).toBe(5); expect(g.path.outfit.bullets).toBe(0);
    const next = reload(g, storage); next.g.rng = scriptedRng([.99]);
    const restored = next.g.events.active()!.combat!;
    expect(restored.attacks().find(a => a.id === 'rifle')!.enabled).toBe(false);
    expect(next.g.cooldowns.remaining('combat:rifle')).toBe(900);
    next.g.tick(99); expect(restored.enemy.hp).toBe(5);
    next.g.tick(1); expect(restored.enemy.hp).toBeLessThanOrEqual(0);
    expect(next.g.path.outfit.bullets).toBe(0);
  });

  it('restores the remaining enemy attack delay instead of allowing a fresh full delay', () => {
    const { g, storage } = live(); beast(g); g.tick(750);
    const next = reload(g, storage);
    next.g.tick(349); expect(next.g.world.health).toBe(10);
    next.g.tick(1); expect(next.g.world.health).toBe(9);
  });

  it('continues delayed victory once and never rerolls partially collected loot', () => {
    const { g, storage } = live({ 'cured meat': 6, rifle: 1, bullets: 1 });
    beast(g).attack('rifle'); g.tick(200);
    expect(g.events.active()!.afterCombat).toBe(false);
    let next = reload(g, storage);
    next.g.tick(99); expect(next.g.events.active()!.loot).toBeNull();
    next.g.tick(1); expect(next.g.events.active()!.loot).toEqual({ fur: 1, meat: 1, teeth: 1 });
    next.g.events.take('fur');
    const carried = { ...next.g.path.outfit };
    next = reload(next.g, storage);
    next.g.rng = scriptedRng([.99]); next.g.tick(100);
    expect(next.g.events.active()!.loot).toEqual({ meat: 1, teeth: 1 });
    expect(next.g.path.outfit).toEqual(carried);
    expect(next.g.events.active()!.afterCombat).toBe(true);
  });

  it('preserves stun duration across reload', () => {
    const { g, storage } = live({ 'cured meat': 6, bolas: 2 });
    beast(g).attack('bolas'); g.tick(2100);
    const next = reload(g, storage), c = next.g.events.active()!.combat!;
    expect(c.enemy.stunned).toBe(true);
    next.g.tick(2099); expect(c.enemy.stunned).toBe(true);
    next.g.tick(1); expect(c.enemy.stunned).toBe(false);
    expect(next.g.path.outfit.bolas).toBe(1);
  });

  it('restores an outpost without replaying refill, loot or its onLoad effect', () => {
    const state = expeditionState(); state.game.world.map[R + 1][R] = TILE.OUTPOST;
    const { g, ex, storage } = live(undefined, state);
    ex.move('east'); expect(g.events.active()!.def.title).toBe('An Outpost');
    g.world.setWater(7);
    const next = reload(g, storage);
    expect(next.g.world.water).toBe(7);
    next.g.tick(1000); expect(next.g.events.click('leave')).toBe(true);
    next.g.rng = scriptedRng([.9]); next.ex.paused = false;
    next.ex.move('east'); next.ex.move('west');
    expect(next.g.events.active()).toBeNull();
    expect(next.g.world.water).toBeLessThan(7);
  });

  it('commits discovered mines and loot only on return and reports bag changes excluding village income', () => {
    const { g, ex, storage } = live();
    ex.move('east');
    g.world.state!.ironmine = true;
    g.path.outfit.fur = 2;
    g.store.add('stores.wood', 100); g.store.add('stores.fur', 30);
    expect(g.store.num('game.buildings["iron mine"]')).toBe(0);
    let next = reload(g, storage);
    next.ex.paused = false; next.ex.move('west');
    expect(next.ex.phase).toBe('home');
    expect(next.ex.receipt).toEqual({ fur: 2 });
    expect(next.g.store.num('stores.fur')).toBe(32);
    expect(next.g.store.num('game.buildings["iron mine"]')).toBe(1);
    next = reload(next.g, storage);
    expect(next.g.active).toBe('room');
    expect(next.g.store.num('game.buildings["iron mine"]')).toBe(1);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).runtime?.expedition).toBeUndefined();
  });

  it('death removes the runtime checkpoint and does not return lost goods after reload', () => {
    const { g, ex, storage } = live(); ex.move('east');
    g.world.state!.ironmine = true; g.path.outfit.fur = 3;
    g.world.setHp(1); beast(g); g.tick(1200);
    expect(ex.phase).toBe('dead');
    const next = reload(g, storage);
    expect(next.g.active).toBe('room'); expect(next.g.path.outfit).toEqual({});
    expect(next.g.store.num('stores.fur')).toBe(0);
    expect(next.g.store.num('game.buildings["iron mine"]')).toBe(0);
    expect(next.g.cooldowns.isCooling('embarkButton')).toBe(true);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).runtime?.expedition).toBeUndefined();
    next.ex.open(); expect(next.ex.phase).toBe('dead'); next.ex.prepareAgain();
    expect(next.ex.phase).toBe('pack'); expect(next.ex.depart()).toBe(false);
  });

  it('refuses teleporting home, movement during events, repeated departure and packing unknown goods', () => {
    const { g, ex } = live();
    expect(ex.close()).toBe(false); expect(ex.depart()).toBe(false);
    beast(g); expect(ex.move('east')).toBe(false);
    expect(g.world.curPos).toEqual([R, R]);
    const atHome = startGame(expeditionState()); const pack = new Expedition(atHome); pack.open();
    atHome.store.set('stores.wood', 100); pack.pack('wood', 1);
    expect(atHome.path.outfit.wood).toBeUndefined();
  });

  it('runs the real mine branch, pays its torch and unlocks worker production on homecoming', () => {
    const state = expeditionState(); state.game.world.map[R + 1][R] = TILE.IRON_MINE;
    const { g, ex, storage } = live({ 'cured meat': 6, rifle: 1, bullets: 2, torch: 1 }, state);
    ex.move('east'); expect(g.events.active()!.def.title).toBe('The Iron Mine');
    expect(g.events.click('enter')).toBe(true);
    expect(g.path.outfit.torch).toBe(0);
    expect(g.events.active()!.combat!.scene.enemy).toBe('beastly matriarch');
    g.rng = scriptedRng([.1]); ex.attack('rifle'); g.tick(1000); ex.attack('rifle'); g.tick(1300);
    expect(g.events.click('leave')).toBe(true);
    expect(g.world.state!.ironmine).toBe(true);
    expect(g.store.num('game.buildings["iron mine"]')).toBe(0);
    const next = reload(g, storage); next.ex.paused = false;
    expect(next.g.events.active()!.sceneName).toBe('cleared');
    expect(next.g.events.click('leave')).toBe(true);
    next.ex.move('west');
    expect(next.g.store.num('game.buildings["iron mine"]')).toBe(1);
    expect(next.g.outside.workers().map(w => w.name)).toContain('iron miner');
    expect(next.ex.receipt).toMatchObject({ torch: -1, bullets: -2 });
  });

  it('keeps cleared caves as outposts and their roads when resuming the clearing screen', () => {
    const state = expeditionState(); state.game.world.map[R + 2][R] = TILE.CAVE;
    const { g, ex, storage } = live(undefined, state);
    ex.move('east'); ex.move('east');
    g.events.loadScene('end1');
    const map = structuredClone(g.world.state!.map);
    const next = reload(g, storage);
    expect(next.g.world.state!.map).toEqual(map);
    expect(next.g.world.state!.map[R + 2][R]).toBe(TILE.OUTPOST);
    expect(next.g.world.state!.map[R + 1][R]).toBe(TILE.ROAD);
  });
});
