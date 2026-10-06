/**
 * Moving values: for an algorithm that lists its knobs in groups, an instance
 * picks a few groups at random and one value from each; those values stop
 * having a single drawn number and move inside a sub-range of their bounds,
 * pushed between the edges of a band by one beat voice (src/crossfader.ts),
 * every frame. Every other value stays as it was drawn.
 */

import { VOICE_NAMES, type VoiceName } from './beatVoices';
import { TRAVEL_AT_0, TRAVEL_AT_1, crossfade, drawRange } from './crossfader';
import type { Rng } from './rng';

/** How many groups an instance moves a value in: this many to this many, drawn once at start. */
export const MOVING_COUNT = [2, 5] as const;

/** One value that moves: its key, its outer bounds, the sub-range it moves in and the voice that pushes it. */
export interface MovingValue {
  key: string;
  lo: number;
  hi: number;
  min: number;
  max: number;
  voice: VoiceName;
}

/**
 * A group of values that change one thing on screen: each entry is a value or a
 * pair (or more) that moves together, and an instance moves one entry of it.
 */
export type MovingGroup = readonly (string | readonly string[])[];

/** N in `count` (at most the number of groups) different groups, one entry from each; each of its values gets its own sub-range and its own voice. */
export function drawMoving(
  groups: readonly MovingGroup[],
  bounds: (key: string) => readonly [number, number],
  rng: Rng,
  count: readonly [number, number] = MOVING_COUNT,
): MovingValue[] {
  const [least, most] = count;
  const n = Math.min(groups.length, least + Math.floor(rng.next() * (most - least + 1)));
  const rest = [...groups];
  const out: MovingValue[] = [];
  for (let i = 0; i < n; i++) {
    const group = rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!;
    const entry = rng.pick(group);
    for (const key of typeof entry === 'string' ? [entry] : entry) {
      const [lo, hi] = bounds(key);
      const { min, max } = drawRange(rng, lo, hi);
      out.push({ key, lo, hi, min, max, voice: rng.pick(VOICE_NAMES) });
    }
  }
  return out;
}

/** The sub-range a moving value moves in. */
export const movingRange = (m: MovingValue): { min: number; max: number } => ({ min: m.min, max: m.max });

/** A moving value now. */
export const movingAt = (m: MovingValue, intensity: number, beats: number): number =>
  crossfade(beats, { min: m.min, max: m.max, intensity, voice: m.voice, travel0: TRAVEL_AT_0, travel1: TRAVEL_AT_1 });

/** Every moving value now, by key. */
export function movingValues(moving: readonly MovingValue[], intensity: number, beats: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moving) out[m.key] = movingAt(m, intensity, beats);
  return out;
}
