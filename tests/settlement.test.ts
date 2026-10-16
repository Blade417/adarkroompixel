import { describe, expect, it } from 'vitest';
import { BuilderWorkshop, PIXEL_BUILDABLES, PIXEL_RECIPES } from '../src/app/building';
import { ForestJourney } from '../src/app/forest';
import { PUBLIC_FACILITIES, villageView } from '../src/app/village';
import { CRAFTABLES, WORKERS } from '../src/core/data';
import { MemoryStorage } from '../src/core/save';
import { makeGame, startGame, villageState } from './helpers';
import { settlementRows } from '../src/ui/settlement';
import { uiStrings } from '../src/ui/strings';

const supplies = { wood: 30000, fur: 3000, meat: 3000, leather: 3000, scales: 3000, teeth: 3000, iron: 3000, coal: 3000, steel: 3000, sulphur: 3000, cloth: 100, 'cured meat': 100 };
function setup() {
  const g = startGame(villageState({ stores: supplies, game: { buildings: { hut: 5 }, population: 20 } }), { craftables: PIXEL_RECIPES });
  const journey = new ForestJourney(g), actions = new BuilderWorkshop(g, journey);
  journey.travel('village');
  return { g, journey, actions };
}

describe('public facility gameplay', () => {
  it('shows fractional hunter yields accurately and warns when inputs cannot feed the assigned group', () => {
    const { g, actions } = setup();
    actions.build('lodge'); actions.build('tannery'); actions.assign('tanner', 2);
    g.store.set('stores.fur', 9);
    const ui = uiStrings('en');
    const html = settlementRows(g, actions, 'workers', null, true, ui, () => '');
    expect(html).toContain('fur +0.5 · meat +0.5');
    expect(html).toContain('Low inputs: fur');
    expect(settlementRows(g, actions, 'workers', null, false, ui, () => '')).toContain('Visit the village');
  });
  it('builds all seven original facilities individually, charges every input once and renders real ownership', () => {
    const { g, actions } = setup();
    expect(PIXEL_BUILDABLES).toHaveLength(10);
    for (const { id } of PUBLIC_FACILITIES) {
      const cost = g.room.costOf(id), before = { ...g.store.get('stores') };
      expect(actions.build(id)).toBe(true);
      for (const [input, amount] of Object.entries(cost)) expect(g.store.num(`stores["${input}"]`)).toBe(before[input] - amount);
      expect(villageView(g).facilities[id]).toBe(1);
      const after = JSON.stringify(g.store.get('stores'));
      expect(actions.build(id)).toBe(false);
      expect(JSON.stringify(g.store.get('stores'))).toBe(after);
    }
    expect(actions.jobs()).toEqual(['hunter', 'trapper', 'tanner', 'charcutier', 'steelworker', 'armourer']);
  });

  it('caps worker transfers at available residents and returns workers to wood gathering', () => {
    const { g, actions } = setup();
    expect(actions.assign('hunter', 1)).toBe(false);
    actions.build('lodge');
    expect(actions.assign('hunter', 50)).toBe(true);
    expect(g.store.num('game.workers.hunter')).toBe(20);
    expect(g.outside.numGatherers()).toBe(0);
    expect(actions.assign('trapper', 1)).toBe(false);
    expect(actions.assign('hunter', -5)).toBe(true);
    expect(g.outside.numGatherers()).toBe(5);
    expect(g.getIncome('hunter').stores).toEqual({ fur: 7.5, meat: 7.5 });
    expect(g.getIncome('gatherer').stores).toEqual({ wood: 5 });
    for (const amount of [NaN, Infinity, 0, 0.5]) expect(actions.assign('hunter', amount)).toBe(false);
    expect(actions.assign('invented job', 1)).toBe(false);
    actions.assign('hunter', -100);
    expect(g.outside.numGatherers()).toBe(20);
  });

  it('runs the original ten-second hunting and processing chain and skips a whole group on insufficient input', () => {
    const { g, actions } = setup();
    for (const id of ['lodge', 'tannery', 'smokehouse'] as const) actions.build(id);
    g.outside.stop(); g.events.stop();
    actions.assign('hunter', 2); actions.assign('tanner', 1); actions.assign('charcutier', 1);
    g.store.set('stores.fur', 100); g.store.set('stores.meat', 100); g.store.set('stores.leather', 0); g.store.set('stores["cured meat"]', 0);
    g.clock.run(1000, 1000);
    expect(g.store.num('stores.fur')).toBe(96);
    expect(g.store.num('stores.meat')).toBe(96);
    expect(g.store.num('stores.leather')).toBe(1);
    expect(g.store.num('stores["cured meat"]')).toBe(1);
    actions.assign('hunter', -2);
    g.store.set('stores.fur', 4); g.store.set('stores.meat', 4);
    g.clock.run(10000, 1000);
    expect(g.store.num('stores.fur')).toBe(4);
    expect(g.store.num('stores.meat')).toBe(4);
    expect(g.store.num('stores.leather')).toBe(1);
    expect(g.store.num('stores["cured meat"]')).toBe(1);
  });

  it('enforces workshop, revealed recipe, temperature, cost and maximum for crafting', () => {
    const { g, actions } = setup();
    expect(actions.craft('bone spear')).toBe(false);
    actions.build('workshop');
    const before = g.store.num('stores.wood');
    expect(actions.craft('bone spear')).toBe(true);
    expect(g.store.num('stores.wood')).toBe(before - 100);
    expect(g.store.num('stores["bone spear"]')).toBe(1);
    expect(actions.craft('waterskin')).toBe(true);
    expect(actions.craft('waterskin')).toBe(false);
    g.store.set('game.temperature.value', 1);
    expect(actions.craft('torch')).toBe(false);
    expect(actions.craft('unknown')).toBe(false);
    expect(actions.craft('lodge')).toBe(false);
    expect(Object.keys(CRAFTABLES).filter(id => CRAFTABLES[id].type !== 'building').every(id => Boolean(WORKERS[id]) || actions.craftOptions().includes(id))).toBe(true);
  });

  it('trades only at a built trading post, preserves discovery gating and buys one compass', () => {
    const { g, actions } = setup();
    expect(actions.buy('scales')).toBe(false);
    actions.build('trading post');
    expect(actions.buyOptions()).not.toContain('energy cell');
    expect(actions.buy('energy cell')).toBe(false);
    const fur = g.store.num('stores.fur');
    expect(actions.buy('scales')).toBe(true);
    expect(g.store.num('stores.fur')).toBe(fur - 150);
    expect(actions.buy('compass')).toBe(true);
    expect(actions.buy('compass')).toBe(false);
    expect(g.path.initialized).toBe(true);
    g.store.set('stores.fur', 0);
    expect(actions.buy('scales')).toBe(false);
  });

  it('blocks mutations in the forest, during an event and after game over', () => {
    const { g, journey, actions } = setup();
    actions.build('lodge'); actions.build('workshop'); actions.build('trading post');
    const blocked = () => {
      const before = JSON.stringify(g.store.state);
      expect(actions.build('tannery')).toBe(false); expect(actions.craft('torch')).toBe(false);
      expect(actions.buy('scales')).toBe(false); expect(actions.assign('hunter', 1)).toBe(false);
      expect(JSON.stringify(g.store.state)).toBe(before);
    };
    journey.travel('outside'); blocked(); journey.travel('village');
    g.events.startEvent({ title: 'wait', scenes: { start: { buttons: {} } } }); blocked();
    g.events.endEvent(); g.over = true; blocked();
  });

  it('restores built appearances, assignments and their income through normal export and import', () => {
    const { g, actions } = setup();
    actions.build('lodge'); actions.assign('hunter', 5);
    const next = makeGame({ craftables: PIXEL_RECIPES, storage: new MemoryStorage() });
    expect(next.importCode(g.exportCode())).toBe(true); next.start();
    const journey = new ForestJourney(next); journey.restoreLocation();
    expect(journey.place).toBe('village');
    expect(villageView(next).facilities.lodge).toBe(1);
    expect(next.store.num('game.workers.hunter')).toBe(5);
    expect(next.getIncome('hunter').stores).toEqual({ fur: 2.5, meat: 2.5 });
    expect(next.outside.numGatherers()).toBe(15);
  });
});
