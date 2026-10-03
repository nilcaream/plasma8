import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { Swing, reach, swingIndex, type Point } from './swing';

const dist = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Runs a swing frame by frame (60 per beat) and returns every position. */
function trace(swing: Swing, beats: number, intensity: number): Point[] {
  const out: Point[] = [];
  for (let f = 0; f <= beats * 60; f++) out.push(swing.update(f / 60, intensity));
  return out;
}

describe('swingIndex', () => {
  it('steps on every beat for a kick, on beats 2 and 4 for a snare', () => {
    expect([0, 0.5, 1, 2, 3, 4].map((b) => swingIndex('kick', b))).toEqual([0, 0, 1, 2, 3, 4]);
    const snare = [0, 0.99, 1, 2.99, 3, 4, 5].map((b) => swingIndex('snare', b));
    expect(snare).toEqual([-1, -1, 0, 0, 1, 1, 2]);
  });
});

describe('Swing', () => {
  it('starts at the centre and holds still until the first swing beat', () => {
    const swing = new Swing(createRng(1), 'kick');
    expect(swing.update(0, 1)).toEqual([0, 0]);
    expect(swing.update(0.9, 1)).toEqual([0, 0]);
    expect(swing.update(1.01, 1)).toEqual([0, 0]); // the glide starts here, from where it was
    expect(dist(swing.update(1.2, 1), [0, 0])).toBeGreaterThan(0);
  });

  it('glides: never jumps from one frame to the next', () => {
    for (const beat of ['kick', 'snare'] as const) {
      const path = trace(new Swing(createRng(7), beat), 16, 1);
      // the widest, quickest glide moves at most about 0.05 a frame; a jump would be up to 0.5
      for (let i = 1; i < path.length; i++) expect(dist(path[i]!, path[i - 1]!)).toBeLessThan(0.07);
    }
  });

  it('starts a new glide from where it is when a tap restarts the count mid-glide', () => {
    const swing = new Swing(createRng(11), 'kick');
    trace(swing, 1, 0); // the first swing starts on beat 1; soft, it glides for 0.9 beat
    const mid = swing.update(1.3, 0);
    expect(dist(mid, swing.update(1.3, 0))).toBe(0);
    const after = swing.update(0, 0); // a fresh tap count: beats back to 0, a new swing
    expect(dist(after, mid)).toBeLessThan(1e-9);
  });

  it('moves to a new spot on a kick every beat, on a snare only every second beat', () => {
    const settled = (swing: Swing): Point[] => {
      const spots: Point[] = [];
      for (let b = 1; b <= 8; b++) {
        for (let f = 0; f < 60; f++) swing.update(b - 1 + f / 60, 1);
        spots.push(swing.update(b - 0.01, 1)); // just before beat b+1, the glide has landed
      }
      return spots;
    };
    const kick = settled(new Swing(createRng(3), 'kick'));
    const snare = settled(new Swing(createRng(3), 'snare'));
    for (let i = 2; i < 8; i++) expect(dist(kick[i]!, kick[i - 1]!)).toBeGreaterThan(0.005);
    // a snare swings on beats 2 and 4 (counted from 0: 1, 3, …) and holds over the beat between
    expect(dist(snare[2]!, snare[1]!)).toBeLessThan(1e-9);
    expect(dist(snare[3]!, snare[2]!)).toBeGreaterThan(0.005);
    expect(dist(snare[4]!, snare[3]!)).toBeLessThan(1e-9);
  });

  it('reaches further and glides quicker at high intensity', () => {
    const far = (intensity: number): number => Math.max(...trace(new Swing(createRng(5), 'kick'), 64, intensity).map((p) => dist(p, [0, 0])));
    expect(far(0)).toBeLessThanOrEqual(reach(0) + 1e-9);
    expect(far(1)).toBeLessThanOrEqual(reach(1) + 1e-9);
    expect(far(1)).toBeGreaterThan(3 * far(0));

    // a third of a beat after a swing: hard has landed, soft is still under way
    const progress = (intensity: number): number => {
      const swing = new Swing(createRng(9), 'kick');
      trace(swing, 1, intensity); // up to beat 1, where the first swing starts
      const target = swing.update(1.95, intensity);
      const fresh = new Swing(createRng(9), 'kick');
      trace(fresh, 1, intensity);
      return dist(fresh.update(1.33, intensity), [0, 0]) / dist(target, [0, 0]);
    };
    expect(progress(1)).toBeCloseTo(1, 5);
    expect(progress(0)).toBeLessThan(0.5);
  });
});
