import type { AlgorithmDef } from '../algorithm';
import { drawKnobs, int, pick, range, sign, triple, vec, type Knob, type Values } from '../knobs';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './julia.frag?raw';

export const JULIA_NAME = 'julia-kaleidoscope';

const TAU = 2 * Math.PI;

/** This run's own look: palette, wedges, where c sits and how it moves, zoom, centre, spin. */
export const JULIA_KNOBS: readonly Knob[] = [
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.35, 0.5, [0, 1]),
  ...triple('palC', 0.7, 1.3, [0, 3]),
  ...triple('palD', 0, 1, [0, 1]),
  range('centreAngle', 0, TAU, [0, TAU]),
  range('centreOff', 0, 0.35, [0, 1]),
  int('segments', 3, 9, [1, 16]),
  range('theta', 0, TAU, [0, TAU]),
  range('edge', 0.94, 1.02, [0.8, 1.15]),
  range('wander', 0.03, 0.12, [0, 0.4]),
  sign('barThetaSign'),
  range('barTheta', 0.01, 0.04, [0, 0.12]),
  range('zoom', 1.0, 1.8, [0.4, 4]),
  sign('spinSign'),
  range('spin', 0.01, 0.05, [0, 0.2]),
  sign('barTurnSign'),
  pick('barTurn', [0.5, 1], [0, 2], false),
  range('bands', 1.5, 4, [0.3, 10]),
];

export function juliaParams(v: Values): ShaderParams {
  return {
    u_palA: vec(v, 'palA'),
    u_palB: vec(v, 'palB'),
    u_palC: vec(v, 'palC'),
    u_palD: vec(v, 'palD'),
    u_segments: v.segments!,
    u_theta: v.theta!,
    u_edge: v.edge!,
    u_wander: v.wander!,
    u_barTheta: v.barThetaSign! * v.barTheta!,
    u_zoom: v.zoom!,
    u_center: [v.centreOff! * Math.cos(v.centreAngle!), v.centreOff! * Math.sin(v.centreAngle!)],
    u_spin: v.spinSign! * v.spin!,
    u_barTurn: v.barTurnSign! * v.barTurn!,
    u_bands: v.bands!,
  };
}

export const drawJuliaParams = (rng: Rng): ShaderParams => juliaParams(drawKnobs(JULIA_KNOBS, rng));

export const julia: AlgorithmDef = {
  name: JULIA_NAME,
  home: 0.65,
  strobe: 'kick',
  knobs: JULIA_KNOBS,
  create: (gl, values) => shaderAlgorithm(gl, JULIA_NAME, source, juliaParams, values),
};
