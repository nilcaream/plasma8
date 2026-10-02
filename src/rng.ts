/** Seeded random numbers: the same seed always draws the same sequence. */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** One of the items, uniformly. */
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: a small, fast 32-bit generator; plenty for picking visuals. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
}

/** A fresh 32-bit seed for this load. */
export function freshSeed(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]!;
}

export function formatSeed(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, '0');
}
