import { describe, expect, it } from 'vitest';
import { REACH_POWER, hitTime, stroke, type Crossfader } from './crossfader';
import { createRng } from './rng';
import { RandomWalk, STEP_AT_1, reflect, stepOf, type WalkParams } from './randomWalk';

const params = (over: Partial<WalkParams> = {}): WalkParams => ({
  min: 2, max: 6, intensity: 1, power: 1, voice: 'kick', travel0: 0.25, travel1: 0.25, stepAt1: 0.1, ...over,
});

/** Takes `hits` kick hits one beat apart, and returns the unit position after each. */
function walk(seed: number, p: WalkParams, hits: number): number[] {
  const w = new RandomWalk(createRng(seed));
  w.advance(0, p);
  w.advance(hits, p);
  return w.history.map((h) => h.u);
}

describe('reflect', () => {
  it('folds a position back inside 0..1 the way a ball bounces off two walls', () => {
    expect(reflect(0.4)).toBeCloseTo(0.4, 12);
    expect(reflect(1.2)).toBeCloseTo(0.8, 12);
    expect(reflect(-0.3)).toBeCloseTo(0.3, 12);
    expect(reflect(2.5)).toBeCloseTo(0.5, 12);
    expect(reflect(-1.25)).toBeCloseTo(0.75, 12);
    expect(reflect(0)).toBe(0);
    expect(reflect(1)).toBe(1);
  });
});

describe('stepOf', () => {
  it('is the share stepAt1 · I^power: none at 0, the whole stepAt1 at 1, less at low intensity the higher the power', () => {
    expect(STEP_AT_1).toBe(0.25);
    expect(stepOf(params({ intensity: 0, power: 2, stepAt1: 0.25 }))).toBe(0);
    expect(stepOf(params({ intensity: 1, power: 2, stepAt1: 0.25 }))).toBe(0.25);
    expect(stepOf(params({ intensity: 0.5, power: 2, stepAt1: 0.25 }))).toBeCloseTo(0.0625, 12);
    expect(stepOf(params({ intensity: 0.5, power: 1, stepAt1: 0.25 }))).toBeCloseTo(0.125, 12);
    expect(stepOf(params({ intensity: 7, power: 2, stepAt1: 0.25 }))).toBe(0.25);
    expect(REACH_POWER).toBe(2);
  });
});

describe('the walk', () => {
  it('goes one fixed step up or down on every hit, folded back inside at an edge', () => {
    const p = params({ stepAt1: 0.3 });
    const path = walk(7, p, 400);
    expect(path).toHaveLength(401);
    let folded = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      const options = [reflect(a + 0.3), reflect(a - 0.3)];
      expect(Math.min(...options.map((o) => Math.abs(o - b)))).toBeLessThan(1e-12);
      if (Math.abs(Math.abs(b - a) - 0.3) > 1e-9) folded++;
    }
    // it did reach the edges and came back, and never sat on one
    expect(folded).toBeGreaterThan(20);
    expect(path.filter((u) => u === 0 || u === 1)).toHaveLength(0);
  });

  it('does not move at intensity 0', () => {
    const path = walk(3, params({ intensity: 0 }), 100);
    expect(new Set(path).size).toBe(1);
  });

  it('picks up and down about as often, whatever the seed', () => {
    for (const seed of [1, 2, 3]) {
      const path = walk(seed, params({ stepAt1: 0.00001 }), 590);
      let up = 0;
      for (let i = 1; i < path.length; i++) if (path[i]! > path[i - 1]!) up++;
      expect(up / (path.length - 1)).toBeGreaterThan(0.43);
      expect(up / (path.length - 1)).toBeLessThan(0.57);
    }
  });

  it('starts at a random point of the range and is the same path for the same seed, another for another', () => {
    const starts = new Set([1, 2, 3, 4, 5, 6].map((s) => walk(s, params(), 0)[0]));
    expect(starts.size).toBe(6);
    expect(walk(9, params(), 50)).toEqual(walk(9, params(), 50));
    expect(walk(9, params(), 50)).not.toEqual(walk(10, params(), 50));
  });
});

describe('the value', () => {
  const p = params({ stepAt1: 0.2 });

  it('arrives on every hit exactly, holds until a stroke before the next, and is the stroke between', () => {
    const w = new RandomWalk(createRng(5));
    for (let t = 0; t <= 20; t += 0.05) w.at(t, p);
    for (const hit of w.history.slice(1)) {
      expect(w.read(hit.time, p)).toBeCloseTo(hit.u, 12);
    }
    const from = w.history[10]!;
    const to = w.history[11]!;
    // holds the old place until 0.25 beats before the hit, then is halfway at its middle
    expect(w.read(to.time - 0.3, p)).toBeCloseTo(from.u, 12);
    expect(w.read(to.time - 0.125, p)).toBeCloseTo(from.u + (to.u - from.u) * stroke(0.5), 12);
  });

  it('keeps what it said about the past when the intensity changes later', () => {
    const w = new RandomWalk(createRng(6));
    const said: number[] = [];
    for (let t = 0; t <= 8; t += 0.25) said.push(w.at(t, p));
    for (let t = 8; t <= 40; t += 0.25) w.at(t, { ...p, intensity: 0.3 });
    const again: number[] = [];
    for (let t = 0; t <= 8; t += 0.25) again.push(2 + (w.read(t, p) ?? NaN) * 4);
    for (let i = 0; i < said.length; i++) expect(again[i]).toBeCloseTo(said[i]!, 12);
  });

  it('goes on from the same place when the count starts again or the voice changes, on the new voice\'s hits', () => {
    const w = new RandomWalk(createRng(8));
    for (let t = 0; t <= 10; t += 0.5) w.at(t, p);
    const place = w.history[w.history.length - 1]!.u;
    expect(w.at(0.5, p)).toBeCloseTo(2 + place * 4, 12);
    expect(w.history[0]!.u).toBe(place);
    for (let t = 1; t <= 6; t += 0.5) w.at(t, { ...p, voice: 'snare' });
    expect(w.history[0]!.time).toBe(hitTime('snare', Math.floor((1 - 1) / 2)));
    expect(w.history.every((h, i) => h.time === hitTime('snare', w.history[0]!.n + i))).toBe(true);
  });

  it('shares the stroke length with the crossfader: the same travel by intensity, cut to the gap', () => {
    const q: Crossfader & { stepAt1: number } = { ...params({ travel0: 0.5, travel1: 0.125, intensity: 0.5 }) };
    const w = new RandomWalk(createRng(2));
    w.advance(0, q);
    w.advance(3, q);
    expect(w.history[3]!.length).toBeCloseTo(0.3125, 12);
  });
});
