import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { drawWarpNoiseParams } from './warpNoise';

describe('drawWarpNoiseParams', () => {
  it('draws the same parameters for the same seed', () => {
    expect(drawWarpNoiseParams(createRng(5))).toEqual(drawWarpNoiseParams(createRng(5)));
  });

  it('draws different parameters for different seeds', () => {
    expect(drawWarpNoiseParams(createRng(5))).not.toEqual(drawWarpNoiseParams(createRng(6)));
  });

  it('stays in the soft ranges for any seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = drawWarpNoiseParams(createRng(seed));
      const scale = p.u_scale as number;
      const warp = p.u_warp as number;
      const [flow, warpSpeed] = p.u_speed as number[];
      expect(scale).toBeGreaterThanOrEqual(1.2);
      expect(scale).toBeLessThan(2.6);
      expect(warp).toBeGreaterThanOrEqual(2.5);
      expect(warp).toBeLessThan(4.5);
      expect(flow).toBeLessThan(0.09);
      expect(warpSpeed).toBeLessThan(0.12);
      // the palette swings at most 0.3 around a mid grey: no hard black or white
      for (const v of p.u_palA as number[]) expect(v).toBeGreaterThanOrEqual(0.5);
      for (const v of p.u_palB as number[]) expect(v).toBeLessThan(0.3);
    }
  });
});
