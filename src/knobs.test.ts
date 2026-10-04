import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms';
import { drawBounds, drawKnob, drawKnobs, formatValues, int, pick, range, settle, share, withPins } from './knobs';
import { createRng } from './rng';

describe('drawKnob', () => {
  const rng = createRng(17);
  const many = (f: () => number): number[] => Array.from({ length: 4000 }, f);

  it('draws a range from [min, max)', () => {
    const v = many(() => drawKnob({ kind: 'range', min: 0.2, max: 0.7 }, rng));
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...v)).toBeLessThan(0.7);
  });

  it('draws every whole number from min to max, both ends included, and nothing else', () => {
    const v = many(() => drawKnob({ kind: 'int', min: 3, max: 9 }, rng));
    expect(new Set(v)).toEqual(new Set([3, 4, 5, 6, 7, 8, 9]));
  });

  it('draws only from a pick list', () => {
    const v = many(() => drawKnob({ kind: 'pick', values: [0, 0, 4, 8] }, rng));
    expect(new Set(v)).toEqual(new Set([0, 4, 8]));
  });
});

describe('every algorithm\'s knobs', () => {
  for (const def of ALGORITHMS) {
    it(`${def.name}: unique keys, and each draw lies inside its slider's wide span`, () => {
      const keys = def.knobs.map((k) => k.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of def.knobs) {
        const [lo, hi] = drawBounds(k.draw);
        expect(k.wide[0], k.key).toBeLessThan(k.wide[1]);
        expect(lo, k.key).toBeGreaterThanOrEqual(k.wide[0]);
        expect(hi, k.key).toBeLessThanOrEqual(k.wide[1]);
        if (k.whole) expect([lo, hi, ...k.wide].every(Number.isInteger), k.key).toBe(true);
      }
    });

    it(`${def.name}: a draw sets every knob`, () => {
      const v = drawKnobs(def.knobs, createRng(3));
      expect(Object.keys(v)).toEqual(def.knobs.map((k) => k.key));
      expect(Object.values(v).every(Number.isFinite)).toBe(true);
    });
  }
});

describe('the slider maths', () => {
  const k = range('x', 1, 2, [0, 4]);
  const w = int('n', 3, 9, [1, 16]);

  it('places a value on the wide span, clamped', () => {
    expect(share(k, 0)).toBe(0);
    expect(share(k, 1)).toBe(0.25);
    expect(share(k, 4)).toBe(1);
    expect(share(k, 9)).toBe(1);
    expect(share(k, -3)).toBe(0);
  });

  it('keeps a slider value in the wide span, whole where the knob is whole', () => {
    expect(settle(k, 2.345)).toBe(2.345);
    expect(settle(k, 7)).toBe(4);
    expect(settle(w, 4.6)).toBe(5);
    expect(settle(w, -2)).toBe(1);
  });

  it('marks a pick by its lowest and highest value', () => {
    expect(drawBounds(pick('s', [0, 0, 4, 5, 6, 8], [0, 12]).draw)).toEqual([0, 8]);
  });
});

describe('withPins', () => {
  it('puts the pinned values in place of the draw, and leaves the rest as drawn', () => {
    const drawn = { a: 1, b: 2, c: 3 };
    expect(withPins(drawn, new Map([['b', 7]]))).toEqual({ a: 1, b: 7, c: 3 });
    expect(drawn).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('ignores a pin for a knob the algorithm does not have', () => {
    expect(withPins({ a: 1 }, new Map([['z', 5]]))).toEqual({ a: 1 });
  });
});

describe('formatValues', () => {
  it('writes one line per knob with its value, the draw and its range, and marks the pinned ones', () => {
    const knobs = [range('scale', 0.9, 1.8, [0.3, 4]), int('ribs', 4, 16, [1, 32])];
    const text = formatValues('tunnel  seed 0000002a', knobs, { scale: 2.5, ribs: 7 }, { scale: 1.2, ribs: 7 }, new Map([['scale', 2.5]]));
    const lines = text.split('\n');
    expect(lines[0]).toBe('tunnel  seed 0000002a');
    expect(lines[1]).toBe('scale    2.500 pinned  drawn 1.200 from 0.900..1.800');
    expect(lines[2]).toBe('ribs         7         drawn 7 from whole 4..16');
  });
});
