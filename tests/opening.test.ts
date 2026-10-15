import { describe, expect, it } from 'vitest';
import { OpeningProgress } from '../src/app/opening';
import { logHas, startGame } from './helpers';

describe('the continuous pixel-room opening', () => {
  it('reaches help and a renewable wood supply without travelling or reloading', () => {
    const g = startGame();
    const opening = new OpeningProgress(g);
    g.room.tendFire();
    for (let i = 0; i < 120; i++) {
      g.tick(1000);
      opening.update();
    }
    expect(g.room.builderLevel).toBe(3);
    g.tick(11_000);
    opening.update();
    expect(g.room.builderLevel).toBe(3);
    g.tick(1000);
    opening.update();
    expect(g.active).toBe('room');
    expect(g.room.builderLevel).toBe(4);
    expect(logHas(g, 'she builds things')).toBe(true);
    const wood = g.store.num('stores.wood');
    g.tick(10_000);
    expect(g.store.num('stores.wood')).toBe(wood + 2);
    const messages = g.notifications.texts().filter(t => t.includes('she builds things')).length;
    opening.update();
    g.room.offerHelp();
    g.room.onArrival();
    expect(g.notifications.texts().filter(t => t.includes('she builds things'))).toHaveLength(messages);
  });

  it('waits for warmth again if the room becomes cold during recovery', () => {
    const g = startGame();
    const opening = new OpeningProgress(g);
    g.store.set('game.builder.level', 3);
    g.store.set('game.temperature.value', 3);
    opening.update();
    g.tick(11_000);
    g.store.set('game.temperature.value', 1);
    opening.update();
    g.tick(2000);
    opening.update();
    expect(g.room.builderLevel).toBe(3);
    g.store.set('game.temperature.value', 3);
    opening.update();
    g.tick(11_000);
    opening.update();
    expect(g.room.builderLevel).toBe(3);
    g.tick(1000);
    opening.update();
    expect(g.room.builderLevel).toBe(4);
  });
});
