/**
 * The beat as three voices, each a flash that peaks exactly on its onset beat.
 * A voice rises over the r beats before its onset and falls after it, so the
 * brightest moment is on the beat, never after it. The intensity makes the
 * rise short and the fall steep.
 *
 * Positions are in beats from beat 1 of a bar: 0 is beat 1, 1 is beat 2.
 */

import type { Rng } from './rng';

export type VoiceName = 'kick' | 'snare' | 'crash';

export interface Voice {
  /** Where the first onset sits in the bar, in beats from beat 1. */
  onset: number;
  /** Beats from one onset to the next. */
  period: number;
  /** Beats from the onset to the end of its window. */
  length: number;
}

/** Kick on every beat, snare on beats 2 and 4, crash on beat 1: each a 1-beat window. */
export const VOICES: Readonly<Record<VoiceName, Voice>> = {
  kick: { onset: 0, period: 1, length: 1 },
  snare: { onset: 1, period: 2, length: 1 },
  crash: { onset: 0, period: 4, length: 1 },
};

export const VOICE_NAMES: readonly VoiceName[] = ['kick', 'snare', 'crash'];

/** Each pair is its value at intensity 0, then at 1. */
export interface Shape {
  /** Rise, in beats. */
  a0: number;
  a1: number;
  /** Fall power. */
  p0: number;
  p1: number;
}

export const DEFAULT_SHAPE: Readonly<Shape> = { a0: 0.165, a1: 0.045, p0: 1.7, p1: 5 };

/**
 * The longest rise the windows allow, in beats: the shortest window. A longer
 * rise would start before the onset ahead of it, inside that onset's fall.
 */
export const MAX_RISE = Math.min(...Object.values(VOICES).map((v) => v.length));

/**
 * The fall power's tuning span, for trying values far beyond the code's. It
 * stays above 0: at 0 the fall is flat and the peak leaves the onset.
 */
export const POWER_RANGE = [0.05, 20] as const;

/** The flash gain G an algorithm starts from, and a wide tuning span; below 0 the flash would darken. */
export const DEFAULT_GAIN = 1;
export const GAIN_RANGE = [0, 5] as const;

export type Amounts = Record<VoiceName, number>;

/** Each voice's strength A is drawn from this range when an instance starts. */
export const AMOUNT_RANGE = [0, 1] as const;

export function drawAmounts(rng: Rng): Amounts {
  return { kick: rng.range(...AMOUNT_RANGE), snare: rng.range(...AMOUNT_RANGE), crash: rng.range(...AMOUNT_RANGE) };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The rise r, in beats: long and soft at intensity 0, short at 1. */
export function rise(intensity: number, shape: Shape = DEFAULT_SHAPE): number {
  return shape.a0 + (shape.a1 - shape.a0) * clamp01(intensity);
}

/** The fall power p: gentle at intensity 0, steep at 1. */
export function fallPower(intensity: number, shape: Shape = DEFAULT_SHAPE): number {
  return shape.p0 + (shape.p1 - shape.p0) * clamp01(intensity);
}

/**
 * One window: t beats from the onset (negative before it), window length L.
 * Rises as smoothstep(-r, 0, t) before the onset, is 1 on it, and falls as
 * (1 - t / (L - r))^p to 0 at L - r, where the next window's rise can begin.
 */
export function windowEnvelope(t: number, length: number, r: number, p: number): number {
  if (t < 0) {
    if (r <= 0 || t < -r) return 0;
    const u = (t + r) / r;
    return u * u * (3 - 2 * u);
  }
  const fall = length - r;
  if (t === 0) return 1;
  if (t > fall) return 0;
  return (1 - t / fall) ** p;
}

/** A voice at a position in beats, from its nearest onset: the one before it, or the next one's rise. */
export function voiceEnvelope(voice: Voice, beats: number, r: number, p: number): number {
  const t = (((beats - voice.onset) % voice.period) + voice.period) % voice.period;
  return Math.max(windowEnvelope(t, voice.length, r, p), windowEnvelope(t - voice.period, voice.length, r, p));
}

export interface Flash {
  /** Each voice as intensity × amount × envelope. */
  voices: Amounts;
  /** Their sum, capped at 1. */
  total: number;
}

/** F = min(1, I·Σ A_v·e_v) at a position in beats. */
export function flash(beats: number, intensity: number, amounts: Amounts, shape: Shape = DEFAULT_SHAPE): Flash {
  const I = clamp01(intensity);
  const r = rise(I, shape);
  const p = fallPower(I, shape);
  const voices = { kick: 0, snare: 0, crash: 0 };
  let sum = 0;
  for (const name of VOICE_NAMES) {
    voices[name] = I * amounts[name] * voiceEnvelope(VOICES[name], beats, r, p);
    sum += voices[name];
  }
  return { voices, total: Math.min(1, sum) };
}

/** light = 1 + G·F: the existing light made brighter for a moment, never recoloured. */
export function light(total: number, gain: number): number {
  return 1 + gain * total;
}
