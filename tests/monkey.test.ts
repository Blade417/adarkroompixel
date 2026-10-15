import { describe, expect, it } from 'vitest';
import { seededRng, type Game } from '../src/core';
import { makeGame, villageState } from './helpers';

const DIRS = ['north', 'south', 'east', 'west'] as const;

function pick<T>(r: () => number, list: T[]): T | undefined {
  return list.length ? list[Math.floor(r() * list.length)] : undefined;
}

/** one random legal intent for the current situation */
function act(g: Game, r: () => number): void {
  const ev = g.events.active();
  if (ev) {
    const c = ev.combat;
    if (c && !ev.afterCombat) {
      const a = pick(r, [...c.attacks(), ...c.utilities()].filter((x) => x.enabled));
      if (a) (c.attacks().includes(a) ? c.attack(a.id) : c.use(a.id));
      return;
    }
    if (ev.loot && r() < 0.5) {
      g.events.takeEverything();
      return;
    }
    const b = pick(r, g.events.buttons().filter((x) => x.enabled));
    if (b) g.events.click(b.id);
    return;
  }
  switch (g.active) {
    case 'world':
      g.world.move(pick(r, [...DIRS])!);
      return;
    case 'space':
      g.space.input = { up: r() < 0.3, down: r() < 0.3, left: r() < 0.3, right: r() < 0.3 };
      return;
  }
  const choices: (() => unknown)[] = [
    () => g.travelTo(pick(r, g.tabs())!),
    () => g.room.tendFire(),
    () => g.outside.initialized && g.outside.gatherWood(),
    () => g.outside.initialized && g.outside.checkTraps(),
    () => { const o = g.room.options(); g.room.build(pick(r, [...o.build, ...o.craft]) ?? 'trap'); },
    () => { const b = pick(r, g.room.options().buy); if (b) g.room.buy(b); },
    () => { const w = pick(r, g.outside.workers().slice(1)); if (w) (r() < 0.7 ? g.outside.increaseWorker(w.name, 5) : g.outside.decreaseWorker(w.name, 5)); },
    () => { if (g.active === 'path') { for (const c of g.path.carryable()) g.path.increaseSupply(c.name, Math.ceil(r() * 5)); g.path.embark(); } },
    () => g.active === 'fabricator' && g.fabricator.fabricate(pick(r, g.fabricator.options()) ?? ''),
    () => { if (g.active === 'ship') { g.ship.reinforceHull(); g.ship.checkLiftOff(); } }
  ];
  pick(r, choices)!();
}

function invariants(g: Game): void {
  const stores = g.store.get('stores') || {};
  for (const k in stores) {
    expect(typeof stores[k], k).toBe('number');
    expect(stores[k], k).toBeGreaterThanOrEqual(0);
  }
  for (const k in g.path.outfit) expect(g.path.outfit[k], 'outfit ' + k).toBeGreaterThanOrEqual(0);
  expect(g.store.num('game.population')).toBeLessThanOrEqual(g.outside.maxPopulation() || Infinity);
  expect(g.outside.numGatherers()).toBeGreaterThanOrEqual(0);
  if (g.active === 'world' && g.world.state) expect(g.world.health).toBeGreaterThanOrEqual(0);
}

describe('monkey playthrough (random legal intents)', () => {
  const reached: Record<string, number> = {};
  const titles = new Set<string>();

  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`seed ${seed}: survives hours of random play`, () => {
      const g = makeGame({
        rng: seededRng(seed),
        language: seed % 2 ? 'en' : 'zh',
        state: villageState({
          features: { location: { spaceShip: true, fabricator: true } },
          game: { buildings: { hut: 10, trap: 5, 'trading post': 1, workshop: 1, lodge: 1, tannery: 1, smokehouse: 1 }, population: 30, spaceShip: { hull: 3, thrusters: 2 } },
          character: { blueprints: { hypo: true, stim: true, 'kinetic armour': true } },
          stores: {
            wood: 20000, fur: 5000, meat: 2000, scales: 1000, teeth: 1000, leather: 2000, iron: 500, coal: 500, steel: 500,
            sulphur: 300, cloth: 200, torch: 50, 'cured meat': 300, medicine: 30, bullets: 200, compass: 1,
            'alien alloy': 20, charm: 3, 'bone spear': 2, 'iron sword': 1, rifle: 1, 'energy cell': 50, grenade: 10, bolas: 10
          }
        })
      });
      const r = seededRng(seed * 7919);
      g.bus.on((e) => {
        reached[e.type] = (reached[e.type] ?? 0) + 1;
        if (e.type === 'event:start') titles.add(g.events.active()!.def.title);
      });
      g.start();
      for (let step = 0; step < 4000 && !g.over; step++) {
        act(g, () => r.random());
        g.tick(Math.floor(r.random() * (g.active === 'space' || g.events.active()?.combat ? 400 : 20000)) + 50);
        invariants(g);
      }
      expect(g.clock.now).toBeGreaterThan(60 * 1000);
      expect(g.notifications.log.length).toBeGreaterThan(10);
    });
  }

  it('reached the deep systems', () => {
    console.log('monkey reached', JSON.stringify(reached), `\n${titles.size} distinct events:`, [...titles].join(' | '));
    for (const key of ['world:move', 'world:fight', 'world:home', 'world:died', 'combat:attack', 'event:start', 'build', 'space:start']) {
      expect(reached[key] ?? 0, key).toBeGreaterThan(0);
    }
    expect(titles.size).toBeGreaterThan(15);
  });
});
