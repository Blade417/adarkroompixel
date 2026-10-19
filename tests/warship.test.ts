import { describe, expect, it } from 'vitest';
import { Expedition } from '../src/app/expedition';
import { MemoryStorage, scriptedRng, type Game } from '../src/core';
import { TILE, WORLD } from '../src/core/data';
import type { GameEventDef } from '../src/core/types';
import { expeditionState, makeGame, startGame } from './helpers';

const R = WORLD.RADIUS;
const WINGS = [
  { id: 'engineering', end: '8', recipes: ['hypo', 'kinetic armour'] },
  { id: 'martial', end: '13', recipes: ['plasma rifle', 'disruptor'] },
  { id: 'medical', end: '17', recipes: ['glowstone', 'stim'] },
  { id: 'command', end: '7', recipes: [] }
] as const;

function prepare(completed: Record<string, boolean> = {}) {
  const state = expeditionState({
    features: { location: { fabricator: true } },
    game: { world: { executioner: true, ...completed } },
    stores: { 'kinetic armour': 1, 'cargo drone': 1, waterskin: 1,
      'plasma rifle': 1, 'energy blade': 1, disruptor: 1, 'energy cell': 140,
      medicine: 30, hypo: 8, 'cured meat': 12, 'alien alloy': 3, grenade: 2 }
  });
  state.game.world.map[R + 1][R] = TILE.EXECUTIONER;
  const storage = new MemoryStorage(), g = startGame(state, { storage });
  const ex = new Expedition(g); expect(ex.open()).toBe(true);
  for (const [id, n] of Object.entries({ 'plasma rifle': 1, 'energy blade': 1, disruptor: 1,
    'energy cell': 140, medicine: 30, hypo: 8, 'cured meat': 12, 'alien alloy': 3, grenade: 2 })) ex.pack(id, n);
  expect(ex.depart()).toBe(true); g.rng = scriptedRng([.1]); expect(ex.move('east')).toBe(true);
  expect(g.events.active()?.def).toBe(g.content.events.Executioner['executioner-antechamber']);
  return { g, ex, storage };
}

function resume(g: Game, storage: MemoryStorage) {
  const event = g.events.snapshot(), outfit = { ...g.path.outfit }, hp = g.world.health;
  const state = structuredClone(g.world.state);
  g.saveNow(); g.stop();
  const next = makeGame({ storage, rng: scriptedRng([.1]) }); next.start();
  const ex = new Expedition(next); ex.restore();
  expect(next.events.snapshot()).toEqual(event); expect(next.path.outfit).toEqual(outfit);
  if (next.active === 'world') expect(next.world.health).toBe(hp);
  expect(next.world.state).toEqual(state);
  expect(ex.paused).toBe(next.active === 'world'); ex.paused = false;
  return { g: next, ex };
}

function win(g: Game, ex: Expedition) {
  g.rng = scriptedRng([.1]);
  for (let i = 0; i < 1000 && !g.events.active()?.afterCombat; i++) {
    const c = g.events.active()!.combat!;
    if (g.world.health < 65) c.use('meds');
    if (g.world.health < 50) c.use('hypo');
    if (g.world.health < 45) c.use('eat');
    if (!c.isOver()) {
      c.use('shield'); ex.attack('disruptor');
      // Meditation stores damage for a counterattack, so wait it out.
      if (c.enemy.status !== 'meditation') { ex.attack('plasma rifle'); ex.attack('energy blade'); }
    }
    g.tick(250); expect(g.world.dead).toBe(false);
  }
  expect(g.events.active()?.afterCombat).toBe(true);
  g.tick(7500);
  while (g.world.health < g.world.getMaxHealth() && g.events.active()!.combat!.use('meds')) { /* original victory healing */ }
}

type Step = { from: string; button: string; roll: number; scene: string };
const edgeId = (s: Step) => `${s.from}:${s.button}:${s.scene}`;
/** Greedy representatives cover every non-exit button/outcome edge, not every path combination. */
function routes(def: GameEventDef, end: string) {
  const candidates: Step[][] = [];
  const walk = (from: string, path: Step[]) => {
    if (from === end) { candidates.push(path); return; }
    for (const [button, b] of Object.entries(def.scenes[from].buttons ?? {})) {
      if (!b.nextScene || b.nextScene === 'end') continue;
      let lower = 0;
      for (const [threshold, scene] of Object.entries(b.nextScene).sort((a, b) => +a[0] - +b[0])) {
        const roll = (lower + +threshold) / 2; lower = +threshold;
        walk(scene, [...path, { from, button, roll, scene }]);
      }
    }
  };
  walk('start', []);
  const uncovered = new Set(candidates.flatMap(r => r.map(edgeId))), selected: Step[][] = [];
  while (uncovered.size) {
    candidates.sort((a, b) => b.filter(s => uncovered.has(edgeId(s))).length - a.filter(s => uncovered.has(edgeId(s))).length);
    const best = candidates.shift(); if (!best) throw Error('Unreachable battleship edge');
    selected.push(best); best.forEach(s => uncovered.delete(edgeId(s)));
  }
  return selected;
}
const probe = startGame(expeditionState());
const cases = WINGS.flatMap(wing => routes(probe.content.events.Executioner['executioner-' + wing.id], wing.end)
  .map((route, i) => ({ wing, route, name: `${wing.id} route ${i + 1}` })));
const definitions = probe.content.events.Executioner; probe.stop();

describe('battleship wing branches and living returns', () => {
  it.each(cases)('$name', ({ wing, route }) => {
    let { g, ex, storage } = prepare(wing.id === 'command' ? { engineering: true, medical: true, martial: true } : {});
    expect(g.events.click(wing.id)).toBe(true);
    for (const step of route) {
      const ev = g.events.active()!;
      if (ev.combat) {
        expect(ex.attack('plasma rifle')).toBe(true); g.tick(100);
        // Preserve the in-flight ranged strike, HP, special timers and cooldowns.
        ({ g, ex } = resume(g, storage)); win(g, ex);
      }
      for (const blueprint of Object.keys(g.events.active()!.loot ?? {}).filter(id => id.endsWith(' blueprint'))) {
        expect(g.events.take(blueprint)).toBe(1);
        expect(g.events.take(blueprint)).toBe(0);
      }
      if (g.events.active()!.loot?.['fleet beacon']) expect(g.events.take('fleet beacon')).toBe(1);
      const b = g.events.active()!.scene.buttons![step.button], hp = g.world.health, water = g.world.water;
      const before = { ...g.path.outfit };
      // Three map rewards need distinct unrevealed centres, then the branch roll.
      g.rng = scriptedRng(step.button === 'scavenge' ? [.1, .1, .4, .1, .8, .8, step.roll, .1] : [step.roll, .1]);
      expect(g.events.click(step.button)).toBe(true);
      expect(g.events.active()?.sceneName).toBe(step.scene);
      for (const [id, cost] of Object.entries(b.cost ?? {})) {
        if (id === 'water') expect(g.world.water).toBe(water - cost);
        else if (id === 'hp') expect(g.world.health).toBe(hp - cost);
        else expect(g.path.outfit[id]).toBe(before[id] - cost);
      }
      if (step.button === 'use') expect(g.world.health).toBe(g.world.getMaxHealth());
      ({ g, ex } = resume(g, storage));
    }
    for (const item of wing.recipes) expect(g.store.get(`character.blueprints['${item}']`)).toBeFalsy();
    if (wing.id === 'command') {
      expect(g.world.state!.map[R + 1][R]).toBe(TILE.OUTPOST);
      expect(g.store.get('game.world.map')[R + 1][R]).toBe(TILE.EXECUTIONER);
    } else {
      expect(g.world.state![wing.id]).toBe(true); expect(g.store.get('game.world.' + wing.id)).toBeFalsy();
    }
    expect(g.events.click('leave')).toBe(true); expect(ex.move('west')).toBe(true);
    for (const item of wing.recipes) expect(g.store.get(`character.blueprints['${item}']`)).toBe(true);
    if (wing.id === 'command') {
      expect(g.store.num('stores["fleet beacon"]')).toBe(1);
      expect(g.store.get('game.world.map')[R + 1][R]).toBe(TILE.OUTPOST);
    } else expect(g.store.get('game.world.' + wing.id)).toBe(true);
    const stores = structuredClone(g.store.get('stores'));
    ({ g, ex } = resume(g, storage)); expect(g.store.get('stores')).toEqual(stores); g.stop();
  });

  it('covers every wing scene and every non-exit button/outcome in the original graph', () => {
    for (const wing of WINGS) {
      const def = definitions['executioner-' + wing.id], selected = cases.filter(c => c.wing.id === wing.id);
      expect(new Set(['start', ...selected.flatMap(c => c.route.map(s => s.scene))])).toEqual(new Set(Object.keys(def.scenes)));
      const expected = Object.entries(def.scenes).flatMap(([from, sc]) => Object.entries(sc.buttons ?? {})
        .flatMap(([button, b]) => typeof b.nextScene === 'object' ? Object.values(b.nextScene).map(scene => `${from}:${button}:${scene}`) : []));
      expect(new Set(selected.flatMap(c => c.route.map(edgeId)))).toEqual(new Set(expected));
    }
  });

  it('completes all three wings, opens command, takes the beacon and brings every blueprint home in one expedition', () => {
    let { g, ex, storage } = prepare();
    for (const wing of WINGS) {
      expect(g.events.click(wing.id)).toBe(true);
      const route = cases.find(c => c.wing.id === wing.id)!.route;
      for (const step of route) {
        if (g.events.active()!.combat) win(g, ex);
        for (const item of Object.keys(g.events.active()!.loot ?? {})) {
          if (item.endsWith(' blueprint') || item === 'fleet beacon') expect(g.events.take(item)).toBe(1);
        }
        g.rng = scriptedRng(step.button === 'scavenge' ? [.1,.1,.4,.1,.8,.8,step.roll,.1] : [step.roll,.1]);
        expect(g.events.click(step.button)).toBe(true);
        ({ g, ex } = resume(g, storage));
      }
      expect(g.events.click('leave')).toBe(true);
      if (wing.id !== 'command') {
        g.rng = scriptedRng([.99]); expect(ex.move('east')).toBe(true); expect(ex.move('west')).toBe(true);
        expect(g.events.active()?.def).toBe(g.content.events.Executioner['executioner-antechamber']);
        expect(g.events.buttons().find(b => b.id === wing.id)?.enabled).toBe(false);
      }
    }
    expect(ex.move('west')).toBe(true);
    for (const wing of WINGS.filter(w => w.id !== 'command')) {
      expect(g.store.get('game.world.' + wing.id)).toBe(true);
      for (const recipe of wing.recipes) expect(g.store.get(`character.blueprints['${recipe}']`)).toBe(true);
    }
    expect(g.store.num('stores["fleet beacon"]')).toBe(1);
    expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.OUTPOST);
    ({ g, ex } = resume(g, storage)); expect(g.store.num('stores["fleet beacon"]')).toBe(1); g.stop();
  });

  it('gates command access on all three wings and disables finished wings after reload', () => {
    let { g, ex, storage } = prepare();
    expect(g.events.buttons().filter(b => b.enabled).map(b => b.id)).toEqual(['engineering', 'medical', 'martial', 'leave']);
    g.events.endEvent(); g.stop();
    ({ g, ex, storage } = prepare({ engineering: true, martial: true }));
    expect(g.events.buttons().filter(b => b.enabled).map(b => b.id)).toEqual(['medical', 'leave']); g.stop();
    ({ g, ex, storage } = prepare({ engineering: true, martial: true, medical: true }));
    ({ g, ex } = resume(g, storage)); expect(g.events.buttons().filter(b => b.enabled).map(b => b.id)).toEqual(['command', 'leave']); g.stop();
  });

  it.each(WINGS.filter(w => w.id !== 'command'))('does not mark $id complete when retreating at its entrance', wing => {
    const { g, ex } = prepare(); g.events.click(wing.id); expect(g.events.click('leave')).toBe(true);
    expect(ex.move('west')).toBe(true); expect(g.store.get('game.world.' + wing.id)).toBeFalsy(); g.stop();
  });

  it('retains the martial map reward in the live map, across reload and after returning home', () => {
    let { g, ex, storage } = prepare();
    g.events.click('martial'); g.events.loadScene('7-1'); // Explicit map-reward fixture.
    const count = (mask: boolean[][]) => mask.flat().filter(Boolean).length;
    const before = count(g.world.state!.mask);
    g.rng = scriptedRng([.1, .1, .4, .1, .8, .8, .1]);
    expect(g.events.click('scavenge')).toBe(true);
    expect(count(g.world.state!.mask)).toBeGreaterThan(before);
    const revealed = structuredClone(g.world.state!.mask);
    ({ g, ex } = resume(g, storage)); expect(g.world.state!.mask).toEqual(revealed);
    win(g, ex); expect(g.events.click('leave')).toBe(true); expect(ex.move('west')).toBe(true);
    const returned = g.store.get('game.world.mask') as boolean[][];
    for(let x=0;x<revealed.length;x++) for(let y=0;y<revealed[x].length;y++) if(revealed[x][y]) expect(returned[x][y]).toBe(true);
    g.stop();
  });

  it.each([
    { wing: 'engineering', scene: '8', blueprints: ['hypo blueprint', 'kinetic armour blueprint'] },
    { wing: 'medical', scene: '17', blueprints: ['glowstone blueprint', 'stim blueprint'] },
    { wing: 'martial', scene: '13', blueprints: ['plasma rifle blueprint', 'disruptor blueprint'] },
    { wing: 'command', scene: '7', blueprints: [] }
  ])('does not commit the $wing completion, blueprints or beacon on death', ({ wing, scene, blueprints }) => {
    const { g } = prepare({ engineering: false, medical: false, martial: false });
    // Explicit death-after-discovery fixture, separate from the real combat routes above.
    g.events.switchEvent(g.content.events.Executioner['executioner-' + wing]); g.events.loadScene(scene);
    for (const item of blueprints) g.path.outfit[item] = 1;
    if (wing === 'command') g.path.outfit['fleet beacon'] = 1;
    g.events.endEvent(); g.world.die(); g.saveNow();
    expect(g.store.get('game.world.' + wing)).toBeFalsy(); expect(g.store.get('character.blueprints')).toBeFalsy();
    expect(g.store.num('stores["fleet beacon"]')).toBe(0);
    expect(g.store.get('game.world.map')[R+1][R]).toBe(TILE.EXECUTIONER);
    expect(g.path.outfit).toEqual({}); g.stop();
  });
});

describe('battleship specials across saved combat', () => {
  it.each([
    { wing: 'engineering', scene: '7', ms: 5100, status: 'shield' },
    { wing: 'martial', scene: '12', ms: 13100, status: 'energised' },
    { wing: 'medical', scene: '16', ms: 16100, status: 'enraged' }
  ])('preserves the $wing boss $status and its timers on reload', ({ wing, scene, ms, status }) => {
    let { g, ex, storage } = prepare(); g.events.click(wing); g.events.loadScene(scene);
    g.rng = scriptedRng([.1]); g.tick(ms);
    expect(g.events.active()!.combat!.enemy.status).toBe(status);
    ({ g, ex } = resume(g, storage)); win(g, ex); g.stop();
  });

  it('remembers the immortal wanderer special and cannot repeat it after reload', () => {
    let { g, ex, storage } = prepare({ engineering: true, medical: true, martial: true });
    g.events.click('command'); g.events.loadScene('6'); // Explicit boss timing fixture.
    g.rng = scriptedRng([.1]); g.events.active()!.combat!.use('shield'); g.tick(7100);
    expect(g.events.active()!.combat!.lastSpecial).toBe('shield');
    ({ g, ex } = resume(g, storage));
    g.events.active()!.combat!.use('shield'); g.tick(7000);
    expect(g.events.active()!.combat!.lastSpecial).toBe('enraged');
    g.rng = scriptedRng([.99]); g.tick(7000);
    expect(g.events.active()!.combat!.lastSpecial).toBe('meditation');
    ({ g, ex } = resume(g, storage)); g.stop();
  });

  it('restores a pending automaton explosion and applies its damage and loot exactly once', () => {
    let { g, ex, storage } = prepare(); g.events.click('medical'); g.events.loadScene('8');
    g.rng = scriptedRng([.99]);
    // Use real attacks, keeping enemy misses deterministic for an exact explosion damage check.
    while (!g.events.active()!.combat!.won) {
      g.rng = scriptedRng([.1]); ex.attack('plasma rifle'); g.tick(250);
      g.rng = scriptedRng([.99]); g.tick(750);
    }
    expect(g.events.active()!.combat!.enemy.status).toBe('exploding');
    const hp = g.world.health; ({ g, ex } = resume(g, storage));
    g.tick(3500); expect(g.world.health).toBe(hp-30);
    expect(g.events.active()!.afterCombat).toBe(true);
    expect(g.events.take('glowstone blueprint')).toBe(1);
    ({ g, ex } = resume(g, storage)); g.tick(3500);
    expect(g.world.health).toBe(hp-30); expect(g.events.take('glowstone blueprint')).toBe(0); g.stop();
  });

  it('restores broken-medic venom and the ongoing poison tick instead of clearing or doubling it', () => {
    let { g, ex, storage } = prepare(); g.events.click('medical'); g.events.loadScene('11');
    g.rng = scriptedRng([.1]);
    for (let i=0;i<4;i++) { ex.attack('plasma rifle'); g.tick(250); if(i<3)g.tick(750); }
    expect(g.events.active()!.combat!.enemy.hp).toBe(32);
    expect(g.events.active()!.combat!.enemy.status).toBe('venomous');
    ({ g, ex } = resume(g, storage));
    g.tick(3000); const hp = g.world.health;
    expect(g.events.active()!.combat!.snapshot().dot?.damage).toBe(7);
    ({ g, ex } = resume(g, storage)); g.tick(1000);
    expect(g.world.health).toBe(hp-7); g.stop();
  });
});
