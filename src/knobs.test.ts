import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms';
import {
  drawBounds, drawFrom, drawKnob, drawKnobs, fixed, fixedGroups, formatRanges, int, setFixed, isChoice, pick, range, setMax, setMin, setValue, settle, share, sign,
  startRange, step, type Knob, type UserRange,
} from './knobs';
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

  it('keeps a slider value in the wide span, whole where the knob is whole, on a choice\'s two values', () => {
    expect(settle(k, 2.345)).toBe(2.345);
    expect(settle(k, 7)).toBe(4);
    expect(settle(w, 4.6)).toBe(5);
    expect(settle(w, -2)).toBe(1);
    expect(settle(sign('s'), 0.2)).toBe(1);
    expect(settle(sign('s'), -0.2)).toBe(-1);
  });

  it('marks a pick by its lowest and highest value', () => {
    expect(drawBounds(pick('s', [0, 0, 4, 5, 6, 8], [0, 12]).draw)).toEqual([0, 8]);
  });

  it('knows a choice of two from a pick with room round it', () => {
    expect(isChoice(sign('s'))).toBe(true);
    expect(isChoice(pick('beat', [0, 1], [0, 1]))).toBe(true);
    expect(isChoice(pick('sides', [0, 0, 4, 5, 6, 8], [0, 12]))).toBe(false);
    expect(isChoice(pick('turn', [0.5, 1], [0, 2], false))).toBe(false);
  });
});

describe('the user\'s range', () => {
  const k = range('x', 1, 2, [0, 4]);
  const w = int('n', 3, 9, [1, 16]);
  const s = sign('s');

  it('starts at the range the code draws from', () => {
    expect(startRange(k, 1.5)).toEqual({ min: 1, max: 2, value: 1.5 });
    expect(startRange(pick('sides', [0, 0, 4, 5, 6, 8], [0, 12]), 4)).toEqual({ min: 0, max: 8, value: 4 });
  });

  it('keeps min below max by a step when continuous, and pulls the value inside', () => {
    const r = { min: 1, max: 2, value: 1.5 };
    expect(setMin(k, r, 3)).toEqual({ min: 2 - step(k), max: 2, value: 2 - step(k) });
    expect(setMax(k, r, 0)).toEqual({ min: 1, max: 1 + step(k), value: 1 + step(k) });
    expect(setMin(k, r, 1.8)).toEqual({ min: 1.8, max: 2, value: 1.8 });
    expect(setMax(k, r, 1.2)).toEqual({ min: 1, max: 1.2, value: 1.2 });
    expect(setMin(k, r, -5).min).toBe(0);
    expect(setMax(k, r, 9).max).toBe(4);
  });

  it('lets whole numbers and choices meet, for one value only', () => {
    expect(setMin(w, { min: 3, max: 9, value: 5 }, 12)).toEqual({ min: 9, max: 9, value: 9 });
    expect(setMin(s, { min: -1, max: 1, value: -1 }, 1)).toEqual({ min: 1, max: 1, value: 1 });
  });

  it('keeps the value inside min..max', () => {
    const r = { min: 1, max: 2, value: 1.5 };
    expect(setValue(k, r, 3.5).value).toBe(2);
    expect(setValue(k, r, 0.2).value).toBe(1);
    expect(setValue(w, { min: 3, max: 9, value: 5 }, 6.4).value).toBe(6);
  });

  const many = (knob: Knob, r: UserRange, seed = 5): number[] => {
    const rng = createRng(seed);
    return Array.from({ length: 3000 }, () => drawFrom(knob, r, rng));
  };

  it('draws exactly as the code does while left at the code\'s range', () => {
    for (const knob of [k, w, pick('sides', [0, 0, 4, 5, 6, 8], [0, 12])]) {
      const rng = createRng(5);
      const code = Array.from({ length: 3000 }, () => drawKnob(knob.draw, rng));
      expect(many(knob, startRange(knob, 0))).toEqual(code);
    }
  });

  it('draws from the user\'s range once it is moved', () => {
    const v = many(k, { min: 2.5, max: 3.5, value: 3 });
    expect(Math.min(...v)).toBeGreaterThanOrEqual(2.5);
    expect(Math.max(...v)).toBeLessThan(3.5);
    expect(Math.max(...v)).toBeGreaterThan(3.4);
    expect(new Set(many(w, { min: 10, max: 12, value: 11 }))).toEqual(new Set([10, 11, 12]));
    expect(new Set(many(s, { min: 1, max: 1, value: 1 }))).toEqual(new Set([1]));
  });

  it('draws a pick from its own values inside the range, or from the whole numbers in it when none lie inside', () => {
    const sides = pick('sides', [0, 0, 4, 5, 6, 8], [0, 12]);
    expect(new Set(many(sides, { min: 4, max: 10, value: 4 }))).toEqual(new Set([4, 5, 6, 8]));
    expect(new Set(many(sides, { min: 9, max: 11, value: 9 }))).toEqual(new Set([9, 10, 11]));
  });
});

describe('fixed knobs', () => {
  const zoom = fixed('beatZoom', 0.12, [0, 0.5]);

  it('give the code\'s value, and never use up a random number', () => {
    const knobs = [range('a', 0, 1, [0, 1]), zoom, range('b', 0, 1, [0, 1])];
    const v = drawKnobs(knobs, createRng(9));
    expect(v.beatZoom).toBe(0.12);
    expect([v.a, v.b]).toEqual(Object.values(drawKnobs([knobs[0]!, knobs[2]!], createRng(9))));
  });

  it('take the user\'s one value, kept in the wide span, as min, max and value', () => {
    expect(startRange(zoom, 0.12)).toEqual({ min: 0.12, max: 0.12, value: 0.12 });
    expect(setFixed(zoom, 0.3)).toEqual({ min: 0.3, max: 0.3, value: 0.3 });
    expect(setFixed(zoom, 2).value).toBe(0.5);
    expect(drawFrom(zoom, setFixed(zoom, 0.3), createRng(1))).toBe(0.3);
  });

  it('are copied as name and value after the min and max lines', () => {
    const knobs = [zoom, range('scale', 0.9, 1.8, [0.3, 4])];
    const text = formatRanges('julia', knobs, { beatZoom: setFixed(zoom, 0.05), scale: { min: 1, max: 2, value: 1.5 } });
    expect(text.split('\n')).toEqual(['julia', 'scale     min       1  max       2', 'beatZoom  0.050']);
  });
});

describe('fixedGroups', () => {
  it('put each fixed knob under what it does, in order of first appearance, and skip the drawn ones', () => {
    const knobs = [
      fixed('gain', 1, [0, 5], 'follows the beat'),
      range('a', 0, 1, [0, 1]),
      fixed('spin', 0, [0, 1], 'moves with time'),
      fixed('drift', 0, [0, 1], 'moves with time'),
    ];
    expect(fixedGroups(knobs).map((g) => [g.group, g.knobs.map((k) => k.key)])).toEqual([
      ['follows the beat', ['gain']],
      ['moves with time', ['spin', 'drift']],
    ]);
  });

  it('keep a fixed knob without a group under "how it follows the music", as the other algorithms have it', () => {
    const groups = fixedGroups([fixed('beatZoom', 0.1, [0, 1]), fixed('barZoom', 0.1, [0, 1])]);
    expect(groups.map((g) => g.group)).toEqual(['how it follows the music']);
    expect(groups[0]!.knobs).toHaveLength(2);
    const julia = ALGORITHMS.find((a) => a.name === 'julia-kaleidoscope')!;
    expect(fixedGroups(julia.knobs).map((g) => g.group)).toEqual(['how it follows the music']);
    const tunnel = ALGORITHMS.find((a) => a.name === 'tunnel')!;
    expect(fixedGroups(tunnel.knobs).map((g) => g.group)).toEqual(['follows the beat']);
  });
});

describe('formatRanges', () => {
  it('writes one line per knob with its min and max', () => {
    const knobs = [range('scale', 0.9, 1.8, [0.3, 4]), int('ribs', 4, 16, [1, 32])];
    const text = formatRanges('tunnel  seed 0000002a', knobs, { scale: { min: 0.9, max: 2.5, value: 2 }, ribs: { min: 4, max: 7, value: 5 } });
    expect(text.split('\n')).toEqual([
      'tunnel  seed 0000002a',
      'scale  min   0.900  max   2.500',
      'ribs   min       4  max       7',
    ]);
  });
});
