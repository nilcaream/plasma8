import { describe, expect, it } from 'vitest';
import { PLASMA_KNOBS, PLASMA_MOVING_GROUPS, drawPlasmaMoving } from './algorithms/plasma';
import { VOICE_NAMES } from './beatVoices';
import { REACH_POWER, hitTime } from './crossfader';
import { drawBounds } from './knobs';
import {
  MOVING_COUNT, drawMoving, getReachPower, getStepAt1, movingAt, movingRange, movingValues, setReachPower, setStepAt1, type MovingValue,
} from './moving';
import { STEP_AT_1, STEP_EXTRA } from './randomWalk';
import { createRng } from './rng';

const GROUPS = [['a', 'b'], ['c'], ['d', 'e', 'f'], ['g'], ['h', 'i']];
const bounds = (key: string): [number, number] => [key.charCodeAt(0), key.charCodeAt(0) + 10];

describe('drawMoving', () => {
  it('moves 2 to 5 values, one from each of as many different groups, reaching both ends of the count', () => {
    const rng = createRng(1);
    const counts = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const moving = drawMoving(GROUPS, bounds, rng);
      counts.add(moving.length);
      expect(moving.length).toBeGreaterThanOrEqual(MOVING_COUNT[0]);
      expect(moving.length).toBeLessThanOrEqual(MOVING_COUNT[1]);
      const groupOf = moving.map((m) => GROUPS.findIndex((g) => g.includes(m.key)));
      expect(new Set(groupOf).size).toBe(moving.length);
      expect(groupOf.every((g) => g >= 0)).toBe(true);
    }
    expect([...counts].sort()).toEqual([2, 3, 4, 5]);
  });

  it('picks every group and every value in a group, as often as chance gives', () => {
    const rng = createRng(2);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const m of drawMoving(GROUPS, bounds, rng)) seen.add(m.key);
    expect([...seen].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  });

  it('moves one value per group when there are fewer groups than the count', () => {
    expect(drawMoving([['a']], bounds, createRng(3)).map((m) => m.key)).toEqual(['a']);
  });

  it('moves a value in a sub-range of 25 to 60 percent of its bounds, placed inside them', () => {
    const rng = createRng(4);
    for (let i = 0; i < 300; i++) {
      for (const m of drawMoving(GROUPS, bounds, rng)) {
        const { min, max } = movingRange(m);
        expect(min).toBeGreaterThanOrEqual(m.lo - 1e-9);
        expect(max).toBeLessThanOrEqual(m.hi + 1e-9);
        expect((max - min) / (m.hi - m.lo)).toBeGreaterThanOrEqual(0.25 - 1e-9);
        expect((max - min) / (m.hi - m.lo)).toBeLessThan(0.6);
      }
    }
  });

  it('keeps every value inside its sub-range at any intensity and any moment', () => {
    const rng = createRng(5);
    for (const m of drawMoving(GROUPS, bounds, rng)) {
      const { min, max } = movingRange(m);
      for (const intensity of [0, 0.4, 1]) {
        for (let beats = 0; beats < 40; beats += 0.37) {
          const v = movingAt(m, intensity, beats);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('gives each moving value a voice at random, kick, snare and crash alike, drawn once', () => {
    const rng = createRng(8);
    const count: Record<string, number> = { kick: 0, snare: 0, crash: 0 };
    for (let i = 0; i < 600; i++) for (const m of drawMoving(GROUPS, bounds, rng)) count[m.voice]!++;
    const total = count.kick! + count.snare! + count.crash!;
    for (const name of VOICE_NAMES) expect(count[name]! / total).toBeGreaterThan(0.28);
    expect(VOICE_NAMES).toContain(drawMoving(GROUPS, bounds, createRng(9))[0]!.voice);
  });

  /** Each step the value takes on 40 hits of its voice at an intensity, as a share of its sub-range. */
  const stepsOf = (m: MovingValue, intensity: number): number[] => {
    const at = (n: number): number => (movingAt(m, intensity, hitTime(m.voice, n)) - m.min) / (m.max - m.min);
    let before = at(0);
    const out: number[] = [];
    for (let n = 1; n <= 40; n++) {
      const now = at(n);
      out.push(Math.abs(now - before));
      before = now;
    }
    return out;
  };

  it('steps a random walk on every hit of its voice: a whole step of stepAt1 · I^power of the sub-range, up to a tenth longer', () => {
    expect(getStepAt1()).toBe(STEP_AT_1);
    const rng = createRng(10);
    for (let i = 0; i < 20; i++) {
      for (const m of drawMoving(GROUPS, bounds, rng)) {
        const base = STEP_AT_1 * 0.5 ** REACH_POWER;
        for (const step of stepsOf(m, 0.5)) {
          expect(step).toBeGreaterThanOrEqual(base - 1e-9);
          expect(step).toBeLessThan(base * (1 + STEP_EXTRA) + 1e-9);
        }
      }
    }
  });

  it('sits still at intensity 0, at a random point of its sub-range rather than the middle', () => {
    const rng = createRng(11);
    const places = new Set<number>();
    for (let i = 0; i < 40; i++) {
      for (const m of drawMoving(GROUPS, bounds, rng)) {
        expect(new Set(stepsOf(m, 0))).toEqual(new Set([0]));
        const u = (movingAt(m, 0, 99) - m.min) / (m.max - m.min);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        places.add(Math.round(u * 1e6));
      }
    }
    expect(places.size).toBeGreaterThan(100);
    expect([...places].filter((u) => Math.abs(u - 5e5) < 1e4).length).toBeLessThan(places.size / 10);
  });

  it('steps by the one global reach power and step, which setReachPower and setStepAt1 change for every value at once', () => {
    expect(getReachPower()).toBe(REACH_POWER);
    const m = drawMoving(GROUPS, bounds, createRng(12))[0]!;
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    try {
      setReachPower(1);
      expect(Math.min(...stepsOf(m, 0.2))).toBeGreaterThanOrEqual(STEP_AT_1 * 0.2 - 1e-9);
      const linear = mean(stepsOf(m, 0.2));
      setReachPower(2);
      expect(mean(stepsOf(m, 0.2))).toBeLessThan(linear);
      expect(Math.min(...stepsOf(m, 0.2))).toBeGreaterThanOrEqual(STEP_AT_1 * 0.04 - 1e-9);
      setStepAt1(0.4);
      expect(getStepAt1()).toBe(0.4);
      expect(Math.min(...stepsOf(m, 1))).toBeGreaterThanOrEqual(0.4 - 1e-9);
    } finally {
      setReachPower(REACH_POWER);
      setStepAt1(STEP_AT_1);
    }
  });

  it('gives every moving value a walk of its own, drawn from the instance generator: the same seed the same path, another seed another', () => {
    const a = drawMoving(GROUPS, bounds, createRng(13));
    expect(new Set(a.map((m) => m.walk)).size).toBe(a.length);
    const path = (seed: number): number[] => {
      const m = drawMoving(GROUPS, bounds, createRng(seed))[0]!;
      return Array.from({ length: 30 }, (_, n) => movingAt(m, 1, hitTime(m.voice, n)));
    };
    expect(path(14)).toEqual(path(14));
    expect(path(14)).not.toEqual(path(15));
  });

  it('draws nothing from the instance generator while it runs', () => {
    const rng = createRng(16);
    const moving = drawMoving(GROUPS, bounds, rng);
    const after = createRng(16);
    drawMoving(GROUPS, bounds, after);
    for (const m of moving) for (let n = 0; n < 50; n++) movingAt(m, 1, hitTime(m.voice, n));
    expect(rng.next()).toBe(after.next());
  });

  it('reads every moving value by its key', () => {
    const moving = drawMoving(GROUPS, bounds, createRng(6));
    expect(Object.keys(movingValues(moving, 0.5, 3)).sort()).toEqual(moving.map((m) => m.key).sort());
  });
});

describe('plasma\'s moving groups', () => {
  const keys = PLASMA_KNOBS.map((k) => k.key);

  it('name five groups of 22 values between them, all continuous knobs of plasma, and never the wave speeds', () => {
    expect(PLASMA_MOVING_GROUPS.map((g) => g.length)).toEqual([2, 3, 4, 6, 7]);
    for (const key of PLASMA_MOVING_GROUPS.flat()) {
      expect(keys).toContain(key);
      expect(key).not.toMatch(/^speed/);
      expect(PLASMA_KNOBS.find((k) => k.key === key)!.draw.kind).toBe('range');
    }
    expect(new Set(PLASMA_MOVING_GROUPS.flat()).size).toBe(22);
  });

  it('moves a value inside the bounds plasma draws it from today', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      for (const m of drawPlasmaMoving(rng)) {
        const [lo, hi] = drawBounds(PLASMA_KNOBS.find((k) => k.key === m.key)!.draw);
        expect([m.lo, m.hi]).toEqual([lo, hi]);
      }
    }
  });
});
