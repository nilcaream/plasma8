import type { AlgorithmDef } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, range, int, triple, unit, vec, type Knob, type Values } from '../knobs';
import { drawLists, listLabels, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './plasma.frag?raw';

export const PLASMA_NAME = 'plasma';

const TAU = 2 * Math.PI;

/**
 * This run's own look: palette, wave directions and frequencies, speeds, swirl, mode.
 * Listed the way the debug panel shows them: the values that may move, in the
 * order of PLASMA_MOVING; then the values that never move; then the beat voices.
 */
export const PLASMA_KNOBS: readonly Knob[] = [
  // may move
  range('freq.2', 4.979, 6.777, [0.5, 16]),
  range('orbit.0', 0.467, 0.883, [0, 1.5]),
  range('orbit.1', 0.892, 1.287, [0, 1.5]),
  range('freq.0', 1.891, 5.226, [0.5, 12]),
  range('freq.1', 1.466, 6.25, [0.5, 12]),
  range('cycles', 0.6, 1.3, [0.1, 3]),
  // never move
  range('scale', 1.099, 2.209, [0.3, 4]),
  range('swirl', -0.792, 0.726, [-3, 3]),
  range('dir1', 0, 6.277, [0, TAU]),
  range('dir2', 0, 6.283, [0, TAU]),
  range('palA.0', 0.089, 0.868, [0, 1]),
  range('palA.1', 0.211, 0.8, [0, 1]),
  range('palA.2', 0.226, 0.758, [0, 1]),
  range('palB.0', 0.395, 1, [0, 1]),
  range('palB.1', 0.405, 1, [0, 1]),
  range('palB.2', 0.411, 1, [0, 1]),
  ...triple('palC', 0.6, 1.4, [0, 3]),
  ...triple('palD', 0, 1, [0, 1]),
  range('speed.0', 0.3, 0.843, [0, 2.5]),
  range('speed.1', 0.3, 0.882, [0, 2.5]),
  range('speed.2', 0.4, 1.1, [0, 3]),
  range('speed.3', 0.2, 0.8, [0, 2.5]),
  int('mode', 0, 2, [0, 2]),
  // how hard each beat voice flashes this run (the moving values follow the voices too)
  ...amountKnobs(),
  // fixed in code: the flash gain, and how the field moves with time (set on the debug panel)
  fixed('flashGain', 1, GAIN_RANGE, 'follows the beat'),
  fixed('swirlSpin', 0.011, [0, 0.5], 'moves with time'),
  fixed('orbitSpeed', 0.02, [0, 4], 'moves with time'),
  fixed('colourDrift', 0.021, [0, 0.5], 'moves with time'),
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
    u_swirl: v.swirl!,
    u_mode: v.mode!,
    u_cycles: v.cycles!,
    u_flashGain: v.flashGain!,
    u_swirlSpin: v.swirlSpin!,
    u_orbitSpeed: v.orbitSpeed!,
    u_colourDrift: v.colourDrift!,
  };
}

export const drawPlasmaParams = (rng: Rng): ShaderParams => plasmaParams(drawKnobs(PLASMA_KNOBS, rng));

/**
 * The values that may move: one list, and an instance moves 3 of its 6 entries.
 * Nothing outside the list moves.
 */
export const PLASMA_MOVING: readonly MovingList[] = [{ pick: 3, entries: ['freq.2', 'orbit.0', 'orbit.1', 'freq.0', 'freq.1', 'cycles'] }];

const KEYS = PLASMA_KNOBS.map((k) => k.key);

/** A moving value's outer bounds: the range it is drawn from in code. */
const boundsOf = (key: string): [number, number] => drawBounds(PLASMA_KNOBS.find((k) => k.key === key)!.draw);

export const drawPlasmaMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawLists(PLASMA_MOVING, KEYS, bounds, rng);

export const plasma: AlgorithmDef = {
  name: PLASMA_NAME,
  home: 0.35,
  steadySpeed: true,
  knobs: PLASMA_KNOBS,
  movable: listLabels(PLASMA_MOVING, KEYS),
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, PLASMA_NAME, source, plasmaParams, values, relativeAmountsOf, drawPlasmaMoving(rng, options?.bounds)),
};
