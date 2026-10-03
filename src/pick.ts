/**
 * Fuzzy pick of the next algorithm. Every algorithm has one "home" intensity;
 * its weight is a bell around that home, so it falls smoothly with the distance
 * between home and slider, and it sits on a floor, so it never reaches zero:
 * a hard algorithm is rare at a soft setting, never impossible.
 */

import type { Rng } from './rng';

/** The weight far from home, as a share of the weight at home. */
export const WEIGHT_FLOOR = 0.04;
/** How wide the bell is: at this distance from home the bell has fallen to about 61%. */
export const WEIGHT_WIDTH = 0.22;

/** 1 at home, falling smoothly with the distance, never below WEIGHT_FLOOR. */
export function pickWeight(home: number, intensity: number): number {
  const d = (home - intensity) / WEIGHT_WIDTH;
  return WEIGHT_FLOOR + (1 - WEIGHT_FLOOR) * Math.exp(-0.5 * d * d);
}

/** The running algorithm's weight is multiplied by this: it comes back less often, never banned. */
export const RUNNING_WEIGHT = 0.25;

/**
 * One of `items`, drawn with the weights of their homes against `intensity`;
 * `running`, the one on screen now, if given, weighs RUNNING_WEIGHT as much.
 */
export function pickByIntensity<T extends { readonly home: number }>(
  items: readonly T[],
  intensity: number,
  rng: Rng,
  running?: T,
): T {
  const weights = items.map((item) => pickWeight(item.home, intensity) * (item === running ? RUNNING_WEIGHT : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
