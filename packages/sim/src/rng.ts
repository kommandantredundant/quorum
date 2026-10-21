/** Seeded random numbers (mulberry32) so every simulation run is reproducible. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    /** Weighted sampling without replacement. */
    sample: <T extends { activity: number }>(pool: readonly T[], k: number): T[] => {
      const items = [...pool];
      const out: T[] = [];
      while (out.length < k && items.length > 0) {
        const total = items.reduce((s, u) => s + u.activity, 0);
        let x = next() * total;
        let i = 0;
        while (i < items.length - 1 && x >= (items[i] as T).activity) {
          x -= (items[i] as T).activity;
          i++;
        }
        out.push(items.splice(i, 1)[0] as T);
      }
      return out;
    },
  };
}
export type Rng = ReturnType<typeof createRng>;
