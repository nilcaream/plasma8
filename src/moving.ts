/**
 * Moving values: for an algorithm that lists its knobs in groups, an instance
 * picks a few groups at random and one value from each; those values stop
 * having a single drawn number and move inside a sub-range of their bounds,
 * by the harmonics (src/harmonics.ts), every frame. Every other value stays as
 * it was drawn.
 */

import { drawHarmonic, harmonicRange, harmonicValue, type HarmonicDraw } from './harmonics';
import type { Rng } from './rng';

/** How many groups an instance moves a value in: this many to this many, drawn once at start. */
export const MOVING_COUNT = [2, 5] as const;

/** One value that moves: its key, its outer bounds and its harmonics draw. */
export interface MovingValue {
  key: string;
  lo: number;
  hi: number;
  draw: HarmonicDraw;
}

/** N in MOVING_COUNT (at most the number of groups) different groups, one value from each; each value's harmonics draw. */
export function drawMoving(
  groups: readonly (readonly string[])[],
  bounds: (key: string) => readonly [number, number],
  rng: Rng,
): MovingValue[] {
  const [least, most] = MOVING_COUNT;
  const n = Math.min(groups.length, least + Math.floor(rng.next() * (most - least + 1)));
  const rest = [...groups];
  const out: MovingValue[] = [];
  for (let i = 0; i < n; i++) {
    const group = rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!;
    const key = rng.pick(group);
    const [lo, hi] = bounds(key);
    out.push({ key, lo, hi, draw: drawHarmonic(rng) });
  }
  return out;
}

/** The sub-range a moving value moves in. */
export const movingRange = (m: MovingValue): { min: number; max: number } => harmonicRange(m.draw, m.lo, m.hi);

/** A moving value now. */
export const movingAt = (m: MovingValue, intensity: number, beats: number): number =>
  harmonicValue(m.draw, m.lo, m.hi, intensity, beats);

/** Every moving value now, by key. */
export function movingValues(moving: readonly MovingValue[], intensity: number, beats: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moving) out[m.key] = movingAt(m, intensity, beats);
  return out;
}
