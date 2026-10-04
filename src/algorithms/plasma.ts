import type { AlgorithmDef } from '../algorithm';
import { drawKnobs, range, int, sign, triple, unit, vec, type Knob, type Values } from '../knobs';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './plasma.frag?raw';

export const PLASMA_NAME = 'plasma';

const TAU = 2 * Math.PI;

/** This run's own look: palette, wave directions and frequencies, speeds, swirl, mode. */
export const PLASMA_KNOBS: readonly Knob[] = [
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.3, 0.45, [0, 1]),
  ...triple('palC', 0.6, 1.4, [0, 3]),
  ...triple('palD', 0, 1, [0, 1]),
  range('dir1', 0, TAU, [0, TAU]),
  range('dir2', 0, TAU, [0, TAU]),
  range('freq.0', 2, 5, [0.5, 12]),
  range('freq.1', 2, 5, [0.5, 12]),
  range('freq.2', 3, 8, [0.5, 16]),
  range('speed.0', 0.3, 0.9, [0, 2.5]),
  range('speed.1', 0.3, 0.9, [0, 2.5]),
  range('speed.2', 0.4, 1.1, [0, 3]),
  range('speed.3', 0.2, 0.8, [0, 2.5]),
  range('orbit.0', 0.2, 0.7, [0, 1.5]),
  range('orbit.1', 0.2, 0.7, [0, 1.5]),
  range('scale', 0.9, 1.8, [0.3, 4]),
  sign('swirlSign'),
  range('swirl', 0, 1.2, [0, 3]),
  int('mode', 0, 2, [0, 2]),
  range('cycles', 0.6, 1.3, [0.1, 3]),
  sign('barShiftSign'),
  range('barShift', 0.12, 0.3, [0, 0.6]),
];

export function plasmaParams(v: Values): ShaderParams {
  return {
    u_palA: vec(v, 'palA'),
    u_palB: vec(v, 'palB'),
    u_palC: vec(v, 'palC'),
    u_palD: vec(v, 'palD'),
    u_dir1: unit(v.dir1!),
    u_dir2: unit(v.dir2!),
    u_freq: vec(v, 'freq'),
    u_speed: vec(v, 'speed', 4),
    u_orbit: vec(v, 'orbit', 2),
    u_scale: v.scale!,
    u_swirl: v.swirlSign! * v.swirl!,
    u_mode: v.mode!,
    u_cycles: v.cycles!,
    u_barShift: v.barShiftSign! * v.barShift!,
  };
}

export const drawPlasmaParams = (rng: Rng): ShaderParams => plasmaParams(drawKnobs(PLASMA_KNOBS, rng));

export const plasma: AlgorithmDef = {
  name: PLASMA_NAME,
  home: 0.35,
  strobe: 'snare',
  knobs: PLASMA_KNOBS,
  create: (gl, values) => shaderAlgorithm(gl, PLASMA_NAME, source, plasmaParams, values),
};
