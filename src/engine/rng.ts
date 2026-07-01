/**
 * Deterministic seeded RNG (mulberry32) so runs are replayable and
 * puzzle selection is testable. Never use Math.random() in the engine.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty array');
  return items[randInt(rng, items.length)]!;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Weighted pick; weights need not sum to 1. */
export function pickWeighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const e of items) {
    roll -= e.weight;
    if (roll <= 0) return e.item;
  }
  return items[items.length - 1]!.item;
}
