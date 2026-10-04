/**
 * Beat-locked harmonics for an algorithm's free parameters. A free parameter
 * moves as a weighted mix of four layers, each a smooth curve through a random
 * point on every 8, 4, 2 or 1 beats. At intensity 0 the slow layers lead, so it
 * drifts; as the intensity rises, the faster layers take a larger share. The
 * range the parameter moves in is the same at every intensity: the intensity
 * changes only how fast it moves.
 *
 * Everything here is a pure function of a seed and a position in beats, so any
 * moment can be read without stepping through the ones before it.
 */

import type { Rng } from './rng';

/** Each layer's period in beats: 2 bars, 1 bar, half a bar, one beat. */
export const PERIODS = [8, 4, 2, 1] as const;

export const LAYERS = PERIODS.length;

/** How much each step to a faster layer weighs less at intensity 0. */
export const DAMPING = 4;

/**
 * The damping's tuning span, for trying values far beyond the code's. Above 1
 * the slow layers lead at intensity 0; at 1 all layers weigh their f; below 1
 * the fast ones lead. It stays above 0, where a power of the base is defined.
 */
export const DAMPING_RANGE = [0.1, 16] as const;

/** The draw's ranges: f_0 so the 2-bar layer leads at intensity 0, then f_1..f_3, the width share and the offset share. */
export const FACTOR_RANGES = [[0.5, 1], [0, 1], [0, 1], [0, 1]] as const;
export const WIDTH_SHARE_RANGE = [0.25, 0.6] as const;
export const OFFSET_RANGE = [0, 1] as const;

/** One parameter's draw: its share of the outer bounds and its layer factors. */
export interface HarmonicDraw {
  /** The seed of the layers' points. */
  seed: number;
  /** The width of [min, max] as a share of the outer bounds' width, in [0.25, 0.6). */
  widthShare: number;
  /** Where [min, max] sits in the room left over, from 0 (at L) to 1 (at H). */
  offsetShare: number;
  /** f_0 in [0.5, 1) so the 2-bar layer leads at intensity 0; f_1..f_3 in [0, 1). */
  factors: number[];
}

/** A 32-bit hash of the seed, the layer and the point's index. */
function hash(seed: number, layer: number, index: number): number {
  let h = (seed ^ Math.imul(layer + 1, 0x9e3779b1) ^ Math.imul(index, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Layer k's point at its n-th line (t = n·T_k beats), in [-1, 1). */
export function layerPoint(seed: number, layer: number, index: number): number {
  return (hash(seed, layer, index) / 4294967296) * 2 - 1;
}

/**
 * Layer k at a position in beats: a Catmull-Rom curve that passes through each
 * of its points on its line, with no jump in velocity at any of them. It can
 * overshoot [-1, 1] a little between points.
 */
export function layer(seed: number, k: number, beats: number): number {
  const period = PERIODS[k]!;
  const x = beats / period;
  const n = Math.floor(x);
  const u = x - n;
  const p0 = layerPoint(seed, k, n - 1);
  const p1 = layerPoint(seed, k, n);
  const p2 = layerPoint(seed, k, n + 1);
  const p3 = layerPoint(seed, k, n + 2);
  return 0.5 * (2 * p1
    + (p2 - p0) * u
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
    + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** w_k = f_k · 4^(-k·(1 - I)): the faster layers damped at intensity 0, all at f_k at 1. */
export function weights(factors: readonly number[], intensity: number, damping = DAMPING): number[] {
  const calm = 1 - clamp01(intensity);
  return factors.map((f, k) => f * damping ** (-k * calm));
}

/** u = Σ w_k s_k / Σ w_k: the layers' weighted mean, in about [-1, 1]. 0 when no layer has weight. */
export function mix(seed: number, factors: readonly number[], intensity: number, beats: number, damping = DAMPING): number {
  const w = weights(factors, intensity, damping);
  let sum = 0, total = 0;
  for (let k = 0; k < LAYERS; k++) {
    const wk = w[k] ?? 0;
    if (wk === 0) continue;
    sum += wk * layer(seed, k, beats);
    total += wk;
  }
  return total > 0 ? sum / total : 0;
}

/** Draw one parameter's range shares, factors and seed. */
export function drawHarmonic(rng: Rng): HarmonicDraw {
  return {
    seed: Math.floor(rng.next() * 4294967296) >>> 0,
    widthShare: rng.range(...WIDTH_SHARE_RANGE),
    offsetShare: rng.range(...OFFSET_RANGE),
    factors: FACTOR_RANGES.map(([min, max]) => rng.range(min, max)),
  };
}

/** [min, max] inside the outer bounds [lo, hi]: width = (H - L)·share, min = L + offset·((H - L) - width). */
export function harmonicRange(draw: HarmonicDraw, lo: number, hi: number): { min: number; max: number } {
  const width = (hi - lo) * draw.widthShare;
  const min = lo + draw.offsetShare * (hi - lo - width);
  return { min, max: min + width };
}

/** The parameter's value: mid + half·u, clamped to [min, max]. */
export function harmonicValue(draw: HarmonicDraw, lo: number, hi: number, intensity: number, beats: number, damping = DAMPING): number {
  const { min, max } = harmonicRange(draw, lo, hi);
  const u = mix(draw.seed, draw.factors, intensity, beats, damping);
  return Math.min(max, Math.max(min, (min + max) / 2 + ((max - min) / 2) * u));
}
