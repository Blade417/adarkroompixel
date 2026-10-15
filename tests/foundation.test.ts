import { describe, expect, it } from 'vitest';
import { Clock, Store, parsePath } from '../src/core';

describe('Store (port of StateManager)', () => {
  it('parses every path style used by the original and its content', () => {
    expect(parsePath('game.buildings["hut"]')).toEqual(['game', 'buildings', 'hut']);
    expect(parsePath("stores['alien alloy']")).toEqual(['stores', 'alien alloy']);
    expect(parsePath('outfit[cured meat]')).toEqual(['outfit', 'cured meat']);
    expect(parsePath('wait.Room[4].scenes.wood100.action')).toEqual(['wait', 'Room', '4', 'scenes', 'wood100', 'action']);
  });

  it('creates parents, clamps stores at 0 and caps values', () => {
    const s = new Store();
    s.set('stores["iron"]', 5);
    expect(s.get('stores.iron')).toBe(5);
    s.add('stores.iron', -10);
    expect(s.get('stores.iron')).toBe(0);
    s.set('game.population', 1e20);
    expect(s.get('game.population')).toBe(99999999999999);
  });

  it('get with requestZero returns 0 for missing / falsy', () => {
    const s = new Store();
    expect(s.get('stores.wood')).toBeUndefined();
    expect(s.get('stores.wood', true)).toBe(0);
    expect(s.get('a.b.c.d', true)).toBe(0);
  });

  it('publishes updates with the category, except silent writes', () => {
    const s = new Store();
    const seen: string[] = [];
    s.subscribe((e) => seen.push(`${e.category}|${e.stateName}`));
    s.set('stores.wood', 1);
    s.set('stores.fur', 1, true);
    s.addM('stores', { wood: 2, fur: 3 });
    expect(seen).toEqual(['stores|stores.wood', 'stores|stores']);
    expect(s.get('stores')).toEqual({ wood: 3, fur: 4 });
  });

  it('removeBranch drops empty objects only', () => {
    const s = new Store({ wait: { Room: { 4: { scenes: {} } }, keep: { x: 1 } } });
    s.removeBranch('wait', true);
    expect(s.get('wait')).toEqual({ keep: { x: 1 } });
  });
});

describe('Clock', () => {
  it('fires timers in time order, including ones scheduled during advance', () => {
    const c = new Clock();
    const log: string[] = [];
    c.setTimeout(() => {
      log.push('a@' + c.now);
      c.setTimeout(() => log.push('c@' + c.now), 50);
    }, 100);
    c.setTimeout(() => log.push('b@' + c.now), 120);
    c.advance(200);
    expect(log).toEqual(['a@100', 'b@120', 'c@150']);
    expect(c.now).toBe(200);
  });

  it('intervals repeat and can be cleared', () => {
    const c = new Clock();
    let n = 0;
    const id = c.setInterval(() => n++, 100);
    c.advance(350);
    expect(n).toBe(3);
    c.clear(id);
    c.advance(1000);
    expect(n).toBe(3);
  });

  it('hyper mode halves durations unless exact', () => {
    const c = new Clock();
    c.hyper = true;
    const a = c.setTimeout(() => {}, 1000);
    const b = c.setTimeout(() => {}, 1000, true);
    expect(c.remaining(a)).toBe(500);
    expect(c.remaining(b)).toBe(1000);
  });
});
