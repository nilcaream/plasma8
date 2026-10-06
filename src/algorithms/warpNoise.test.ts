import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { WARP_NOISE_KNOBS, WARP_NOISE_MOVING_COUNT, WARP_NOISE_MOVING_GROUPS, drawWarpNoiseMoving, drawWarpNoiseParams } from './warpNoise';

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

describe('the noise\'s moving values', () => {
  const NEVER = ['speed.0', 'speed.1', 'rotate', 'offset.0', 'offset.1', 'offset2.0', 'offset2.1', 'flashGain', 'A.kick', 'A.snare', 'A.crash'];

  it('name three groups of 2, 6 and 7 values, all knobs of the noise, and never a time multiplier or an offset', () => {
    expect(WARP_NOISE_MOVING_GROUPS.map((g) => g.length)).toEqual([2, 6, 7]);
    const keys = WARP_NOISE_KNOBS.map((k) => k.key);
    for (const key of WARP_NOISE_MOVING_GROUPS.flat()) {
      expect(keys).toContain(key);
      expect(NEVER).not.toContain(key);
      expect(WARP_NOISE_KNOBS.find((k) => k.key === key)!.draw.kind).toBe('range');
    }
    expect(new Set(WARP_NOISE_MOVING_GROUPS.flat()).size).toBe(15);
  });

  it('move one value from each of 2 to 3 different groups, and reach every value', () => {
    expect(WARP_NOISE_MOVING_COUNT).toEqual([2, 3]);
    const rng = createRng(12);
    const counts = new Set<number>();
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const keys = drawWarpNoiseMoving(rng).map((m) => m.key);
      keys.forEach((k) => seen.add(k));
      const groups = WARP_NOISE_MOVING_GROUPS.filter((g) => g.some((k) => keys.includes(k)));
      counts.add(groups.length);
      for (const g of groups) expect(g.filter((k) => keys.includes(k)).length).toBe(1);
      expect(keys.length).toBe(groups.length);
    }
    expect([...counts].sort()).toEqual([2, 3]);
    expect([...seen].sort()).toEqual([...WARP_NOISE_MOVING_GROUPS.flat()].sort());
  });

  it('move a value inside the bounds the noise draws it from, with a voice', () => {
    const rng = createRng(13);
    for (let i = 0; i < 100; i++) {
      for (const m of drawWarpNoiseMoving(rng)) {
        const draw = WARP_NOISE_KNOBS.find((k) => k.key === m.key)!.draw;
        if (draw.kind !== 'range') throw new Error('not a range');
        expect([m.lo, m.hi]).toEqual([draw.min, draw.max]);
        expect(['kick', 'snare', 'crash']).toContain(m.voice);
      }
    }
  });
});
