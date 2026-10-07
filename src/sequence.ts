/**
 * When the running algorithm changes, and how. Pure: it reads the clock's beat
 * count and never a real clock.
 *
 * An algorithm runs for a phrase of 4, 8 or 16 bars, drawn at random, and the
 * change lands on beat 1 of the bar after the phrase. One bar before the change
 * the next algorithm is prepared and the change is decided: an abrupt cut on
 * beat 1, or a smooth fade that ends exactly on beat 1. At intensity 0 every
 * change fades over the whole last bar; the higher the intensity, the shorter
 * the fades (down to the last one or two beats) and the more cuts.
 *
 * When the tap clock starts a fresh count, the phrase is re-counted from the new
 * bar 1 with the bars it had left, rounded up to a phrase, so changes follow the
 * music the user taps to; a fade under way when that happens lands at once.
 */

import { BEATS_PER_BAR } from './clock';
import type { Rng } from './rng';

export const PHRASES = [4, 8, 16] as const;
export type Phrase = (typeof PHRASES)[number];

/** Share of changes that cut rather than fade, at intensity 0 and at 1: none at 0. */
export const CUT_SHARE_SOFT = 0;
export const CUT_SHARE_HARD = 0.85;
/** How many beats a fade takes at intensity 0: the whole last bar. At 1 it takes 1 or 2, drawn. */
export const FADE_BEATS_SOFT = BEATS_PER_BAR;

export interface Change {
  kind: 'cut' | 'fade';
  /** How many beats the fade takes: a bar at intensity 0, shortening to 1 or 2 at 1; 0 for a cut. */
  beats: number;
}

export interface Segment {
  /** The bar the phrase started on (0 is bar 1). */
  startBar: number;
  bars: Phrase;
}

export interface SequenceStep {
  /** True on the frame the next algorithm should be made, one bar before the change. */
  prepare: boolean;
  /** True on the frame the next algorithm takes over: beat 1 of the bar after the phrase. */
  change: boolean;
  /** How far the fade has gone, 0..1; 0 outside a fade, so only then are two algorithms drawn. */
  fade: number;
}

export function cutShare(intensity: number): number {
  const i = Math.min(1, Math.max(0, intensity));
  return CUT_SHARE_SOFT + (CUT_SHARE_HARD - CUT_SHARE_SOFT) * i;
}

export function drawChange(rng: Rng, intensity: number): Change {
  if (rng.next() < cutShare(intensity)) return { kind: 'cut', beats: 0 };
  const i = Math.min(1, Math.max(0, intensity));
  const hard = rng.next() < 0.5 ? 1 : 2;
  return { kind: 'fade', beats: FADE_BEATS_SOFT + (hard - FADE_BEATS_SOFT) * i };
}

/** The shortest phrase that holds `bars`. */
export function phraseFor(bars: number): Phrase {
  return PHRASES.find((p) => p >= bars) ?? 16;
}

export class Sequencer {
  private seg: Segment;
  private next: Change | undefined;
  private run: number | undefined;
  private lastBeats = 0;

  /** `hold`: never change; the algorithm that runs keeps running (an algorithm forced by name, for setting it up). */
  constructor(
    private readonly rng: Rng,
    startBar = 0,
    private held = false,
  ) {
    this.seg = { startBar, bars: rng.pick(PHRASES) };
  }

  get hold(): boolean {
    return this.held;
  }

  /** Stops changing at once: whatever was prepared is dropped, and the algorithm that runs keeps running. */
  engage(): void {
    this.held = true;
    this.next = undefined;
  }

  /** Starts changing again: a fresh phrase from the bar `beats` falls in, so the first change is a whole phrase away. */
  release(beats: number): void {
    this.held = false;
    this.next = undefined;
    this.run = undefined;
    this.lastBeats = beats;
    this.seg = { startBar: Math.floor(beats / BEATS_PER_BAR), bars: this.rng.pick(PHRASES) };
  }

  get segment(): Segment {
    return this.seg;
  }

  /** The change decided for the end of this phrase; undefined until it is prepared. */
  get change(): Change | undefined {
    return this.next;
  }

  /** Bars left before the change, counting the bar under way. */
  barsLeft(beats: number): number {
    if (this.held) return Infinity;
    return this.changeBar - Math.floor(beats / BEATS_PER_BAR);
  }

  private get changeBar(): number {
    return this.seg.startBar + this.seg.bars;
  }

  /** Call once a frame with the clock's beat count, its run and the intensity. */
  update(beats: number, run: number, intensity: number): SequenceStep {
    if (this.held) return { prepare: false, change: false, fade: 0 };
    const bar = Math.floor(beats / BEATS_PER_BAR);
    const fresh = this.run !== undefined && run !== this.run;
    const before = this.lastBeats;
    this.run = run;
    this.lastBeats = beats;
    if (fresh) {
      if (this.fadeAt(before) > 0) return this.land(bar, false);
      const left = Math.max(1, this.changeBar - Math.floor(before / BEATS_PER_BAR));
      this.seg = { startBar: bar, bars: phraseFor(left) };
    }

    let prepare = false;
    if (this.next === undefined && bar >= this.changeBar - 1) {
      this.next = drawChange(this.rng, intensity);
      prepare = true;
    }
    if (bar >= this.changeBar) return this.land(bar, prepare);
    return { prepare, change: false, fade: this.fadeAt(beats) };
  }

  private fadeAt(beats: number): number {
    if (this.next?.kind !== 'fade') return 0;
    const end = this.changeBar * BEATS_PER_BAR;
    return Math.min(1, Math.max(0, (beats - (end - this.next.beats)) / this.next.beats));
  }

  private land(bar: number, prepare: boolean): SequenceStep {
    this.seg = { startBar: bar, bars: this.rng.pick(PHRASES) };
    this.next = undefined;
    return { prepare, change: true, fade: 0 };
  }
}
