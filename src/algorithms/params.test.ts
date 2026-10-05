import { describe, expect, it } from 'vitest';
import { drawKnobs } from '../knobs';
import { stepShape } from '../motion';
import { createRng, type Rng } from '../rng';
import type { ShaderParams } from '../shaderAlgorithm';
import { JULIA_KNOBS, drawJuliaParams, juliaParams } from './julia';
import { PLASMA_KNOBS, drawPlasmaParams, plasmaParams } from './plasma';
import plasmaSource from './plasma.frag?raw';
import { drawTunnelParams } from './tunnel';
import { WARP_NOISE_KNOBS, warpNoiseParams } from './warpNoise';
import warpSource from './warpNoise.frag?raw';

const DRAWS: [string, (rng: Rng) => ShaderParams][] = [
  ['plasma', drawPlasmaParams],
  ['julia', drawJuliaParams],
  ['tunnel', drawTunnelParams],
];

describe.each(DRAWS)('%s parameters', (_name, draw) => {
  it('are the same for the same seed', () => {
    expect(draw(createRng(5))).toEqual(draw(createRng(5)));
  });

  it('differ from one draw to the next of one run', () => {
    const rng = createRng(5);
    expect(draw(rng)).not.toEqual(draw(rng));
  });

  it('are finite numbers or vectors of 2 to 4, for any seed', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const value of Object.values(draw(createRng(seed)))) {
        const parts = typeof value === 'number' ? [value] : value;
        expect(typeof value === 'number' || (parts.length >= 2 && parts.length <= 4)).toBe(true);
        for (const v of parts) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('julia parameters', () => {
  it('fold the plane into 3 to 9 whole wedges', () => {
    for (let seed = 0; seed < 100; seed++) {
      const n = drawJuliaParams(createRng(seed)).u_segments as number;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});

describe('julia\'s fixed values', () => {
  it('are the ones set on the debug panel, its own bar-step shape among them', () => {
    const v = drawKnobs(JULIA_KNOBS, createRng(1));
    expect(stepShape(v)).toEqual({ sizeSoft: 0.021, sizeHard: 0.052, easeSoft: 0.793, easeHard: 0.227 });
    const p = juliaParams(v);
    expect([p.u_beatZoom, p.u_barZoom, p.u_beatLight, p.u_barLight, p.u_glow, p.u_colourShift, p.u_wanderSpeed])
      .toEqual([0.011, 0.029, 0.184, 0.089, 0.263, 0.056, 0.105]);
  });
});

describe('plasma\'s and warp noise\'s fixed values', () => {
  const PLASMA_FIXED = {
    u_beatBreath: 0, u_barBreath: 0, u_swirlSpin: 0, u_orbitSpeed: 0,
    u_colourDrift: 0, u_beatColour: 0.005, u_beatLight: 0.726, u_barLight: 0.532,
  };
  const WARP_FIXED = {
    u_beatBreath: 0.1, u_barBreath: 0.18, u_beatColour: 0.06, u_barColour: 0.15, u_beatLight: 0.09, u_barLight: 0.06,
  };

  it('are plasma\'s as set on the debug panel, and warp noise\'s as the shader had them', () => {
    const p = plasmaParams(drawKnobs(PLASMA_KNOBS, createRng(1)));
    for (const [key, value] of Object.entries(PLASMA_FIXED)) expect(p[key]).toBe(value);
    const w = warpNoiseParams(drawKnobs(WARP_NOISE_KNOBS, createRng(1)));
    for (const [key, value] of Object.entries(WARP_FIXED)) expect(w[key]).toBe(value);
  });

  it('are each read by the shader as a uniform', () => {
    for (const key of Object.keys(PLASMA_FIXED)) expect(plasmaSource).toContain(`uniform float ${key};`);
    for (const key of Object.keys(WARP_FIXED)) expect(warpSource).toContain(`uniform float ${key};`);
  });
});

describe('plasma\'s random ranges', () => {
  const RANGES: Record<string, [number, number]> = {
    'palA.0': [0.089, 0.868], 'palA.1': [0.211, 0.853], 'palA.2': [0.226, 0.868],
    'palB.0': [0, 1], 'palB.1': [0, 1], 'palB.2': [0, 0.732],
    'freq.0': [1.891, 5.226], 'freq.1': [1.466, 6.25], 'freq.2': [2.872, 8.172],
    'speed.0': [0.3, 0.843], 'orbit.0': [0, 1.5], 'orbit.1': [0, 0.7],
  };

  it('are the ones set on the debug panel: every draw inside, both ends reached', () => {
    const rng = createRng(3);
    const draws = Array.from({ length: 3000 }, () => drawKnobs(PLASMA_KNOBS, rng));
    for (const [key, [lo, hi]] of Object.entries(RANGES)) {
      const seen = draws.map((v) => v[key]!);
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...seen)).toBeLessThan(hi);
      expect(Math.min(...seen)).toBeLessThan(lo + (hi - lo) * 0.02);
      expect(Math.max(...seen)).toBeGreaterThan(hi - (hi - lo) * 0.02);
    }
  });
});

describe('tunnel parameters', () => {
  it('draw every whole number of sides from 2 to 9, and nothing else', () => {
    const rng = createRng(1);
    const seen = new Set(Array.from({ length: 2000 }, () => drawTunnelParams(rng).u_sides));
    expect(seen).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('draw whole ribs from 1 to 14, rings 0.481..2.058 apart and a twist of at most 0.313 either way', () => {
    const rng = createRng(2);
    const draws = Array.from({ length: 2000 }, () => drawTunnelParams(rng));
    expect(new Set(draws.map((p) => p.u_ribs))).toEqual(new Set(Array.from({ length: 14 }, (_, i) => i + 1)));
    for (const p of draws) {
      expect(p.u_ringGap as number).toBeGreaterThanOrEqual(0.481);
      expect(p.u_ringGap as number).toBeLessThan(2.058);
      expect(Math.abs(p.u_twist as number)).toBeLessThan(0.313);
    }
  });
});
