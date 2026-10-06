import { describe, expect, it } from 'vitest';
import { PLASMA_KNOBS, PLASMA_MOVING_GROUPS, drawPlasmaMoving } from './algorithms/plasma';
import { VOICE_NAMES } from './beatVoices';
import { TRAVEL_AT_0, TRAVEL_AT_1, crossfade, hitTime } from './crossfader';
import { drawBounds } from './knobs';
import { MOVING_COUNT, drawMoving, movingAt, movingRange, movingValues } from './moving';
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

  it('is the crossfader of its sub-range and voice, at the stroke lengths in code', () => {
    const rng = createRng(10);
    for (let i = 0; i < 40; i++) {
      for (const m of drawMoving(GROUPS, bounds, rng)) {
        for (const intensity of [0, 0.5, 1]) {
          for (let beats = -2; beats < 17; beats += 0.0625) {
            const p = { min: m.min, max: m.max, intensity, voice: m.voice, travel0: TRAVEL_AT_0, travel1: TRAVEL_AT_1 };
            expect(movingAt(m, intensity, beats)).toBe(crossfade(beats, p));
          }
        }
      }
    }
  });

  it('puts a value on an edge of its band on every hit of its voice, at intensity 1 the edges of its sub-range', () => {
    const rng = createRng(11);
    for (let i = 0; i < 40; i++) {
      for (const m of drawMoving(GROUPS, bounds, rng)) {
        for (let n = 0; n < 6; n++) {
          const v = movingAt(m, 1, hitTime(m.voice, n));
          expect(Math.min(Math.abs(v - m.min), Math.abs(v - m.max))).toBeLessThan(1e-9);
        }
        expect(movingAt(m, 0, 3.3)).toBeCloseTo((m.min + m.max) / 2, 12);
      }
    }
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
