import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { MemoryStorage, SAVE_KEY, decodeSave, encodeSave, scriptedRng } from '../src/core';
import { TILE } from '../src/core/data';
import { ROOT } from '../src/node';
import { expeditionState, logHas, makeGame, startGame, villageState } from './helpers';

const SEC = 1000;

function shipState(extra: any = {}) {
  return villageState({
    features: { location: { spaceShip: true } },
    game: { spaceShip: { hull: 0, thrusters: 1 } },
    stores: { 'alien alloy': 3, wood: 100 },
    ...extra
  });
}

describe('the ship and the ascent', () => {
  it('needs a hull to lift off, and asks once', () => {
    const g = startGame(shipState());
    expect(g.tabs()).toContain('ship');
    g.travelTo('ship');
    expect(logHas(g, 'the wanderer fleet hovers')).toBe(true);
    expect(g.ship.canLiftOff()).toBe(false);
    g.ship.reinforceHull();
    g.ship.upgradeEngine();
    expect([g.ship.hull, g.ship.thrusters, g.store.get('stores["alien alloy"]')]).toEqual([1, 2, 1]);
    expect(g.ship.checkLiftOff()).toBe(true);
    expect(g.events.active()?.def.title).toBe('Ready to Leave?');
    g.events.click('fly');
    expect(g.active).toBe('space');
    expect(g.store.get('game.spaceShip.seenWarning')).toBe(true);
    expect(g.space.speed()).toBe(5);
  });

  it('an asteroid on the last hull point sends the ship back down', () => {
    const g = startGame(shipState({ game: { spaceShip: { hull: 1, thrusters: 1, seenWarning: true } } }));
    g.travelTo('ship');
    g.rng = scriptedRng([0.5]); // asteroids fall straight through the centre
    g.ship.checkLiftOff();
    expect(g.active).toBe('space');
    g.tick(2000);
    expect(g.active).toBe('ship');
    expect(g.space.hull).toBe(0);
    expect(g.cooldowns.isCooling('liftoffButton')).toBe(true);
  });

  it('surviving 60 s wins: score, prestige, and a fresh start', () => {
    const storage = new MemoryStorage();
    const g = startGame(shipState({ game: { spaceShip: { hull: 2, thrusters: 1, seenWarning: true } }, previous: { score: 1000 } }), { storage });
    const endings: any[] = [];
    g.bus.on((e) => e.type === 'ending' && endings.push(e));
    g.travelTo('ship');
    g.rng = scriptedRng([0]); // asteroids hug the left edge
    g.ship.checkLiftOff();
    g.tick(25 * SEC);
    expect(g.space.title()).toBe('Mesosphere');
    g.tick(35 * SEC);
    expect(g.over).toBe(true);
    // score: 100 wood + 3 alien alloy * 10 + hull 2 * 50
    expect(endings).toEqual([{ type: 'ending', score: 230, total: 1230, expansion: false }]);
    const saved = JSON.parse(storage.getItem(SAVE_KEY)!);
    expect(Object.keys(saved)).toEqual(['previous']);
    expect(saved.previous.score).toBe(1230);
    expect(saved.previous.stores[0]).toBe(100);

    // next generation: the destroyed village holds what was left behind
    const h = makeGame({ storage });
    h.start();
    expect(h.store.get('previous.score')).toBe(1230);
    h.store.set('stores.compass', 1);
    expect(h.world.LANDMARKS[TILE.CACHE]).toBeDefined();
    const map: string[][] = h.store.get('game.world.map');
    expect(map.flat().filter((t) => t === TILE.CACHE)).toHaveLength(1);
  });
});

describe('saves', () => {
  it('export codes are identical to the original Base64 encoder (incl. Chinese text)', () => {
    const ctx: any = {};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'original/lib/base64.js'), 'utf8') + ';this.Base64 = Base64;', ctx);
    const json = JSON.stringify({ stores: { wood: 12 }, note: '小黑屋 — a dark room' });
    expect(encodeSave(json)).toBe(ctx.Base64.encode(json));
    expect(decodeSave(ctx.Base64.encode(json))).toEqual(JSON.parse(json));
  });

  it('rejects junk codes', () => {
    expect(decodeSave('')).toBeNull();
    expect(decodeSave('not base64 !!')).toBeNull();
    expect(decodeSave(btoa('[1,2,3]'))).toBeNull();
  });

  it('export -> import round trip', () => {
    const storage = new MemoryStorage();
    const g = startGame(villageState({ stores: { wood: 777 } }), { storage });
    const code = g.exportCode();
    const other = new MemoryStorage();
    const h = makeGame({ storage: other });
    expect(h.importCode(code)).toBe(true);
    h.start();
    expect(h.store.get('stores.wood')).toBe(777);
  });

  it('loads an original v1.3 save as-is', () => {
    const original = {
      version: 1.3,
      features: { location: { room: true, outside: true, world: true }, executioner: true },
      stores: { wood: 340, fur: 12, compass: 1 },
      game: {
        fire: { value: 3, text: 'burning' }, temperature: { value: 3, text: 'warm' }, builder: { level: 4 },
        buildings: { hut: 2, lodge: 1 }, population: 8, workers: { hunter: 3, trapper: 0 },
        world: expeditionState().game.world
      },
      income: { builder: { delay: 10, stores: { wood: 2 }, timeLeft: 4 } },
      cooldown: { gatherButton: 12.5 },
      character: { perks: { scout: true } },
      config: { soundOn: true }
    };
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify(original));
    const g = makeGame({ storage });
    g.start();
    expect(g.room.fire).toBe(3);
    expect(g.tabs()).toEqual(['room', 'outside', 'path']);
    expect(g.outside.numGatherers()).toBe(5);
    expect(g.hasPerk('scout')).toBe(true);
    expect(g.cooldowns.isCooling('gatherButton')).toBe(true);
    g.tick(12.5 * SEC);
    expect(g.cooldowns.isCooling('gatherButton')).toBe(false);
  });

  it('migrates a pre-1.3 save', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({
      version: 1.2,
      stores: { wood: 50 },
      room: { builder: 4 },
      outside: { population: 4, buildings: { hut: 1 }, workers: {}, seenForest: true },
      perks: { evasive: true }
    }));
    const g = makeGame({ storage });
    g.start();
    expect(g.store.get('version')).toBe(1.3);
    expect(g.room.builderLevel).toBe(4);
    expect(g.store.get('game.population')).toBe(4);
    expect(g.hasPerk('evasive')).toBe(true);
    expect(g.store.get('room')).toBeUndefined();
  });

  it('(bug fix) reloading right after the stranger arrives still unlocks the forest', () => {
    const g = startGame({ version: 1.3, features: { location: { room: true } }, game: { fire: { value: 3, text: 'burning' }, temperature: { value: 1, text: 'cold' }, builder: { level: 1 } } });
    g.tick(15 * SEC);
    expect(g.store.get('stores.wood')).toBe(4);
    expect(g.tabs()).toContain('outside');
  });

  it('autosaves shortly after changes', () => {
    const storage = new MemoryStorage();
    const g = startGame(villageState(), { storage });
    g.store.set('stores.wood', 4242);
    g.tick(300);
    expect(JSON.parse(storage.getItem(SAVE_KEY)!).stores.wood).toBe(4242);
  });
});
