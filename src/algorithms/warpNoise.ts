import type { AlgorithmDef } from '../algorithm';
import type { Rng } from '../rng';
import { ShaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './warpNoise.frag?raw';

export const WARP_NOISE_NAME = 'domain-warped-noise';

/** Draws this run's own look: palette, scale, speeds, offsets and warp strength. */
export function drawWarpNoiseParams(rng: Rng): ShaderParams {
  const triple = (min: number, max: number): number[] => [rng.range(min, max), rng.range(min, max), rng.range(min, max)];
  const base = rng.range(0.6, 1.1);
  const side = () => (rng.next() < 0.5 ? -1 : 1);
  return {
    u_palA: triple(0.5, 0.64),
    u_palB: triple(0.14, 0.3),
    u_palC: [base + rng.range(-0.15, 0.15), base + rng.range(-0.15, 0.15), base + rng.range(-0.15, 0.15)],
    u_palD: triple(0, 1),
    u_scale: rng.range(1.2, 2.6),
    u_speed: [rng.range(0.03, 0.09), rng.range(0.04, 0.12)],
    u_offset: [rng.range(0, 60), rng.range(0, 60)],
    u_offset2: [rng.range(0, 60), rng.range(0, 60)],
    u_warp: rng.range(2.5, 4.5),
    u_rotate: side() * rng.range(0.008, 0.03),
  };
}

export const warpNoise: AlgorithmDef = {
  name: WARP_NOISE_NAME,
  create: (gl, rng) => new ShaderAlgorithm(gl, WARP_NOISE_NAME, source, drawWarpNoiseParams(rng)),
};
