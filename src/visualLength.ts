/**
 * How long a visual runs: the panel's min and max, each one of BAR_LENGTHS bars. Every change draws its length from the
 * range, each length of it equally likely. The two never cross: moving one past the other moves the other with it.
 */

import type { Rng } from './rng';

export const BAR_LENGTHS = [1, 2, 4, 8, 16] as const;
export type BarLength = (typeof BAR_LENGTHS)[number];

export interface LengthRange {
  min: BarLength;
  max: BarLength;
}

export const DEFAULT_RANGE: Readonly<LengthRange> = { min: 2, max: 4 };

export function isBarLength(value: unknown): value is BarLength {
  return BAR_LENGTHS.some((l) => l === value);
}

/** The range after `which` is pressed to `value`: the other end moves along when `value` would cross it. */
export function pushRange(range: LengthRange, which: 'min' | 'max', value: BarLength): LengthRange {
  if (which === 'min') return { min: value, max: value > range.max ? value : range.max };
  return { min: value < range.min ? value : range.min, max: value };
}

/** The lengths a change can draw: every one of BAR_LENGTHS from min to max. */
export function lengthsIn(range: LengthRange): BarLength[] {
  return BAR_LENGTHS.filter((l) => l >= range.min && l <= range.max);
}

export function drawLength(rng: Rng, range: LengthRange): BarLength {
  return rng.pick(lengthsIn(range));
}
