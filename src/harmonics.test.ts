import { describe, expect, it } from 'vitest';
import {
  LAYERS, PERIODS, drawHarmonic, harmonicRange, harmonicValue, layer, layerPoint, mix, weights,
} from './harmonics';
import { createRng } from './rng';

const SEEDS = [1, 7, 0xdeadbeef, 123456789];

describe('layer', () => {
  it('passes through its random point on every one of its lines', () => {
    for (const seed of SEEDS) {
      for (let k = 0; k < LAYERS; k++) {
        const T = PERIODS[k]!;
        for (let n = -3; n <= 20; n++) {
          expect(layer(seed, k, n * T)).toBeCloseTo(layerPoint(seed, k, n), 12);
        }
      }
    }
  });

  it('has no jump in velocity at a line, and none in value', () => {
    const h = 1e-5;
    for (const seed of SEEDS) {
      for (let k = 0; k < LAYERS; k++) {
        const T = PERIODS[k]!;
        for (let n = 1; n <= 12; n++) {
          const t = n * T;
          const before = (layer(seed, k, t) - layer(seed, k, t - h)) / h;
          const after = (layer(seed, k, t + h) - layer(seed, k, t)) / h;
          expect(Math.abs(after - before)).toBeLessThan(1e-3);
          // the tangent at a line is half the slope from the point before to the point after
          const slope = (layerPoint(seed, k, n + 1) - layerPoint(seed, k, n - 1)) / (2 * T);
          expect(after).toBeCloseTo(slope, 3);
        }
      }
    }
  });

  it('draws points in [-1, 1), the same for the same seed and different across seeds and layers', () => {
    const seen = new Set<number>();
    for (const seed of SEEDS) {
      for (let k = 0; k < LAYERS; k++) {
        for (let n = -5; n < 50; n++) {
          const p = layerPoint(seed, k, n);
          expect(p).toBeGreaterThanOrEqual(-1);
          expect(p).toBeLessThan(1);
          expect(layerPoint(seed, k, n)).toBe(p);
          seen.add(p);
        }
      }
    }
    expect(seen.size).toBe(SEEDS.length * LAYERS * 55);
  });

  it('stays near [-1, 1] between its points: Catmull-Rom overshoots by little', () => {
    for (const seed of SEEDS) {
      for (let k = 0; k < LAYERS; k++) {
        for (let b = 0; b < 64; b += 1 / 32) expect(Math.abs(layer(seed, k, b))).toBeLessThan(1.3);
      }
    }
  });
});

describe('weights', () => {
  const f = [0.8, 0.6, 0.4, 0.2];

  it('are the factors themselves at intensity 1', () => {
    weights(f, 1).forEach((w, k) => expect(w).toBeCloseTo(f[k]!, 12));
  });

  it('damp each faster layer 4 times more at intensity 0', () => {
    const w = weights(f, 0);
    [1, 1 / 4, 1 / 16, 1 / 64].forEach((m, k) => expect(w[k]).toBeCloseTo(f[k]! * m, 12));
  });

  it('hand the faster layers a larger share as the intensity rises; the 2-bar layer never changes', () => {
    let prev = -1;
    for (let I = 0; I <= 1.0001; I += 0.1) {
      const w = weights(f, I);
      expect(w[0]).toBeCloseTo(0.8, 12);
      const share = w[3]! / w.reduce((a, b) => a + b, 0);
      expect(share).toBeGreaterThan(prev);
      prev = share;
    }
  });
});

describe('mix', () => {
  it('is the one layer alone when only its factor is set', () => {
    for (let k = 0; k < LAYERS; k++) {
      const f = [0, 0, 0, 0];
      f[k] = 0.7;
      for (const b of [0, 1.3, 5.5, 13.25]) expect(mix(9, f, 0.4, b)).toBeCloseTo(layer(9, k, b), 12);
    }
  });

  it('is the weighted mean of the layers', () => {
    const f = [0.9, 0.5, 0.3, 0.6];
    for (const I of [0, 0.5, 1]) {
      const w = weights(f, I);
      const b = 6.75;
      const want = w.reduce((a, wk, k) => a + wk * layer(3, k, b), 0) / w.reduce((a, c) => a + c, 0);
      expect(mix(3, f, I, b)).toBeCloseTo(want, 12);
    }
  });

  it('is 0 when no layer has weight', () => {
    expect(mix(3, [0, 0, 0, 0], 1, 2.5)).toBe(0);
  });
});

describe('drawHarmonic and harmonicRange', () => {
  it('draw a range of 25-60 % of the outer bounds, inside them, and factors with the 2-bar layer leading', () => {
    const rng = createRng(42);
    for (let i = 0; i < 2000; i++) {
      const d = drawHarmonic(rng);
      const { min, max } = harmonicRange(d, 2, 8);
      expect(max - min).toBeGreaterThanOrEqual(6 * 0.25 - 1e-12);
      expect(max - min).toBeLessThan(6 * 0.6);
      expect(min).toBeGreaterThanOrEqual(2);
      expect(max).toBeLessThanOrEqual(8 + 1e-12);
      expect(d.factors).toHaveLength(LAYERS);
      expect(d.factors[0]).toBeGreaterThanOrEqual(0.5);
      expect(d.factors[0]).toBeLessThan(1);
      for (const f of d.factors.slice(1)) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThan(1);
      }
    }
  });

  it('puts the range at L for offset 0 and at H for offset 1', () => {
    const d = { seed: 1, widthShare: 0.5, offsetShare: 0, factors: [1, 0, 0, 0] };
    expect(harmonicRange(d, 2, 8)).toEqual({ min: 2, max: 5 });
    expect(harmonicRange({ ...d, offsetShare: 1 }, 2, 8)).toEqual({ min: 5, max: 8 });
  });
});

describe('harmonicValue', () => {
  it('is mid + half·u, clamped to [min, max], at every intensity', () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) {
      const d = drawHarmonic(rng);
      const { min, max } = harmonicRange(d, 2, 8);
      for (const I of [0, 0.5, 1]) {
        for (let b = 0; b < 32; b += 0.37) {
          const v = harmonicValue(d, 2, 8, I, b);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
          const u = mix(d.seed, d.factors, I, b);
          if (Math.abs(u) <= 1) expect(v).toBeCloseTo((min + max) / 2 + ((max - min) / 2) * u, 12);
        }
      }
    }
  });
});
