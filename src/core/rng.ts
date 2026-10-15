/** Random source. Seedable so rule tests are deterministic. */
export interface Rng {
  /** uniform in [0, 1) */
  random(): number;
}

export const mathRng: Rng = { random: () => Math.random() };

/** mulberry32: tiny, fast, good enough for gameplay rolls */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    random() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}

/** Rng that replays a fixed list of values (cycling), for pinpoint tests. */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  return { random: () => values[i++ % values.length] };
}
