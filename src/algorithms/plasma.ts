import type { AlgorithmDef } from '../algorithm';
import type { Rng } from '../rng';
import { ShaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './plasma.frag?raw';

export const PLASMA_NAME = 'plasma';

function unit(rng: Rng): number[] {
  const a = rng.range(0, 2 * Math.PI);
  return [Math.cos(a), Math.sin(a)];
}

/** Draws this run's own look: palette, wave directions and frequencies, speeds, swirl, mode. */
export function drawPlasmaParams(rng: Rng): ShaderParams {
  const triple = (min: number, max: number): number[] => [rng.range(min, max), rng.range(min, max), rng.range(min, max)];
  const sign = (): number => (rng.next() < 0.5 ? -1 : 1);
  return {
    u_palA: triple(0.45, 0.6),
    u_palB: triple(0.3, 0.45),
    u_palC: triple(0.6, 1.4),
    u_palD: triple(0, 1),
    u_dir1: unit(rng),
    u_dir2: unit(rng),
    u_freq: [rng.range(2, 5), rng.range(2, 5), rng.range(3, 8)],
    u_speed: [rng.range(0.3, 0.9), rng.range(0.3, 0.9), rng.range(0.4, 1.1), rng.range(0.2, 0.8)],
    u_orbit: [rng.range(0.2, 0.7), rng.range(0.2, 0.7)],
    u_scale: rng.range(0.9, 1.8),
    u_swirl: sign() * rng.range(0, 1.2),
    u_mode: Math.floor(rng.next() * 3),
    u_cycles: rng.range(0.6, 1.3),
    u_barShift: sign() * rng.range(0.12, 0.3),
  };
}

export const plasma: AlgorithmDef = {
  name: PLASMA_NAME,
  home: 0.35,
  strobe: 'snare',
  create: (gl, rng) => new ShaderAlgorithm(gl, PLASMA_NAME, source, drawPlasmaParams(rng)),
};
