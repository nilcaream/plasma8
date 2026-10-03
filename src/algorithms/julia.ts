import type { AlgorithmDef } from '../algorithm';
import type { Rng } from '../rng';
import { ShaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './julia.frag?raw';

export const JULIA_NAME = 'julia-kaleidoscope';

/** Draws this run's own look: palette, wedges, where c sits and how it moves, zoom, centre, spin. */
export function drawJuliaParams(rng: Rng): ShaderParams {
  const triple = (min: number, max: number): number[] => [rng.range(min, max), rng.range(min, max), rng.range(min, max)];
  const sign = (): number => (rng.next() < 0.5 ? -1 : 1);
  const centre = rng.range(0, 2 * Math.PI);
  const off = rng.range(0, 0.35);
  return {
    u_palA: triple(0.45, 0.6),
    u_palB: triple(0.35, 0.5),
    u_palC: triple(0.7, 1.3),
    u_palD: triple(0, 1),
    u_segments: Math.floor(rng.range(3, 10)),
    u_theta: rng.range(0, 2 * Math.PI),
    u_edge: rng.range(0.94, 1.02),
    u_wander: rng.range(0.03, 0.12),
    u_barTheta: sign() * rng.range(0.01, 0.04),
    u_zoom: rng.range(1.0, 1.8),
    u_center: [off * Math.cos(centre), off * Math.sin(centre)],
    u_spin: sign() * rng.range(0.01, 0.05),
    u_barTurn: sign() * (rng.next() < 0.5 ? 0.5 : 1),
    u_bands: rng.range(1.5, 4),
  };
}

export const julia: AlgorithmDef = {
  name: JULIA_NAME,
  home: 0.65,
  strobe: 'kick',
  create: (gl, rng) => new ShaderAlgorithm(gl, JULIA_NAME, source, drawJuliaParams(rng)),
};
