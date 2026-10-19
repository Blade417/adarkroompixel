import { describe, expect, it } from 'vitest';
import { playFreshSettlement } from './support/fresh-settlement';

describe('fresh settlement progression with reduced gathering', () => {
  it.each([42,7,99])('survives repeated save/reload milestones from an empty start (seed %s)', seed => {
    const { result } = playFreshSettlement(seed,10800,['forest','builder','cart','hut','lodge','workshop','compass']);
    expect(result.completed, `Stopped at ${result.goal}`).toBe(true);
    expect(result.reloads.map(entry => entry.milestone)).toEqual(expect.arrayContaining(['forest','builder','cart','hut','lodge','workshop','compass']));
    expect(result.stores['cured meat']).toBeGreaterThanOrEqual(10);
    expect(Object.values(result.stores).every(n => typeof n !== 'number' || n >= 0)).toBe(true);
  });
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
