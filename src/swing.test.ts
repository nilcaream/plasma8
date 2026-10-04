import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { LAYER_PERIODS, Layer, Swing, layerWeights, reach, type Point } from './swing';

const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Runs anything with update(beats, intensity) frame by frame (60 per beat) and returns every position. */
function trace(mover: { update(beats: number, intensity: number): Point }, beats: number, intensity: number, from = 0): Point[] {
  const out: Point[] = [];
  for (let f = 0; f <= beats * 60; f++) out.push(mover.update(from + f / 60, intensity));
  return out;
}

describe('layerWeights', () => {
  it('puts nearly all the weight in the 2-bar layer at intensity 0', () => {
    for (const beat of ['kick', 'snare'] as const) {
      const w = layerWeights(beat, 0);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(LAYER_PERIODS[0]).toBe(8);
      expect(w[0]).toBeGreaterThan(0.85);
    }
  });

  it('puts most of it in the 2-beat and 1-beat layers at 1, led by the drawn beat', () => {
    const kick = layerWeights('kick', 1);
    const snare = layerWeights('snare', 1);
    expect(kick[2]! + kick[3]!).toBeGreaterThan(0.85);
    expect(Math.max(...kick)).toBe(kick[3]); // every beat
    expect(snare[2]! + snare[3]!).toBeGreaterThan(0.7);
    expect(Math.max(...snare)).toBe(snare[2]); // every 2 beats
  });

  it('moves gradually with the intensity', () => {
    for (const beat of ['kick', 'snare'] as const) {
      for (let i = 0; i < 100; i++) {
        const a = layerWeights(beat, i / 100);
        const b = layerWeights(beat, (i + 1) / 100);
        for (let j = 0; j < a.length; j++) expect(Math.abs(a[j]! - b[j]!)).toBeLessThan(0.05);
      }
    }
  });
});

describe('Layer', () => {
  it('sets out for a new spot once a period, on the swing beat', () => {
    const bar = new Layer(createRng(2), 4);
    trace(bar, 64, 0);
    expect(bar.spots).toBe(64 / 4 + 1); // the first leg sets out at once
    const snare = new Layer(createRng(2), 2, 1);
    snare.update(0, 1);
    snare.update(0.99, 1);
    expect(snare.spots).toBe(1);
    snare.update(1.01, 1); // beat 2
    expect(snare.spots).toBe(2);
  });

  it('never stops at a spot and never jumps: one smooth drift', () => {
    for (const seed of [1, 4, 9]) {
      for (const period of LAYER_PERIODS) {
        const path = trace(new Layer(createRng(seed), period), 64, 0.5);
        const speed = path.slice(1).map((p, i) => dist(p, path[i]!));
        const settled = speed.slice(60 * period); // after the first leg, which sets out from rest
        const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
        expect(Math.min(...settled)).toBeGreaterThan(0.05 * mean);
        // and no jump in speed from one frame to the next either
        for (let i = 1; i < settled.length; i++) expect(Math.abs(settled[i]! - settled[i - 1]!)).toBeLessThan(0.2 * mean);
      }
    }
  });

  it('starts a new leg from where it is when a tap restarts the count mid-leg', () => {
    const layer = new Layer(createRng(11), 1);
    trace(layer, 1.3, 0);
    const mid = layer.update(1.3, 0);
    const after = layer.update(0, 0); // a fresh tap count: beats back to 0, a new leg
    expect(dist(after, mid)).toBeLessThan(1e-9);
  });
});

describe('Swing', () => {
  it('glides: never jumps from one frame to the next', () => {
    for (const beat of ['kick', 'snare'] as const) {
      for (const intensity of [0, 0.5, 1]) {
        const path = trace(new Swing(createRng(7), beat), 32, intensity);
        for (let i = 1; i < path.length; i++) expect(dist(path[i]!, path[i - 1]!)).toBeLessThan(0.03);
      }
    }
  });

  it('reaches further at high intensity', () => {
    const far = (intensity: number): number => Math.max(...trace(new Swing(createRng(5), 'kick'), 64, intensity).map((p) => dist(p, [0, 0])));
    expect(far(0)).toBeLessThanOrEqual(1.3 * reach(0));
    expect(far(1)).toBeLessThanOrEqual(1.3 * reach(1));
    expect(far(1)).toBeGreaterThan(2 * far(0));
  });

  it('tuned to the snare before it starts, moves exactly as a snare swing drawn the same', () => {
    const tuned = new Swing(createRng(8), 'kick');
    tuned.tune('snare');
    expect(trace(tuned, 32, 1)).toEqual(trace(new Swing(createRng(8), 'snare'), 32, 1));
  });

  it('takes the ways round it is given in place of its own draw', () => {
    const left = trace(new Swing(createRng(8), 'kick', [-1, -1, -1, -1]), 32, 1);
    const right = trace(new Swing(createRng(8), 'kick', [1, 1, 1, 1]), 32, 1);
    expect(left).not.toEqual(right);
    const tuned = new Swing(createRng(8), 'kick');
    tuned.tune('kick', [1, 1, 1, 1]);
    expect(trace(tuned, 32, 1)).toEqual(right);
  });

  it('goes on smoothly when the beat is changed while it runs', () => {
    const swing = new Swing(createRng(4), 'kick');
    const before = trace(swing, 16, 1);
    swing.tune('snare');
    const after = trace(swing, 16, 1, 16 + 1 / 60);
    const steps = (path: Point[]): number => Math.max(...path.slice(1).map((p, i) => dist(p, path[i]!)));
    expect(dist(after[0]!, before[before.length - 1]!)).toBeLessThan(2 * steps(before));
    expect(steps(after)).toBeLessThan(2 * steps(before));
  });
});
