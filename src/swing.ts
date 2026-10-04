import { BEATS_PER_BAR } from './clock';
import type { Rng } from './rng';

/**
 * Where the far end of the tunnel sits on screen, in the shaders' uv units (y
 * from -0.5 to 0.5, 0 the centre). It is a weighted sum of layers locked to the
 * beat, like harmonics: one wanders through a new spot every 2 bars, one every
 * bar, one every 2 beats, one every beat. The intensity slides the weight from
 * the slow layers to the fast ones: at 0 nearly all of it is in the 2-bar
 * layer, a slow drift; at 1 most of it is in the layer of the drawn beat (every
 * beat for a kick, every 2 beats for a snare) and its neighbour. The reach, how
 * far from the centre the spots lie, grows with the intensity too.
 *
 * Each layer is a smooth curve through its spots: every leg is a Hermite curve
 * that starts with the speed and direction the layer has and leaves its spot
 * heading for the spot after it, so it never stops at a spot or turns there
 * with a jerk. Seen from the centre, each new spot lies 30 to 90 degrees on from
 * the last, always the same way round, so a layer wanders round and never
 * doubles back (doubling back is the rocking, and it nearly stops there). A
 * tap that re-aligns the beat starts the next leg from where the layer is and
 * how it is moving.
 */

/** kick: the 1-beat layer leads at high intensity; snare: the 2-beat layer, on beats 2 and 4. */
export type SwingBeat = 'kick' | 'snare';

/** The layers' periods in beats, slowest first: 2 bars, 1 bar, 2 beats, 1 beat. */
export const LAYER_PERIODS = [2 * BEATS_PER_BAR, BEATS_PER_BAR, 2, 1] as const;
/** How widely the weight spreads over the layers around the one that leads, in layers. */
export const LAYER_SPREAD = 0.5;

/** How far from the centre a new spot may be, at intensity 0 and 1. */
export const REACH_SOFT = 0.06;
export const REACH_HARD = 0.3;
/** How far round a new spot lies from the last one, in radians: always the layer's own way round. */
export const MIN_TURN = Math.PI / 6;
export const MAX_TURN = Math.PI / 2;

export type Point = readonly [number, number];

export function reach(intensity: number): number {
  return REACH_SOFT + (REACH_HARD - REACH_SOFT) * Math.min(1, Math.max(0, intensity));
}

/**
 * Each layer's weight, slowest first, summing to 1. The lead slides from the
 * 2-bar layer at intensity 0 to the drawn beat's layer at 1, and the weight
 * spreads round it as a bell, so it moves gradually with the intensity.
 */
export function layerWeights(beat: SwingBeat, intensity: number): number[] {
  const last = beat === 'kick' ? LAYER_PERIODS.length - 1 : LAYER_PERIODS.length - 2;
  const lead = last * Math.min(1, Math.max(0, intensity));
  const raw = LAYER_PERIODS.map((_, j) => Math.exp(-0.5 * ((j - lead) / LAYER_SPREAD) ** 2));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / sum);
}

/** One layer: a smooth curve through a new random spot every `period` beats, `offset` beats into the period. */
export class Layer {
  private p0: Point = [0, 0];
  private v0: Point = [0, 0];
  private p1: Point = [0, 0];
  private v1: Point = [0, 0];
  /** The spot after p1, drawn a leg early so the curve can head for it. */
  private ahead: Point | undefined;
  private angle: number;
  /** Which way round the spots go: 1 or -1. */
  private readonly way: number;
  private start = 0;
  private length = 1;
  private index: number | undefined;
  private shown: Point = [0, 0];
  private velocity: Point = [0, 0];
  /** How many spots it has set out for. */
  spots = 0;

  constructor(
    private readonly rng: Rng,
    readonly period: number,
    readonly offset = 0,
  ) {
    this.angle = rng.next() * 2 * Math.PI;
    this.way = rng.next() < 0.5 ? -1 : 1;
  }

  /** Call once a frame with the clock's beat count; returns where the layer is now. */
  update(beats: number, intensity: number): Point {
    const index = Math.floor((beats - this.offset) / this.period);
    // the first frame sets out at once, towards the spot due on the next swing beat
    if (index !== this.index) {
      // where the old leg has got to by now, not where it was last frame
      if (this.index !== undefined && beats > this.start) this.at(beats);
      this.begin(beats, (index + 1) * this.period + this.offset - beats, intensity);
    }
    this.index = index;
    this.at(beats);
    return this.shown;
  }

  private begin(beats: number, length: number, intensity: number): void {
    // from where it is and how it is moving
    this.p0 = this.shown;
    this.v0 = this.velocity;
    this.p1 = this.ahead ?? this.spot(intensity);
    this.ahead = this.spot(intensity);
    // leave p1 heading for the spot after it (a Catmull-Rom tangent, per beat)
    const span = 2 * this.period;
    this.v1 = [(this.ahead[0] - this.p0[0]) / span, (this.ahead[1] - this.p0[1]) / span];
    this.start = beats;
    this.length = Math.max(0.25, length);
    this.spots++;
  }

  private spot(intensity: number): Point {
    this.angle += this.way * (MIN_TURN + (MAX_TURN - MIN_TURN) * this.rng.next());
    const r = reach(intensity) * (0.5 + 0.5 * this.rng.next());
    return [r * Math.cos(this.angle), r * Math.sin(this.angle)];
  }

  /** Sets where the layer is and its velocity per beat, on the leg under way. */
  private at(beats: number): void {
    const T = this.length;
    const s = Math.min(1, Math.max(0, (beats - this.start) / T));
    const s2 = s * s;
    const s3 = s2 * s;
    const h = [2 * s3 - 3 * s2 + 1, s3 - 2 * s2 + s, -2 * s3 + 3 * s2, s3 - s2];
    const d = [6 * s2 - 6 * s, 3 * s2 - 4 * s + 1, -6 * s2 + 6 * s, 3 * s2 - 2 * s];
    const { p0, v0, p1, v1 } = this;
    const mix = (c: number[], k: 0 | 1): number => c[0]! * p0[k] + c[1]! * T * v0[k] + c[2]! * p1[k] + c[3]! * T * v1[k];
    this.shown = [mix(h, 0), mix(h, 1)];
    this.velocity = [mix(d, 0) / T, mix(d, 1) / T];
  }
}

export class Swing {
  private readonly layers: Layer[];

  constructor(
    rng: Rng,
    readonly beat: SwingBeat,
  ) {
    // a snare's 2-beat layer falls on beats 2 and 4
    this.layers = LAYER_PERIODS.map((p) => new Layer(rng, p, beat === 'snare' && p === 2 ? 1 : 0));
  }

  /** Call once a frame with the clock's beat count; returns where the far end is now. */
  update(beats: number, intensity: number): Point {
    const w = layerWeights(this.beat, intensity);
    let x = 0;
    let y = 0;
    this.layers.forEach((layer, j) => {
      const [lx, ly] = layer.update(beats, intensity);
      x += w[j]! * lx;
      y += w[j]! * ly;
    });
    return [x, y];
  }
}
