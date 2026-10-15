import { describe, expect, it } from 'vitest';
import { scriptedRng, seededRng } from '../src/core';
import { TILE, WORLD } from '../src/core/data';
import { expeditionState, logHas, startGame, villageState } from './helpers';

const R = WORLD.RADIUS;

/** never fight, footsteps whatever */
const calm = () => scriptedRng([0.9]);

function embark(g: ReturnType<typeof startGame>, outfit: Record<string, number>) {
  g.travelTo('path');
  for (const [k, n] of Object.entries(outfit)) g.path.increaseSupply(k, n);
  expect(g.path.embark()).toBe(true);
  g.rng = calm();
}

describe('world generation', () => {
  const g = startGame(villageState({ stores: { compass: 1 } }), { rng: seededRng(7) });
  const map: string[][] = g.store.get('game.world.map');

  it('is 61x61 with the village in a forest at the centre', () => {
    expect(map).toHaveLength(61);
    expect(map[R][R]).toBe(TILE.VILLAGE);
    for (const [x, y] of [[R, R - 1], [R, R + 1], [R - 1, R], [R + 1, R]]) {
      expect([TILE.FOREST, TILE.HOUSE, TILE.CAVE]).toContain(map[x][y]);
    }
  });

  it('places every landmark the original places', () => {
    const count = (c: string) => map.flat().filter((t) => t === c).length;
    expect(count(TILE.HOUSE)).toBe(10);
    expect(count(TILE.CAVE)).toBe(5);
    expect(count(TILE.TOWN)).toBe(10);
    expect(count(TILE.CITY)).toBe(20);
    expect(count(TILE.BOREHOLE)).toBe(10);
    expect(count(TILE.BATTLEFIELD)).toBe(5);
    for (const c of [TILE.IRON_MINE, TILE.COAL_MINE, TILE.SULPHUR_MINE, TILE.SHIP, TILE.SWAMP, TILE.EXECUTIONER]) expect(count(c)).toBe(1);
    expect(count(TILE.CACHE)).toBe(0); // only with a previous generation
  });

  it('puts the ship 28 steps away and points the compass at it', () => {
    const ship = g.world.ship![0];
    expect(Math.abs(ship.x) + Math.abs(ship.y)).toBe(28);
    expect(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']).toContain(g.world.dir);
  });

  it('starts with a diamond of light around the village', () => {
    const mask: boolean[][] = g.store.get('game.world.mask');
    expect(mask.flat().filter(Boolean)).toHaveLength(13); // radius 2 diamond
  });
});

describe('expeditions', () => {
  it('packs within the bag capacity and pays for it on departure', () => {
    const g = startGame(expeditionState({ stores: { 'bone spear': 3, rucksack: 1 } }));
    g.travelTo('path');
    expect(g.path.capacity()).toBe(20);
    g.path.increaseSupply('bone spear', 10); // weight 2 each, 3 owned
    g.path.increaseSupply('cured meat', 100);
    expect(g.path.outfit).toEqual({ 'bone spear': 3, 'cured meat': 14 });
    expect(g.path.freeSpace()).toBe(0);
    g.path.embark();
    expect(g.active).toBe('world');
    expect(g.store.get('stores["cured meat"]')).toBe(6);
    expect(g.world.water).toBe(10);
    expect(g.world.health).toBe(10);
  });

  it('cannot embark without cured meat', () => {
    const g = startGame(expeditionState());
    g.travelTo('path');
    expect(g.path.embark()).toBe(false);
  });

  it('(bug fix) packed supplies are clamped to what is owned without stray state keys', () => {
    const g = startGame(expeditionState());
    g.travelTo('path');
    g.path.increaseSupply('cured meat', 8);
    g.store.set('stores["cured meat"]', 3);
    g.travelTo('room');
    g.travelTo('path');
    expect(g.path.outfit['cured meat']).toBe(3);
    expect(g.store.get('outfit["cured meat"]')).toBe(3);
    expect(g.store.state['cured meat']).toBeUndefined();
  });

  it('eats every 2 steps, drinks every step', () => {
    const g = startGame(expeditionState());
    embark(g, { 'cured meat': 5 });
    g.world.move('east');
    expect([g.world.water, g.path.outfit['cured meat']]).toEqual([9, 5]);
    g.world.move('east');
    expect([g.world.water, g.path.outfit['cured meat']]).toEqual([8, 4]);
  });

  it('starves: warning first, death on the next meal', () => {
    const g = startGame(expeditionState({ stores: { waterskin: 1 } }));
    embark(g, { 'cured meat': 1 });
    const steps = ['east', 'east', 'east', 'east', 'east'] as const;
    for (const d of steps) g.world.move(d);
    expect(logHas(g, 'the meat has run out')).toBe(true);
    expect(logHas(g, 'starvation sets in')).toBe(true);
    expect(g.active).toBe('world');
    g.world.move('east');
    expect(g.active).toBe('room');
    expect(logHas(g, 'the world fades')).toBe(true);
    expect(g.store.get('character.starved')).toBe(1);
    expect(g.path.outfit).toEqual({});
    expect(g.cooldowns.isCooling('embarkButton')).toBe(true);
  });

  it('a death discards the expedition, a homecoming commits it', () => {
    const g = startGame(expeditionState());
    embark(g, { 'cured meat': 5 });
    g.world.move('east');
    g.world.move('east');
    g.world.move('west');
    g.world.move('west');
    expect(g.active).toBe('path');
    const mask: boolean[][] = g.store.get('game.world.mask');
    expect(mask[R + 4][R]).toBe(true); // lit while walking, saved on return
    expect(g.store.get('stores["cured meat"]')).toBe(20 - 5 + 4);
  });

  it('warns about distance, and (bug fix) says it is safer again inside 18 with iron armour', () => {
    const g = startGame(expeditionState({ stores: { 'water tank': 1, 'cured meat': 40 } }));
    embark(g, { 'cured meat': 15 });
    for (let i = 0; i < 8; i++) g.world.move('east');
    expect(logHas(g, 'dangerous to be this far from the village without proper protection')).toBe(true);
    g.world.move('west');
    expect(logHas(g, 'safer here')).toBe(true);

    const h = startGame(expeditionState({ stores: { 'water tank': 1, 'cured meat': 40, 'i armour': 1 } }));
    embark(h, { 'cured meat': 15 });
    for (let i = 0; i < 18; i++) h.world.move('east');
    expect(logHas(h, 'dangerous to be this far')).toBe(true);
    expect(logHas(h, 'safer here')).toBe(false);
    h.world.move('west');
    expect(logHas(h, 'safer here')).toBe(true);
  });

  it('fights start after at least 3 quiet steps', () => {
    const g = startGame(expeditionState({ game: { world: { map: (() => {
      const m = expeditionState().game.world.map.map((c: string[]) => c.map((t) => (t === TILE.VILLAGE ? t : TILE.FOREST)));
      return m;
    })() } } }));
    embark(g, { 'cured meat': 5 });
    g.rng = scriptedRng([0.1]); // every roll under the 20% fight chance
    g.world.move('east');
    g.world.move('east');
    g.world.move('east');
    expect(g.events.active()).toBeNull();
    g.world.move('east');
    expect(g.events.active()?.def.title).toBe('A Snarling Beast');
  });
});
