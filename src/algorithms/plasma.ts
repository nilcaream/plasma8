import type { AlgorithmDef } from '../algorithm';
import { DEFAULT_GAIN, GAIN_RANGE, amountKnobs, amountsOf } from '../beatVoices';
import { drawKnobs, fixed, range, int, sign, triple, unit, vec, type Knob, type Values } from '../knobs';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './plasma.frag?raw';

export const PLASMA_NAME = 'plasma';

const TAU = 2 * Math.PI;

/** This run's own look: palette, wave directions and frequencies, speeds, swirl, mode. */
export const PLASMA_KNOBS: readonly Knob[] = [
  range('palA.0', 0.089, 0.868, [0, 1]),
  range('palA.1', 0.211, 0.853, [0, 1]),
  range('palA.2', 0.226, 0.868, [0, 1]),
  range('palB.0', 0, 1, [0, 1]),
  range('palB.1', 0, 1, [0, 1]),
  range('palB.2', 0, 0.732, [0, 1]),
  ...triple('palC', 0.6, 1.4, [0, 3]),
  ...triple('palD', 0, 1, [0, 1]),
  range('dir1', 0, TAU, [0, TAU]),
  range('dir2', 0, TAU, [0, TAU]),
  range('freq.0', 1.891, 5.226, [0.5, 12]),
  range('freq.1', 1.466, 6.25, [0.5, 12]),
  range('freq.2', 2.872, 8.172, [0.5, 16]),
  range('speed.0', 0.3, 0.843, [0, 2.5]),
  range('speed.1', 0.3, 0.9, [0, 2.5]),
  range('speed.2', 0.4, 1.1, [0, 3]),
  range('speed.3', 0.2, 0.8, [0, 2.5]),
  range('orbit.0', 0, 1.5, [0, 1.5]),
  range('orbit.1', 0, 0.7, [0, 1.5]),
  range('scale', 0.9, 1.8, [0.3, 4]),
  sign('swirlSign'),
  range('swirl', 0, 1.2, [0, 3]),
  int('mode', 0, 2, [0, 2]),
  range('cycles', 0.6, 1.3, [0.1, 3]),
  // how hard each beat voice flashes this run: the only thing that follows the beat
  ...amountKnobs(),
  // fixed in code: the flash gain, and how the field moves with time (set on the debug panel)
  fixed('flashGain', DEFAULT_GAIN, GAIN_RANGE, 'follows the beat'),
  fixed('swirlSpin', 0, [0, 0.5], 'moves with time'),
  fixed('orbitSpeed', 0, [0, 4], 'moves with time'),
  fixed('colourDrift', 0, [0, 0.5], 'moves with time'),
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
    u_flashGain: v.flashGain!,
    u_swirlSpin: v.swirlSpin!,
    u_orbitSpeed: v.orbitSpeed!,
    u_colourDrift: v.colourDrift!,
  };
}

export const drawPlasmaParams = (rng: Rng): ShaderParams => plasmaParams(drawKnobs(PLASMA_KNOBS, rng));

export const plasma: AlgorithmDef = {
  name: PLASMA_NAME,
  home: 0.35,
  strobe: 'snare',
  knobs: PLASMA_KNOBS,
  create: (gl, values) => shaderAlgorithm(gl, PLASMA_NAME, source, plasmaParams, values, amountsOf),
};
