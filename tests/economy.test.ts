import { describe, expect, it } from 'vitest';
import { settlementEconomy } from '../src/app/economy';
import { settlementGoal } from '../src/app/progression';
import { BuilderWorkshop } from '../src/app/building';
import { ForestJourney } from '../src/app/forest';
import { economyRows } from '../src/ui/economy';
import { uiStrings } from '../src/ui/strings';
import { startGame, villageState } from './helpers';

describe('village economy and suggested milestones', () => {
  it('includes the builder and residents, preserves fractional yields, and separates gross inputs and outputs', () => {
    const g = startGame(villageState({ game: { buildings: { hut: 4, lodge: 1, tannery: 1 }, population: 12, workers: { hunter: 10, tanner: 1 } } }));
    g.setIncome('builder', { delay: 10, stores: { wood: 2 } });
    const state = JSON.stringify(g.store.state), e = settlementEconomy(g);
    expect(e.rows.find(row => row.id === 'fur')).toMatchObject({ produced: 5, consumed: 5, net: 0 });
    expect(e.rows.find(row => row.id === 'wood')).toMatchObject({ produced: 3, consumed: 0, net: 3 });
    expect(e.rows.find(row => row.id === 'leather')?.net).toBe(1);
    expect(JSON.stringify(g.store.state)).toBe(state);
    g.outside.decreaseWorker('hunter', 1);
    expect(settlementEconomy(g).rows.find(row => row.id === 'fur')?.net).toBe(-0.5);
    g.store.set('stores.leather', 0);
    g.outside.decreaseWorker('tanner', 1);
    expect(settlementEconomy(g).rows.find(row => row.id === 'leather')).toMatchObject({ stock: 0, produced: 0, net: 0 });
  });

  it('projects full-group pauses and respects supplies produced earlier in the same tick', () => {
    const g = startGame(villageState({ stores: { wood: 0, fur: 0, meat: 0 }, game: { buildings: { hut: 4, lodge: 1, tannery: 1, smokehouse: 1 }, population: 13, workers: { hunter: 10, tanner: 1, charcutier: 2 } } }), { language: 'zh' });
    g.outside.stop(); g.events.stop();
    const e = settlementEconomy(g);
    expect(e.shortages.map(short => short.source)).toEqual(['charcutier']);
    expect(e.rows.find(row => row.id === 'leather')?.forecast).toBe(1);
    expect(e.rows.find(row => row.id === 'cured meat')).toMatchObject({ net: 2, forecast: 0 });
    g.tick(10_000);
    for (const row of e.rows) expect(g.store.num(`stores["${row.id}"]`) - row.stock).toBeCloseTo(row.forecast);
    const html = economyRows(g, uiStrings('zh'));
    expect(html).toContain('10 名猎人');
    expect(html).toContain('5 名采木者');
    expect(html).toContain('计划净变化');
  });

  it('follows source order even when a consumer is registered before a producer and normalises differing intervals', () => {
    const g = startGame(villageState({ stores: { fur: 0 } }));
    g.outside.stop(); g.events.stop();
    g.setIncome('tanner', { delay: 10, stores: { fur: -5, leather: 1 } });
    g.setIncome('hunter', { delay: 10, stores: { fur: 5 } });
    g.setIncome('builder', { delay: 5, stores: { wood: 1 } });
    const e = settlementEconomy(g);
    expect(e.shortages[0].source).toBe('tanner');
    expect(e.rows.find(row => row.id === 'wood')?.produced).toBe(2);
    g.tick(10_000);
    for (const row of e.rows) expect(g.store.num(`stores["${row.id}"]`) - row.stock).toBeCloseTo(row.forecast);
  });

  it('guides the natural opening without revealing recipes or writing progress flags', () => {
    const g = startGame(), before = JSON.stringify(g.store.state);
    expect(settlementGoal(g).id).toBe('fire');
    expect(JSON.stringify(g.store.state)).toBe(before);
    g.room.tendFire();
    expect(settlementGoal(g).id).toBe('warm');
    g.tick(46_000);
    expect(settlementGoal(g).id).toBe('forage');
    const journey = new ForestJourney(g); journey.travel('outside'); journey.gather('branches');
    expect(settlementGoal(g).id).toBe('recover');
  });

  it('shows missing materials, advances after successful actions and accepts an early compass without mandatory full expansion', () => {
    const g = startGame(villageState({ stores: { wood: 12 } }));
    expect(settlementGoal(g)).toMatchObject({ id: 'cart', target: 'forest', missing: { wood: 18 } });
    g.store.set('stores.wood', 100);
    new BuilderWorkshop(g).build('cart');
    expect(settlementGoal(g).id).toBe('trap');
    g.store.addM('stores', { compass: 1, waterskin: 1, rucksack: 1, 'bone spear': 1, 'cured meat': 10 });
    expect(settlementGoal(g)).toMatchObject({ id: 'ready', target: 'expedition' });
    expect(g.outside.huts).toBe(0);
    const processing = startGame(villageState({ stores: { wood: 1000, leather: 20, scales: 10, 'cured meat': 10 },
      game: { buildings: { cart: 1, trap: 1, hut: 2, lodge: 1, tannery: 1, smokehouse: 1 }, population: 8, workers: { hunter: 2, tanner: 1, charcutier: 1 } } }));
    expect(settlementGoal(processing)).toMatchObject({ id: 'workshop', target: 'workers', missing: { leather: 80 } });
    for (const lang of ['zh', 'en'] as const) {
      const html = economyRows(g, uiStrings(lang));
      expect(html).not.toContain('goal.ready');
      expect(html).not.toContain('undefined');
    }
  });
});
