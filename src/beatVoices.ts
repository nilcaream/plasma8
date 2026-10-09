/**
 * The beat as three voices, each a flash that peaks exactly on its onset beat.
 * A voice rises over the r beats before its onset and falls after it, so the
 * brightest moment is on the beat, never after it. The strobe level S (the
 * Strobe slider, never the intensity) makes the rise short and the fall steep.
 *
 * Positions are in beats from beat 1 of a bar: 0 is beat 1, 1 is beat 2.
 */

import { range, type Knob, type Values } from './knobs';
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

/** Each pair is its value at strobe 0, then at 1. */
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

/** The voices' strengths as an algorithm's random knobs, drawn from AMOUNT_RANGE: `A.kick`, `A.snare`, `A.crash`. */
export const amountKnobs = (): Knob[] => VOICE_NAMES.map((name) => range(`A.${name}`, ...AMOUNT_RANGE, AMOUNT_RANGE));

/** The strengths out of an algorithm's knob values. */
export const amountsOf = (v: Values): Amounts => ({ kick: v['A.kick']!, snare: v['A.snare']!, crash: v['A.crash']! });

/** The strengths divided by the largest, so the strongest voice flashes at exactly the strobe level and the others keep their proportions; all 0 stays 0. */
export function relativeAmountsOf(v: Values): Amounts {
  const a = amountsOf(v);
  const top = Math.max(a.kick, a.snare, a.crash);
  if (top <= 0) return { kick: 0, snare: 0, crash: 0 };
  return { kick: a.kick / top, snare: a.snare / top, crash: a.crash / top };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The rise r, in beats: long and soft at strobe 0, short at 1. */
export function rise(strobe: number, shape: Shape = DEFAULT_SHAPE): number {
  return shape.a0 + (shape.a1 - shape.a0) * clamp01(strobe);
}

/** The fall power p: gentle at strobe 0, steep at 1. */
export function fallPower(strobe: number, shape: Shape = DEFAULT_SHAPE): number {
  return shape.p0 + (shape.p1 - shape.p0) * clamp01(strobe);
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

/**
 * A voice at a position in beats, from its nearest onset: the one before it, or the next one's rise.
 */
export function voiceEnvelope(voice: Voice, beats: number, r: number, p: number): number {
  const n = Math.floor((beats - voice.onset) / voice.period);
  let e = 0;
  for (const k of [n, n + 1]) {
    const at = voice.onset + k * voice.period;
    e = Math.max(e, windowEnvelope(beats - at, voice.length, r, p));
  }
  return e;
}

/**
 * Flashes on the beat grid are at least this far apart: the fastest tempo, 180 BPM, is exactly this,
 * so any 4 of them span a second or more. The limiter (src/flashLimit.ts) keeps it true when a tap moves the grid.
 */
export const MIN_FLASH_GAP_S = 1 / 3;
/** At most this many strong flashes in any one second (WCAG 2.3.1). */
export const MAX_FLASHES_PER_S = 3;

export interface Flash {
  /** Each voice as strobe × amount × envelope. */
  voices: Amounts;
  /** Their sum, capped at 1. */
  total: number;
}

/** F = min(1, S·Σ A_v·e_v) at a position in beats, S the strobe level (the Strobe slider; the intensity is not in it). */
export function flash(beats: number, strobe: number, amounts: Amounts, shape: Shape = DEFAULT_SHAPE): Flash {
  const S = clamp01(strobe);
  const r = rise(S, shape);
  const p = fallPower(S, shape);
  const voices = { kick: 0, snare: 0, crash: 0 };
  let sum = 0;
  for (const name of VOICE_NAMES) {
    voices[name] = S * amounts[name] * voiceEnvelope(VOICES[name], beats, r, p);
    sum += voices[name];
  }
  return { voices, total: Math.min(1, sum) };
}

/** light = 1 + G·F: the existing light made brighter for a moment, never recoloured. */
export function light(total: number, gain: number): number {
  return 1 + gain * total;
}
