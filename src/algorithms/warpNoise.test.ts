import { describe, expect, it } from 'vitest';
import { drawBounds } from '../knobs';
import { createRng } from '../rng';
import { WARP_NOISE_KNOBS, WARP_NOISE_MOVING, drawWarpNoiseMoving, drawWarpNoiseParams } from './warpNoise';

/** The min and max of every random knob, and the value of the fixed one, as the debug panel's Copy gives them. */
const FILE: Record<string, [number, number] | number> = {
  scale: [3.553, 5.294], warp: [2.5, 3.664],
  'palA.0': [0.5, 0.64], 'palA.1': [0.5, 0.64], 'palA.2': [0.5, 0.64],
  'palB.0': [0.14, 0.432], 'palB.1': [0.14, 0.447], 'palB.2': [0.14, 0.447],
  palCBase: [1.233, 1.878], 'palCStep.0': [-0.158, 0.151], 'palCStep.1': [-0.151, 0.151], 'palCStep.2': [-0.17, 0.145],
  'palD.0': [0, 1], 'palD.1': [0, 1], 'palD.2': [0, 1],
  'speed.0': [0.03, 0.114], 'speed.1': [0.04, 0.12], 'offset.0': [0, 60], 'offset.1': [0, 60], 'offset2.0': [0, 60], 'offset2.1': [0, 0.5],
  rotate: [0, 0], 'A.kick': [0, 1], 'A.snare': [0, 1], 'A.crash': [0, 1], flashGain: 0.5,
};

describe('drawWarpNoiseParams', () => {
  it('draws the same parameters for the same seed', () => {
    expect(drawWarpNoiseParams(createRng(5))).toEqual(drawWarpNoiseParams(createRng(5)));
  });

  it('draws different parameters for different seeds', () => {
    expect(drawWarpNoiseParams(createRng(5))).not.toEqual(drawWarpNoiseParams(createRng(6)));
  });

  it('has exactly the knobs and the min and max set on the debug panel', () => {
    expect(WARP_NOISE_KNOBS.map((k) => k.key).sort()).toEqual(Object.keys(FILE).sort());
    for (const k of WARP_NOISE_KNOBS) expect(drawBounds(k.draw), k.key).toEqual(Array.isArray(FILE[k.key]) ? FILE[k.key] : [FILE[k.key], FILE[k.key]]);
  });

  it('stays in the ranges for any seed', () => {
    for (let seed = 0; seed < 200; seed++) {
      const p = drawWarpNoiseParams(createRng(seed));
      const scale = p.u_scale as number;
      const warp = p.u_warp as number;
      const [flow, warpSpeed] = p.u_speed as number[];
      expect(scale).toBeGreaterThanOrEqual(3.553);
      expect(scale).toBeLessThan(5.294);
      expect(warp).toBeGreaterThanOrEqual(2.5);
      expect(warp).toBeLessThan(3.664);
      expect(flow).toBeLessThan(0.114);
      expect(warpSpeed).toBeLessThan(0.12);
      expect(p.u_rotate).toBe(0);
      expect((p.u_offset2 as number[])[1]).toBeLessThan(0.5);
      // the palette swings at most 0.447 around a middle of at least 0.5: it stays inside 0.05..1.09
      for (const v of p.u_palA as number[]) expect(v).toBeGreaterThanOrEqual(0.5);
      for (const v of p.u_palB as number[]) expect(v).toBeLessThan(0.447);
    }
  });
});

describe('the noise\'s moving values', () => {
  it('are one list, warp and offset2.1, picking both', () => {
    expect(WARP_NOISE_MOVING).toEqual([{ pick: 2, entries: ['warp', 'offset2.1'] }]);
  });

  it('move warp and offset2.1 always, and nothing else', () => {
    const rng = createRng(12);
    for (let i = 0; i < 100; i++) expect(drawWarpNoiseMoving(rng).map((m) => m.key).sort()).toEqual(['offset2.1', 'warp']);
  });

  it('move each inside the bounds the noise draws it from, with a voice and a walk of its own', () => {
    const rng = createRng(13);
    for (let i = 0; i < 100; i++) {
      const moving = drawWarpNoiseMoving(rng);
      expect(new Set(moving.map((m) => m.walk)).size).toBe(2);
      for (const m of moving) {
        const draw = WARP_NOISE_KNOBS.find((k) => k.key === m.key)!.draw;
        if (draw.kind !== 'range') throw new Error('not a range');
        expect([m.min, m.max]).toEqual([draw.min, draw.max]);
        expect(['kick', 'snare', 'crash']).toContain(m.voice);
      }
    }
  });
});
