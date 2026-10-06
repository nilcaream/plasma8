/**
 * The crossfader: one free parameter that sits on one edge of a band and is
 * pushed to the other edge by a beat voice, like a DJ's slider. The band is
 * the instance's range narrowed round its middle by the intensity. The voice's
 * hits alternate between the edges by their place in the pattern, and the
 * value is almost a square wave: it holds an edge, then travels in a short
 * smooth stroke that arrives exactly on the next hit.
 *
 * Positions are in beats from beat 1 of bar 1: 0 is beat 1, 1 is beat 2.
 */

import { VOICES, type VoiceName } from './beatVoices';
import { OFFSET_RANGE, WIDTH_SHARE_RANGE } from './harmonics';
import type { Rng } from './rng';

export type Edge = 'low' | 'high';

/**
 * Beats a stroke takes at intensity 0 and at 1 (a straight line between), and
 * the span the page tries; a stroke never outlasts the beats between two hits.
 * Over a whole gap the stroke is close to a sine, so the low end can be dialled
 * from a flick to a sine.
 */
export const TRAVEL_AT_0 = 0.75;
export const TRAVEL_AT_1 = 0.125;
export const MIN_TRAVEL = 0.01;
export const MAX_TRAVEL = Math.min(...Object.values(VOICES).map((v) => v.period));
export const TRAVEL_RANGE = [MIN_TRAVEL, MAX_TRAVEL] as const;

export interface Crossfader {
  /** The instance's range. */
  min: number;
  max: number;
  /** 0 holds the middle, 1 uses the whole range. */
  intensity: number;
  voice: VoiceName;
  /** Beats a stroke takes at intensity 0 and at 1, ending on the hit. */
  travel0: number;
  travel1: number;
}

/** The stroke's length in beats: travel0 + (travel1 − travel0)·I, cut to the beats between two hits of the voice. */
export function travelFor(p: Crossfader): number {
  const i = Math.min(1, Math.max(0, p.intensity));
  return Math.min(Math.max(p.travel0 + (p.travel1 - p.travel0) * i, 0), VOICES[p.voice].period);
}

/** The band's two edges: mid ± intensity · half. */
export function bandOf(min: number, max: number, intensity: number): { low: number; high: number } {
  const mid = (min + max) / 2;
  const reach = ((max - min) / 2) * Math.min(1, Math.max(0, intensity));
  return { low: mid - reach, high: mid + reach };
}

/**
 * The edge a voice's first onset (hit 0) puts the value on. Bars count from 1,
 * so the crash's hit 0 is beat 1 of bar 1, an odd bar: high.
 */
const FIRST_EDGE: Readonly<Record<VoiceName, Edge>> = { kick: 'low', snare: 'low', crash: 'high' };

/** Hit n of a voice (n = 0 is its first onset in the pattern, counting on without end and back before it) sits on this edge: even hits on the first edge, odd ones on the other. */
export function edgeOf(voice: VoiceName, n: number): Edge {
  const first = FIRST_EDGE[voice];
  return Math.abs(n) % 2 === 0 ? first : first === 'low' ? 'high' : 'low';
}

/** Where hit n of a voice falls, in beats. */
export const hitTime = (voice: VoiceName, n: number): number => VOICES[voice].onset + n * VOICES[voice].period;

/** The smooth stroke: 0 to 1, flat at both ends. */
export const stroke = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export interface CrossfaderState {
  value: number;
  low: number;
  high: number;
  /** The hit that last happened and the one coming, with the edge each puts the value on. */
  last: { n: number; time: number; edge: Edge };
  next: { n: number; time: number; edge: Edge };
  /** How far the stroke to the next hit has got, 0 while it holds. */
  progress: number;
}

export function crossfaderState(beats: number, p: Crossfader): CrossfaderState {
  const v = VOICES[p.voice];
  const { low, high } = bandOf(p.min, p.max, p.intensity);
  const n = Math.floor((beats - v.onset) / v.period);
  const last = { n, time: hitTime(p.voice, n), edge: edgeOf(p.voice, n) };
  const next = { n: n + 1, time: hitTime(p.voice, n + 1), edge: edgeOf(p.voice, n + 1) };
  const length = travelFor(p);
  const progress = length > 0 ? Math.min(1, Math.max(0, (beats - (next.time - length)) / length)) : 0;
  const from = last.edge === 'low' ? low : high;
  const to = next.edge === 'low' ? low : high;
  return { value: from + (to - from) * stroke(progress), low, high, last, next, progress };
}

/** The parameter's value at `beats`. */
export const crossfade = (beats: number, p: Crossfader): number => crossfaderState(beats, p).value;

/** An instance's range, drawn inside the algorithm's outer bounds [lo, hi] the way the harmonics' range is. */
export function drawRange(rng: Rng, lo: number, hi: number): { min: number; max: number } {
  const width = (hi - lo) * rng.range(...WIDTH_SHARE_RANGE);
  const min = lo + rng.range(...OFFSET_RANGE) * (hi - lo - width);
  return { min, max: min + width };
}
