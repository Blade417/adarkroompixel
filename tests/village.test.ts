import { describe, expect, it } from 'vitest';
import { BuilderWorkshop, PIXEL_BUILDABLES } from '../src/app/building';
import { ForestJourney } from '../src/app/forest';
import { FOREST_EXIT, HUT_PLOTS, HUT_SIZE, HEARTH_PLOT, PUBLIC_FACILITIES, PUBLIC_ZONES, VILLAGE_SIZE, inhabitants, rememberVillageClearing, villageView } from '../src/app/village';
import { CRAFTABLES, JOB_MAP } from '../src/core/data';
import { MemoryStorage } from '../src/core/save';
import { makeGame, startGame, villageState } from './helpers';

describe('pixel village integration', () => {
  it('unlocks on the first hut, charges original increasing costs, and stops at twenty', () => {
    const g = startGame(villageState({ stores: { wood: 20000 } }), { craftables: PIXEL_BUILDABLES });
    const workshop = new BuilderWorkshop(g), trip = new ForestJourney(g);
    expect(trip.travel('village')).toBe(false);
    expect(workshop.build('hut')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(19900);
    expect(trip.villageUnlocked).toBe(true);
    expect(g.outside.maxPopulation()).toBe(4);
    expect(villageView(g).clearedHuts).toBe(1);
    for (let i = 1; i < 20; i++) expect(workshop.build('hut')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(8500); // 100 + 150 + ... + 1050
    expect(g.outside.maxPopulation()).toBe(80);
    expect(workshop.build('hut')).toBe(false);
    expect(g.store.num('stores.wood')).toBe(8500);
  });

  it('switches forest and village without resetting forage cooldowns or allowing remote actions', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 1, trap: 1 } } }));
    const trip = new ForestJourney(g);
    expect(trip.travel('outside')).toBe(true);
    expect(trip.gather('branches')).toBe(true);
    expect(trip.travel('village')).toBe(true);
    expect(trip.place).toBe('village');
    expect(trip.outside).toBe(false);
    expect(trip.away).toBe(true);
    expect(trip.guideTarget).toBeNull();
    expect(trip.gather('deadwood')).toBe(false);
    expect(trip.checkTraps()).toBeNull();
    expect(new BuilderWorkshop(g).build('hut')).toBe(false);
    g.events.startEvent({ title: 'interruption', scenes: { start: { text: ['wait'], buttons: {} } } });
    expect(trip.travel('outside')).toBe(false);
    expect(trip.travel('room')).toBe(false);
    g.events.endEvent();
    expect(trip.travel('outside')).toBe(true);
    expect(trip.remaining('branches')).toBe(20000);
    expect(trip.travel('room')).toBe(true);
  });

  it('restores village location and population from an ordinary export, while old saves still open normally', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 3 }, population: 7 } }));
    new ForestJourney(g).travel('village');
    const next = makeGame({ storage: new MemoryStorage(), craftables: PIXEL_BUILDABLES });
    expect(next.importCode(g.exportCode())).toBe(true); next.start();
    const trip = new ForestJourney(next); trip.restoreLocation();
    expect(trip.place).toBe('village');
    const view = villageView(next);
    expect(view).toMatchObject({ huts: 3, population: 7, capacity: 12, gatherers: 7 });
    expect([0, 1, 2, 3].map(i => inhabitants(view, i))).toEqual([4, 3, 0, 0]);
    const legacy = startGame(villageState());
    new ForestJourney(legacy).restoreLocation();
    expect(legacy.active).toBe('room');
  });

  it('uses original timed arrivals and wood income even while the player is in the room', () => {
    const g = startGame(villageState({ stores: { wood: 100 }, game: { buildings: { hut: 1 } } }));
    g.rng = { random: () => 0 };
    g.outside.stop(); g.outside.schedulePopIncrease();
    g.clock.run(30000, 1000);
    expect(g.outside.population).toBe(2);
    const before = g.store.num('stores.wood');
    g.clock.run(10000, 1000);
    expect(g.store.num('stores.wood')).toBe(before + 2);
    expect(g.active).toBe('room');
  });

  it('preserves cleared land after hut loss and export, and migrates older saves on resume', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 8 } } }));
    rememberVillageClearing(g);
    g.store.set('game.buildings.hut', 7);
    rememberVillageClearing(g);
    expect(villageView(g)).toMatchObject({ huts: 7, clearedHuts: 8 });
    const next = makeGame({ storage: new MemoryStorage() });
    expect(next.importCode(g.exportCode())).toBe(true); next.start();
    expect(villageView(next)).toMatchObject({ huts: 7, clearedHuts: 8 });
    const old = startGame(villageState({ game: { buildings: { hut: 4 } } }));
    expect(villageView(old).clearedHuts).toBe(4);
    rememberVillageClearing(old);
    expect(old.store.num('game.pixel.clearedHuts')).toBe(4);
  });

  it('keeps twenty distinct plots and the hearth from overlapping at full capacity', () => {
    const plots = [...HUT_PLOTS.map(([x, y]) => ({ x, y, ...HUT_SIZE })), HEARTH_PLOT, ...PUBLIC_FACILITIES];
    for (let i = 0; i < plots.length; i++) {
      const a = plots[i];
      expect(a.x - a.w / 2).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w / 2).toBeLessThanOrEqual(VILLAGE_SIZE.w);
      expect(a.y - a.h).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(VILLAGE_SIZE.h);
      for (const b of plots.slice(i + 1)) {
        expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || a.y <= b.y - b.h || b.y <= a.y - a.h).toBe(true);
      }
    }
  });

  it('allocates each of the seven original village facilities once within four districts', () => {
    const original = Object.entries(CRAFTABLES).filter(([id, c]) => c.type === 'building' && !['trap', 'cart', 'hut'].includes(id)).map(([id]) => id).sort();
    expect(PUBLIC_FACILITIES.map(f => f.id).sort()).toEqual(original);
    expect(PUBLIC_ZONES.flatMap(z => [...z.facilities]).sort()).toEqual(original);
    expect(PUBLIC_ZONES).toHaveLength(4);
    expect(Object.keys(JOB_MAP).filter(id => !original.includes(id)).sort()).toEqual(['coal mine', 'iron mine', 'sulphur mine']);
  });

  it('maps facilities individually from real saved buildings without granting them for free', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 20, tannery: 1, 'trading post': 1 } } }));
    const before = JSON.stringify(g.store.state);
    const view = villageView(g);
    expect(view.facilities.tannery).toBe(1); expect(view.facilities['trading post']).toBe(1);
    expect(view.facilities.smokehouse).toBe(0); expect(view.facilities.workshop).toBe(0);
    expect(JSON.stringify(g.store.state)).toBe(before);
    expect(new BuilderWorkshop(g).build('lodge' as never)).toBe(false);
  });

  it('keeps district hit targets around their facilities without blocking any house or the forest exit', () => {
    const houses = [...HUT_PLOTS.map(([x, y]) => ({ x, y, ...HUT_SIZE })), HEARTH_PLOT, FOREST_EXIT];
    for (const z of PUBLIC_ZONES) {
      for (const p of houses) expect(Math.abs(z.x - p.x) >= (z.w + p.w) / 2 || z.y <= p.y - p.h || p.y <= z.y - z.h).toBe(true);
      for (const f of PUBLIC_FACILITIES.filter(f => f.zone === z.id)) {
        expect(f.x - f.w / 2).toBeGreaterThanOrEqual(z.x - z.w / 2);
        expect(f.x + f.w / 2).toBeLessThanOrEqual(z.x + z.w / 2);
        expect(f.y - f.h).toBeGreaterThanOrEqual(z.y - z.h);
        expect(f.y).toBeLessThanOrEqual(z.y);
      }
    }
  });
});
