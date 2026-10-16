import type { Game } from '../core/game';

export interface EconomyRow { id: string; stock: number; produced: number; consumed: number; net: number; forecast: number }
export interface Shortage { source: string; missing: Record<string, number> }

/** Read-only view: normalised rates plus the next ten income ticks in core source order. */
export function settlementEconomy(g: Game): { rows: EconomyRow[]; shortages: Shortage[] } {
  const inventory: Record<string, number> = { ...(g.store.get('stores') ?? {}) };
  const rows = new Map<string, EconomyRow>();
  const sources = Object.entries(g.store.get('income') ?? {}).flatMap(([id, value]) => {
    const inc = value as { stores?: Record<string, number>; delay?: number; timeLeft?: number };
    if (!inc.stores || !inc.delay || inc.delay <= 0) return [];
    for (const [key, amount] of Object.entries(inc.stores)) {
      // Keep discovered materials at zero so an unstaffed workshop does not disappear from the table.
      if (!amount && !Object.prototype.hasOwnProperty.call(inventory, key)) continue;
      const row = rows.get(key) ?? { id: key, stock: inventory[key] ?? 0, produced: 0, consumed: 0, net: 0, forecast: 0 };
      const rate = amount * 10 / inc.delay;
      if (rate > 0) row.produced += rate;
      else row.consumed -= rate;
      row.net += rate;
      rows.set(key, row);
    }
    return [{ id, stores: inc.stores, delay: inc.delay, left: inc.timeLeft ?? 0 }];
  });
  const blocked = new Map<string, Shortage>();
  if (g.active !== 'space') for (let tick = 0; tick < 10; tick++) {
    for (const source of sources) {
      if (--source.left > 0) continue;
      source.left = source.delay;
      const missing = Object.fromEntries(Object.entries(source.stores)
        .filter(([key, amount]) => amount < 0 && (inventory[key] ?? 0) + amount < 0)
        .map(([key, amount]) => [key, -amount - (inventory[key] ?? 0)]));
      if (source.id !== 'thieves' && Object.keys(missing).length) {
        if (!blocked.has(source.id)) blocked.set(source.id, { source: source.id, missing });
        continue;
      }
      for (const [key, amount] of Object.entries(source.stores)) inventory[key] = Math.max(0, (inventory[key] ?? 0) + amount);
    }
  }
  for (const row of rows.values()) row.forecast = (inventory[row.id] ?? 0) - row.stock;
  return { rows: [...rows.values()], shortages: [...blocked.values()] };
}
