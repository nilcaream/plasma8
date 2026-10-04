import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from '../rng';
import type { ShaderParams } from '../shaderAlgorithm';
import { drawJuliaParams } from './julia';
import { drawPlasmaParams } from './plasma';
import { drawTunnelParams } from './tunnel';

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
