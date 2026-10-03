import type { Rng } from './rng';

/**
 * Where the far end of the tunnel sits on screen, in the shaders' uv units (y
 * from -0.5 to 0.5, 0 the centre). On every swing beat it picks a new spot and
 * glides there from wherever it is, so it never jumps, even when a tap
 * re-aligns the beat. The intensity sets how far it reaches and how quickly it
 * glides: soft, a short slow drift; hard, a wide quick swing.
 */

/** kick: every beat; snare: beats 2 and 4. */
export type SwingBeat = 'kick' | 'snare';

/** How far from the centre a new spot may be, at intensity 0 and 1. */
export const REACH_SOFT = 0.04;
export const REACH_HARD = 0.26;
/** The share of the time between two swings the glide takes, at intensity 0 and 1. */
export const GLIDE_SOFT = 0.9;
export const GLIDE_HARD = 0.25;

export type Point = readonly [number, number];

export function reach(intensity: number): number {
  return REACH_SOFT + (REACH_HARD - REACH_SOFT) * intensity;
}

/** Counts swings: steps up by one on every swing beat. */
export function swingIndex(beat: SwingBeat, beats: number): number {
  return beat === 'kick' ? Math.floor(beats) : Math.floor((beats - 1) / 2);
}

export class Swing {
  private from: Point = [0, 0];
  private to: Point = [0, 0];
  private shown: Point = [0, 0];
  private start = 0;
  private glide = 1;
  private index: number | undefined;

  constructor(
    private readonly rng: Rng,
    readonly beat: SwingBeat,
  ) {}

  /** Call once a frame with the clock's beat count; returns where the far end is now. */
  update(beats: number, intensity: number): Point {
    const index = swingIndex(this.beat, beats);
    if (this.index !== undefined && index !== this.index) {
      // from the spot last shown: the beat count may have jumped since
      this.from = this.shown;
      const angle = this.rng.next() * 2 * Math.PI;
      const r = reach(intensity) * (0.5 + 0.5 * this.rng.next());
      this.to = [r * Math.cos(angle), r * Math.sin(angle)];
      this.start = beats;
      const period = this.beat === 'kick' ? 1 : 2;
      this.glide = period * (GLIDE_SOFT + (GLIDE_HARD - GLIDE_SOFT) * intensity);
    }
    this.index = index;
    return (this.shown = this.at(beats));
  }

  private at(beats: number): Point {
    const s = Math.min(1, Math.max(0, (beats - this.start) / this.glide));
    const e = s * s * (3 - 2 * s);
    return [this.from[0] + (this.to[0] - this.from[0]) * e, this.from[1] + (this.to[1] - this.from[1]) * e];
  }
}
