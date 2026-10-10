/**
 * The random walk: a free parameter that wanders through its whole range, one
 * step on every hit of a beat voice. Like the crossfader (src/crossfader.ts)
 * it holds a value, travels in a short smooth stroke that lands exactly on the
 * next hit, and holds again; but instead of alternating between two edges of a
 * band, every hit picks up or down at random and goes one fixed step that way,
 * so the value drifts about like a fixed-step Brownian motion. The intensity
 * sets only the length of the step: range · stepAt1 · I^power, none at 0, and
 * every hit adds up to a tenth to it at random so the flow is less predictable.
 * Every step is a whole step: one that would leave the range goes the other
 * way instead, so none is cut short at an edge.
 *
 * The walk is kept as a unit position, 0 at min and 1 at max, so a range moved
 * while it runs carries the path with it. Positions are in beats from beat 1 of
 * bar 1, as in the crossfader.
 */

import { VOICES, type VoiceName } from './beatVoices';
import { hitTime, stroke, travelFor, type Crossfader } from './crossfader';
import type { Rng } from './rng';

/** The step at intensity 1 as a share of the range: what the code starts with, and the span the page tries. */
export const STEP_AT_1 = 0.2;
/** The most a hit adds to its step, as a share of it: drawn fresh for every hit. */
export const STEP_EXTRA = 0.1;
/** The top is where a step with its extra, 0.45 · 1.1, is still under half the range, so one direction always fits. */
export const STEP_AT_1_RANGE = [0.01, 0.45] as const;

export interface WalkParams extends Crossfader {
  /** The step at intensity 1, as a share of the range. */
  stepAt1: number;
}

/** A value on a hit of the voice: where the walk is after hit n, and the beats the stroke into it took. */
export interface Hit {
  n: number;
  time: number;
  /** Unit position, 0 at min and 1 at max. */
  u: number;
  length: number;
}

/** The step as a share of the range: stepAt1 · I^power, with I kept in 0..1. */
export function stepOf(p: Pick<WalkParams, 'intensity' | 'power' | 'stepAt1'>): number {
  return p.stepAt1 * Math.min(1, Math.max(0, p.intensity)) ** p.power;
}

/** Where a whole step in a direction from `u` lands: the other way when that direction would leave 0..1. */
export function stepFrom(u: number, dir: 1 | -1, step: number): { u: number; dir: 1 | -1 } {
  const to = u + dir * step;
  if (to >= 0 && to <= 1) return { u: to, dir };
  return { u: u - dir * step, dir: dir === 1 ? -1 : 1 };
}

/** How long a past hit is kept: the long graph shows 64 bars (256 beats), and the one before it. */
const KEEP_BEATS = 600;

export class RandomWalk {
  /** Every hit since the walk started on this voice, one after the other. */
  readonly history: Hit[] = [];
  private u: number;
  private dir: 1 | -1;
  private extra: number;
  private voice: VoiceName | undefined;

  /** Starts at a random point of the range, drawn from `rng`, which also draws the direction and the extra of every step after it. */
  constructor(private readonly rng: Rng) {
    this.u = rng.next();
    this.dir = this.draw();
    this.extra = this.rng.next() * STEP_EXTRA;
  }

  private draw(): 1 | -1 {
    return this.rng.next() < 0.5 ? -1 : 1;
  }

  /** The direction drawn for the next step: 1 up, -1 down, drawn when the last hit passed (the step may still go the other way at an edge). */
  get direction(): 1 | -1 {
    return this.dir;
  }

  /** The next step as a share of the range, at the intensity now: its length by intensity and the extra drawn for it. */
  step(p: WalkParams): number {
    return stepOf(p) * (1 + this.extra);
  }

  /** Where the next hit puts the walk and which way it goes, at the intensity now (it can still change before the hit). */
  next(p: WalkParams): { u: number; dir: 1 | -1 } {
    return stepFrom(this.u, this.dir, this.step(p));
  }

  /** Where the next hit puts the walk. */
  target(p: WalkParams): number {
    return this.next(p).u;
  }

  /** Takes every hit up to `beats`, one step each at the intensity now; a new voice or a count started again begins at the walk's place. */
  advance(beats: number, p: WalkParams): void {
    const v = VOICES[p.voice];
    const n = Math.floor((beats - v.onset) / v.period);
    const last = this.history[this.history.length - 1];
    if (!last || this.voice !== p.voice || n < last.n) {
      this.voice = p.voice;
      this.history.length = 0;
      this.history.push({ n, time: hitTime(p.voice, n), u: this.u, length: 0 });
      return;
    }
    for (let hit = last.n + 1; hit <= n; hit++) {
      this.u = this.target(p);
      this.dir = this.draw();
      this.extra = this.rng.next() * STEP_EXTRA;
      this.history.push({ n: hit, time: hitTime(p.voice, hit), u: this.u, length: travelFor(p) });
    }
    while (this.history.length > 1 && this.history[0]!.time < beats - KEEP_BEATS) this.history.shift();
  }

  /**
   * The stroke the walk is in at `beats`, as unit positions: it rests at `from` after the last hit, travels to `to`, and lands
   * there on the next hit; `x` is the share of the travel done, before easing. Undefined before the first hit taken. Call `advance` first.
   */
  strokeAt(beats: number, p: WalkParams): { from: number; to: number; x: number } | undefined {
    const first = this.history[0];
    if (!first || beats < first.time || this.voice !== p.voice) return undefined;
    const v = VOICES[p.voice];
    const n = Math.floor((beats - v.onset) / v.period);
    const at = this.history[n - first.n];
    if (!at) return undefined;
    const next = this.history[n - first.n + 1];
    const to = next ? next.u : this.target(p);
    const length = next ? next.length : travelFor(p);
    const arrive = hitTime(p.voice, n + 1);
    const x = length > 0 ? Math.min(1, Math.max(0, (beats - (arrive - length)) / length)) : 0;
    return { from: at.u, to, x };
  }

  /** The unit position at `beats`, from the hits taken: undefined before the first of them. Call `advance` first. */
  read(beats: number, p: WalkParams): number | undefined {
    const s = this.strokeAt(beats, p);
    return s && s.from + (s.to - s.from) * stroke(s.x);
  }

  /** The parameter's value at `beats`, in min..max. */
  at(beats: number, p: WalkParams): number {
    this.advance(beats, p);
    const u = this.read(beats, p) ?? this.u;
    return p.min + u * (p.max - p.min);
  }
}
