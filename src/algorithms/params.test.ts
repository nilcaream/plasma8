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
  it('are round or a polygon of 4 to 8 sides', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect([0, 4, 5, 6, 8]).toContain(drawTunnelParams(createRng(seed)).u_sides);
    }
  });
});
