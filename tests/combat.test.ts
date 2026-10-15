import { describe, expect, it } from 'vitest';
import { scriptedRng } from '../src/core';
import { TILE, WORLD } from '../src/core/data';
import { expeditionState, logHas, startGame } from './helpers';

const R = WORLD.RADIUS;

function inTheWild(extraState: any = {}, outfit: Record<string, number> = { 'cured meat': 5 }) {
  const stores: Record<string, number> = { 'cured meat': 20 };
  for (const k in outfit) stores[k] = Math.max(stores[k] ?? 0, outfit[k]);
  const g = startGame(expeditionState({ stores, ...extraState }));
  g.travelTo('path');
  for (const [k, n] of Object.entries(outfit)) g.path.increaseSupply(k, n);
  g.path.embark();
  return g;
}

describe('combat (real time, original timings)', () => {
  it('a bone spear kills a snarling beast in three hits while it bites back every second', () => {
    const g = inTheWild({}, { 'cured meat': 5, 'bone spear': 1 });
    g.rng = scriptedRng([0.1]); // everyone always hits, loot at minimum
    g.events.startEvent(g.content.events.Encounters[0]);
    const c = g.events.active()!.combat!;
    expect(c.attacks().map((a) => a.id)).toEqual(['bone spear']);
    c.attack('bone spear');
    g.tick(100);
    expect(c.enemy.hp).toBe(3);
    expect(c.attack('bone spear')).toBe(false); // 2 s cooldown
    g.tick(1900);
    c.attack('bone spear');
    g.tick(2000);
    c.attack('bone spear');
    g.tick(300);
    expect(c.won).toBe(true);
    expect(g.world.health).toBe(6);
    const ev = g.events.active()!;
    expect(ev.afterCombat).toBe(true);
    expect(ev.loot).toEqual({ fur: 1, meat: 1, teeth: 1 });
    expect(g.events.buttons()).toEqual([expect.objectContaining({ id: 'leaveBtn', enabled: false })]);
    g.events.takeEverything();
    expect(g.path.outfit).toMatchObject({ fur: 1, meat: 1, teeth: 1 });
    g.tick(1000);
    g.events.click('leaveBtn');
    expect(g.events.active()).toBeNull();
  });

  it('fists when unarmed; 50 punches make a boxer', () => {
    const g = inTheWild({ character: { punches: 49 } });
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Encounters[0]);
    const c = g.events.active()!.combat!;
    expect(c.attacks().map((a) => a.id)).toEqual(['fists']);
    c.attack('fists');
    expect(g.hasPerk('boxer')).toBe(true);
    expect(logHas(g, 'learned to throw punches with purpose')).toBe(true);
  });

  it('running out of bullets falls back to fists', () => {
    const g = inTheWild({}, { 'cured meat': 2, rifle: 1, bullets: 1 });
    g.rng = scriptedRng([0.9]); // miss everything
    g.events.startEvent(g.content.events.Encounters[0]);
    const c = g.events.active()!.combat!;
    expect(c.attacks().map((a) => a.id)).toEqual(['rifle']);
    c.attack('rifle');
    expect(g.path.outfit.bullets).toBe(0);
    expect(c.attacks().map((a) => [a.id, a.enabled])).toEqual([['fists', true], ['rifle', false]]);
  });

  it('dying in a fight ends the expedition', () => {
    const g = inTheWild();
    g.world.setHp(1);
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Encounters[0]);
    // the bite lands at 1.1 s, the death check runs after the second half of the lunge (1.2 s)
    g.tick(1100);
    expect(g.world.health).toBe(0);
    g.tick(100);
    expect(g.events.active()).toBeNull();
    expect(g.active).toBe('room');
    expect(g.world.dead).toBe(true);
  });

  it('kinetic armour shield turns the next hit into healing', () => {
    const g = inTheWild({ stores: { 'kinetic armour': 1, 'cured meat': 20 } });
    g.world.setHp(50);
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Encounters[0]);
    const c = g.events.active()!.combat!;
    expect(c.use('shield')).toBe(true);
    g.tick(1100);
    expect(g.world.health).toBe(51);
    expect(c.player.status).toBe('none');
    g.tick(1000);
    expect(g.world.health).toBe(50);
  });

  it('bolas stun the enemy for 4 s', () => {
    const g = inTheWild({}, { 'cured meat': 5, bolas: 2 });
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Encounters[0]);
    const c = g.events.active()!.combat!;
    c.attack('bolas');
    g.tick(3900);
    expect(g.world.health).toBe(10);
    g.tick(1300);
    expect(g.world.health).toBe(9);
  });

  it('the immortal wanderer cycles shield / rage / meditation (original content specials)', () => {
    const g = inTheWild({ stores: { 'kinetic armour': 1, 'cured meat': 20 } });
    g.rng = scriptedRng([0.95]);
    g.events.startEvent(g.content.events.Executioner['executioner-command']);
    g.events.loadScene('6');
    const c = g.events.active()!.combat!;
    expect(c.enemy).toMatchObject({ hp: 500, chara: '@' });
    g.tick(7000);
    expect(['shield', 'enraged', 'meditation']).toContain(c.enemy.status);
    expect(g.content.events._lastSpecial).toBe(c.enemy.status);
  });

  it('a broken medic turns venomous below 40 hp (atHealth hook from content)', () => {
    const g = inTheWild({}, { 'cured meat': 5, bayonet: 1 });
    g.rng = scriptedRng([0.1]);
    g.events.startEvent(g.content.events.Executioner['executioner-medical']);
    g.events.loadScene('11');
    const c = g.events.active()!.combat!;
    expect(c.scene.enemy).toBe('broken medic');
    c.enemy.hp = 45;
    c.attack('bayonet');
    g.tick(200);
    expect(c.enemy.status).toBe('venomous');
  });
});

describe('setpieces (original content)', () => {
  it('the swamp: give the old wanderer a charm, learn to eat well', () => {
    const g = inTheWild({}, { 'cured meat': 5, charm: 1 });
    g.events.startEvent(g.content.events.Setpieces.swamp);
    g.events.click('enter');
    g.events.click('talk');
    expect(g.hasPerk('gastronome')).toBe(true);
    expect(g.path.outfit.charm).toBe(0);
    expect(g.world.state!.map[R][R]).toBe('A!');
  });

  it('(bug fix) rushing through the fire costs 10 hp', () => {
    const g = inTheWild({ stores: { 'i armour': 1, 'cured meat': 20 } });
    g.rng = scriptedRng([0.9]);
    g.events.startEvent(g.content.events.Executioner['executioner-engineering']);
    g.events.loadScene('1-3');
    expect(g.world.health).toBe(25);
    g.events.click('run');
    expect(g.world.health).toBe(15);
  });

  it('clearing a cave leaves an outpost and a road home', () => {
    const state = expeditionState();
    state.game.world.map[R + 4][R] = TILE.CAVE;
    const g = startGame(state);
    g.travelTo('path');
    g.path.increaseSupply('cured meat', 5);
    g.path.embark();
    g.rng = scriptedRng([0.9]);
    for (let i = 0; i < 4; i++) g.world.move('east');
    expect(g.events.active()?.def.title).toBe('A Damp Cave');
    g.events.loadScene('end1');
    const map = g.world.state!.map;
    expect(map[R + 4][R]).toBe(TILE.OUTPOST);
    expect([map[R + 1][R], map[R + 2][R], map[R + 3][R]]).toEqual([TILE.ROAD, TILE.ROAD, TILE.ROAD]);
  });

  it('outposts refill water once per trip', () => {
    const state = expeditionState();
    state.game.world.map[R + 2][R] = TILE.OUTPOST;
    const g = startGame(state);
    g.travelTo('path');
    g.path.increaseSupply('cured meat', 5);
    g.path.embark();
    g.rng = scriptedRng([0.9]);
    g.world.move('east');
    g.world.move('east');
    expect(g.world.water).toBe(10);
    expect(logHas(g, 'water replenished')).toBe(true);
    g.tick(1000); // leave buttons have the original 1 s cooldown
    g.events.click('leave');
    g.world.move('east');
    g.world.move('west');
    expect(g.events.active()).toBeNull();
  });
});

describe('the Executioner and the fabricator', () => {
  it('the strange device unlocks the fabricator; blueprints unlock recipes', () => {
    const g = inTheWild({}, { 'cured meat': 5 });
    g.path.outfit['hypo blueprint'] = 1;
    g.events.startEvent(g.content.events.Executioner['executioner-intro']);
    g.events.loadScene('7');
    expect(g.world.state!.executioner).toBe(true);
    g.events.click('leave');
    g.world.move('east');
    g.world.move('west');
    expect(g.tabs()).toContain('fabricator');
    expect(logHas(g, 'builder knows the strange device')).toBe(true);
    expect(logHas(g, 'blueprints feed into the fabricator data port')).toBe(true);
    expect(g.fabricator.options()).toEqual(['energy blade', 'fluid recycler', 'cargo drone', 'hypo']);
    g.store.set('stores["alien alloy"]', 5);
    expect(g.fabricator.fabricate('hypo')).toBe(true);
    expect(g.store.get('stores.hypo')).toBe(5);
    // (bug fix) maximums are enforced
    expect(g.fabricator.fabricate('fluid recycler')).toBe(true);
    expect(g.fabricator.fabricate('fluid recycler')).toBe(false);
    expect(g.store.get('stores["alien alloy"]')).toBe(2);
  });

  it('the second visit opens the elevators; the command deck needs all three wings', () => {
    const g = inTheWild({ game: { world: { executioner: true } } });
    const map = g.world.state!.map;
    map[R + 1][R] = TILE.EXECUTIONER;
    g.rng = scriptedRng([0.9]);
    g.world.move('east');
    expect(g.events.active()?.def.title).toBe('A Ravaged Battleship');
    const enabled = Object.fromEntries(g.events.buttons().map((b) => [b.id, b.enabled]));
    expect(enabled).toEqual({ engineering: true, medical: true, martial: true, command: false, leave: true });
    g.events.click('engineering');
    expect(g.events.active()?.def.title).toBe('Engineering Wing');
  });
});
