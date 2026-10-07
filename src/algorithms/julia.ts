import type { AlgorithmDef } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, int, range, triple, vec, type Knob, type Values } from '../knobs';
import { drawMoving, groupNames, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './julia.frag?raw';

export const JULIA_NAME = 'julia-kaleidoscope';

const TAU = 2 * Math.PI;

/** This run's own look: palette, wedges, where c sits and how it drifts, zoom, centre, spin. */
export const JULIA_KNOBS: readonly Knob[] = [
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.35, 0.5, [0, 1]),
  ...triple('palC', 0.7, 1.3, [0, 3]),
  ...triple('palD', 0, 1, [0, 1]),
  range('centreAngle', 0, TAU, [0, TAU]),
  range('centreOff', 0, 0.353, [0, 1]),
  int('segments', 3, 9, [1, 16]),
  range('theta', 1.093, 5.391, [0, TAU]),
  range('edge', 0.994, 1.15, [0.8, 1.15]),
  range('wander', 0, 0.126, [0, 0.4]),
  range('zoom', 1.311, 1.8, [0.4, 4]),
  range('spin', -0.05, 0.05, [-0.2, 0.2]),
  range('bands', 1.5, 5.101, [0.3, 10]),
  // how hard each beat voice flashes this run (the moving values follow the voices too)
  ...amountKnobs(),
  // fixed in code: the flash gain, the glow's strength and how fast c drifts
  fixed('flashGain', 0.5, GAIN_RANGE, 'follows the beat'),
  fixed('glow', 0.263, [0, 1], 'look'),
  fixed('wanderSpeed', 0.221, [0, 1], 'moves with time'),
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
    u_zoom: v.zoom!,
    u_center: [v.centreOff! * Math.cos(v.centreAngle!), v.centreOff! * Math.sin(v.centreAngle!)],
    u_spin: v.spin!,
    u_bands: v.bands!,
    u_flashGain: v.flashGain!,
    u_glow: v.glow!,
    u_wanderSpeed: v.wanderSpeed!,
  };
}

export const drawJuliaParams = (rng: Rng): ShaderParams => juliaParams(drawKnobs(JULIA_KNOBS, rng));

/**
 * The values that may move, in three groups of what they change on screen; an
 * instance moves one value from each of the 3 groups, so the centre offset
 * always moves. The spin and the wander speed multiply the running time, the
 * palette frequency multiplies a growing number, the wedge count is whole and
 * the centre's angle whips round a circle: none of them move. Nor do theta, the
 * zoom and the colour tone (palA, palB): they stay as drawn.
 */
export const JULIA_MOVING_GROUPS: readonly (readonly string[])[] = [
  ['edge', 'wander'], // shape of the set
  ['centreOff'], // framing
  ['palD.0', 'palD.1', 'palD.2', 'bands'], // colour pattern
];
export const JULIA_MOVING_COUNT = [3, 3] as const;

const boundsOf = (key: string): [number, number] => drawBounds(JULIA_KNOBS.find((k) => k.key === key)!.draw);

export const drawJuliaMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawMoving(JULIA_MOVING_GROUPS, bounds, rng, JULIA_MOVING_COUNT);

/** What each of the groups changes on screen, in the order of JULIA_MOVING_GROUPS. */
export const JULIA_MOVING_NAMES = ['shape of the set', 'framing', 'colour pattern'] as const;

export const julia: AlgorithmDef = {
  name: JULIA_NAME,
  home: 0.65,
  steadySpeed: true,
  knobs: JULIA_KNOBS,
  movable: groupNames(JULIA_MOVING_GROUPS, JULIA_MOVING_NAMES),
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, JULIA_NAME, source, juliaParams, values, relativeAmountsOf, options?.moves === false ? [] : drawJuliaMoving(rng, options?.bounds)),
};
