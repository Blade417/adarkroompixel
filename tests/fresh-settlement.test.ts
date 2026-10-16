import { describe, expect, it } from 'vitest';
import { playFreshSettlement } from './support/fresh-settlement';

describe('fresh settlement progression with reduced gathering', () => {
  it('reaches early expedition supplies through legal actions without injected resources', () => {
    const { result } = playFreshSettlement();
    console.info('Fresh settlement checkpoints:', JSON.stringify(result));
    expect(result.completed, `Stopped at ${result.goal}`).toBe(true);
    expect(result.checkpoints.forest).toBe(45);
    expect(result.checkpoints.cart).toBeGreaterThan(result.checkpoints.builder);
    expect(result.checkpoints.workshop).toBeGreaterThan(result.checkpoints.tannery);
    expect(result.stores['cured meat']).toBeGreaterThanOrEqual(10);
    expect(result.huts).toBeLessThan(20);
    expect(result.events.length).toBeGreaterThan(0);
    expect(Object.values(result.stores).every(n => typeof n !== 'number' || n >= 0)).toBe(true);
  });
});
