/**
 * The maze's flips. A flip is a discrete event, not a moving value: on every beat a
 * number of clusters of neighbouring tiles, set by the intensity, each turn a quarter
 * turn together: rotating over TURN_BEATS from the beat, or at once on it, drawn on every
 * beat. Only small clusters flip at intensity 0, any size at 1. The beat is the kick (kick
 * on every beat, src/beatVoices.ts); the beat voices' amounts (A.*) play no part.
 *
 * What the flips have turned so far lives in a grid of tiles that wraps every
 * STATE_SIZE tiles (wider than any screen at the most tiles a picture height has),
 * kept here and handed to the shader as a texture.
 */

import type { Rng } from './rng';

export const STATE_SIZE = 256;

/** How long a flip's quarter turn takes, in beats, at every intensity; it starts on the beat. */
export const TURN_BEATS = 0.5;

type Cell = readonly [number, number];

/** The tiles from lo to hi on both axes: a square of hi − lo + 1 tiles a side. */
const square = (lo: number, hi: number): Cell[] => {
  const out: Cell[] = [];
  for (let y = lo; y <= hi; y++) for (let x = lo; x <= hi; x++) out.push([x, y]);
  return out;
};

/** The tiles at most r steps from the middle, along the grid: a diamond. */
const diamond = (r: number): Cell[] => square(-r, r).filter(([x, y]) => Math.abs(x) + Math.abs(y) <= r);

/** The clusters that may flip, smallest first; a cluster lies at a random quarter turn. */
export const CLUSTER_SHAPES: readonly { readonly name: string; readonly cells: readonly Cell[] }[] = [
  { name: 'single', cells: [[0, 0]] },
  { name: 'domino', cells: [[0, 0], [1, 0]] },
  { name: 'L', cells: [[0, 0], [1, 0], [0, 1]] },
  { name: '2x2', cells: square(0, 1) },
  { name: 'plus', cells: diamond(1) },
  { name: '3x3', cells: square(-1, 1) },
  { name: 'diamond', cells: diamond(2) },
  { name: '4x4', cells: square(-1, 2) },
];

/** How a flip changes its tiles, drawn on every kick, each equally likely: a quarter turn over TURN_BEATS, or at once. */
export const TRANSITIONS = ['rotate', 'instant'] as const;
export type Transition = (typeof TRANSITIONS)[number];

/** How many clusters flip on a beat and how big they may be: `clustersAt1` at intensity 1, none at 0; up to `tilesAt0` tiles at 0, any size at 1. */
export interface FlipRule {
  clustersAt1: number;
  tilesAt0: number;
}

/** The tiles on screen, as whole tile numbers from x0..x1 and y0..y1. */
export interface TileWindow {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The clusters that flip on one beat: `clustersAt1 · I` on average, the fraction taken at random so a low intensity still flips now and then. */
export function clusterCount(intensity: number, rule: FlipRule, rng: Rng): number {
  const mean = rule.clustersAt1 * Math.min(1, Math.max(0, intensity));
  const whole = Math.floor(mean);
  return whole + (rng.next() < mean - whole ? 1 : 0);
}

/**
 * The shapes a flip may take at an intensity: those of at most tilesAt0 tiles at 0, every shape at 1. The most tiles grow
 * by the square root of the intensity, so the clusters are already big at 0.5 (up to 3x3, where a straight line gave 2x2).
 */
export function shapesAt(intensity: number, rule: FlipRule): typeof CLUSTER_SHAPES {
  const largest = Math.max(...CLUSTER_SHAPES.map((s) => s.cells.length));
  const most = rule.tilesAt0 + (largest - rule.tilesAt0) * Math.sqrt(Math.min(1, Math.max(0, intensity)));
  const shapes = CLUSTER_SHAPES.filter((s) => s.cells.length <= most + 1e-9);
  return shapes.length > 0 ? shapes : CLUSTER_SHAPES.slice(0, 1);
}

/** One of the shapes, the bigger ones likelier: each in proportion to its tiles, so a single is the rarest. */
export function pickShape(shapes: typeof CLUSTER_SHAPES, rng: Rng): (typeof CLUSTER_SHAPES)[number] {
  const total = shapes.reduce((sum, s) => sum + s.cells.length, 0);
  let left = rng.next() * total;
  for (const s of shapes) {
    left -= s.cells.length;
    if (left < 0) return s;
  }
  return shapes[shapes.length - 1]!;
}

/** Where a tile lies in the grid that wraps. */
export const gridIndex = (x: number, y: number): number => {
  const w = (n: number): number => ((n % STATE_SIZE) + STATE_SIZE) % STATE_SIZE;
  return w(y) * STATE_SIZE + w(x);
};

export class MazeFlips {
  /** 1 where the flips so far stand a tile turned a quarter, 0 where they stand it as drawn (two flips are a half turn, which looks the same). */
  readonly rest = new Uint8Array(STATE_SIZE * STATE_SIZE);
  /** The tiles turning since `beat`, by grid index. */
  turning: number[] = [];
  /** The beat the turning tiles started on; undefined before the first frame. */
  beat: number | undefined;
  /** How the tiles of this beat change, drawn with them. */
  transition: Transition = 'rotate';
  /** Whether rest or turning changed since the last `takeChanged`. */
  private changed = true;

  constructor(private readonly rng: Rng) {}

  /**
   * Takes the time: on a new beat the turning tiles land and new clusters start to turn, none while `held` (Moves off).
   * Nothing turns on the first frame, which is never on a beat.
   */
  update(beats: number, intensity: number, window: TileWindow, rule: FlipRule, held = false): void {
    const n = Math.floor(beats);
    if (this.beat === n) return;
    const first = this.beat === undefined;
    for (const i of this.turning) this.rest[i] = this.rest[i]! ^ 1;
    this.turning = first || held ? [] : this.draw(intensity, window, rule);
    this.transition = this.rng.pick(TRANSITIONS);
    this.beat = n;
    this.changed = true;
  }

  /**
   * The share of the turn done now: 0 on the beat, 1 TURN_BEATS later. It is fastest on the beat and slows to land, the
   * way the metronome's dot falls off (1 − phase)³: a turn eased in both ends moved least on the beat and settled half a
   * beat after it, so the eye took the flip to fall on the off-beat. An instant flip is whole on the beat.
   */
  done(beats: number): number {
    if (this.beat === undefined) return 0;
    if (this.transition === 'instant') return 1;
    const x = Math.min(1, Math.max(0, (beats - this.beat) / TURN_BEATS));
    return 1 - (1 - x) ** 3;
  }

  /** True once after every change: the texture needs uploading. */
  takeChanged(): boolean {
    const was = this.changed;
    this.changed = false;
    return was;
  }

  /** The grid as RG bytes: R the rest, G the tiles turning now. */
  fill(out: Uint8Array): void {
    for (let i = 0; i < this.rest.length; i++) {
      out[2 * i] = this.rest[i]! * 255;
      out[2 * i + 1] = 0;
    }
    for (const i of this.turning) out[2 * i + 1] = 255;
  }

  /** The tiles of this beat's clusters, each at a random place on screen and a random quarter turn, the bigger shapes likelier; a tile two clusters share turns once. */
  private draw(intensity: number, window: TileWindow, rule: FlipRule): number[] {
    const shapes = shapesAt(intensity, rule);
    const tiles = new Set<number>();
    const count = clusterCount(intensity, rule, this.rng);
    for (let c = 0; c < count; c++) {
      const shape = pickShape(shapes, this.rng);
      const turns = Math.floor(this.rng.next() * 4);
      const x = window.x0 + Math.floor(this.rng.next() * (window.x1 - window.x0 + 1));
      const y = window.y0 + Math.floor(this.rng.next() * (window.y1 - window.y0 + 1));
      for (const [dx, dy] of shape.cells) {
        let [u, v] = [dx, dy];
        for (let t = 0; t < turns; t++) [u, v] = [-v, u];
        tiles.add(gridIndex(x + u, y + v));
      }
    }
    return [...tiles];
  }
}

/** The tiles a maze picture shows, from the same numbers its shader uses: the picture's middle is at pan·time + offset. */
export function tileWindow(cells: number, pan: readonly number[], offset: readonly number[], time: number, width: number, height: number, view: number): TileWindow {
  const halfH = 0.5 * view * cells;
  const halfW = (halfH * width) / Math.max(1, height);
  const cx = pan[0]! * time + offset[0]!;
  const cy = pan[1]! * time + offset[1]!;
  return { x0: Math.floor(cx - halfW), x1: Math.floor(cx + halfW), y0: Math.floor(cy - halfH), y1: Math.floor(cy + halfH) };
}
