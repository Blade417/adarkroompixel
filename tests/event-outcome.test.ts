import { describe, expect, it } from 'vitest';
import { EventOutcome } from '../src/app/event-outcome';
import { scriptedRng } from '../src/core';
import { startGame, villageState } from './helpers';

describe('immediate event feedback', () => {
  it('reports initial trap and population loss from onLoad, without applying it twice', () => {
    const g = startGame(villageState({ game: { buildings: { trap: 5, hut: 5 }, population: 20 } }));
    const feedback = new EventOutcome(g); g.rng = scriptedRng([0]);
    g.events.startEvent(g.content.events.Outside[0]);
    expect(feedback.changes).toEqual([{ kind: 'buildings', id: 'trap', amount: -1 }]);
    expect(g.store.num('game.buildings.trap')).toBe(4);
    feedback.choose('ignore');
    g.events.startEvent(g.content.events.Outside[1]);
    expect(feedback.changes).toContainEqual({ kind: 'population', id: 'residents', amount: -4 });
    expect(feedback.changes).toContainEqual({ kind: 'buildings', id: 'hut', amount: -1 });
    expect(g.outside.population).toBe(16);
  });

  it('reports payment and actual random rewards, excluding income accrued while reading', () => {
    const g = startGame(villageState({ stores: { fur: 100 } }));
    const feedback = new EventOutcome(g);
    g.events.startEvent(g.content.events.Room[3]);
    g.store.add('stores.wood', 77); // passive change while considering the choice
    g.rng = scriptedRng([0]);
    expect(feedback.choose('50furs')).toBe(true);
    expect(feedback.changes).toEqual([{ kind: 'stores', id: 'fur', amount: -50 }, { kind: 'stores', id: 'scales', amount: 20 }]);
    expect(g.store.num('stores.scales')).toBe(20);
  });

  it('keeps repeated purchases separate and refuses disabled choices without invented rewards', () => {
    const g = startGame(villageState({ stores: { fur: 200 } }));
    const feedback = new EventOutcome(g);
    g.events.startEvent(g.content.events.Room[0]);
    expect(feedback.choose('buyScales')).toBe(true);
    expect(feedback.changes).toEqual([{ kind: 'stores', id: 'fur', amount: -100 }, { kind: 'stores', id: 'scales', amount: 1 }]);
    expect(feedback.choose('buyScales')).toBe(true);
    expect(feedback.changes[0].amount).toBe(-100);
    expect(feedback.choose('buyScales')).toBe(false);
    expect(g.store.num('stores.scales')).toBe(2);
    feedback.choose('goodbye');
    g.events.startEvent(g.content.events.Room[2]);
    expect(feedback.changes).toEqual([]);
  });

  it('does not present a promised wanderer return as an immediate reward', () => {
    const g = startGame(villageState()); const feedback = new EventOutcome(g);
    g.rng = scriptedRng([0]); g.events.startEvent(g.content.events.Room[5]);
    feedback.choose('wood100');
    expect(feedback.changes).toEqual([{ kind: 'stores', id: 'wood', amount: -100 }]);
  });
});
