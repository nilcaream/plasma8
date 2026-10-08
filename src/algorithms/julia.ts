import type { AlgorithmDef } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, int, range, triple, vec, type Knob, type Values } from '../knobs';
import { drawLists, listLabels, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './julia.frag?raw';

export const JULIA_NAME = 'julia-kaleidoscope';

const TAU = 2 * Math.PI;

/**
 * This run's own look: palette, wedges, where c sits and how it drifts, zoom, centre, spin.
 * Listed the way the debug panel shows them: the values that may move, list by
 * list in the order of JULIA_MOVING; then the values that never move; then the beat voices.
 */
export const JULIA_KNOBS: readonly Knob[] = [
  // may move: list 1
  ...triple('palD', 0, 1, [0, 1]),
  // may move: list 2
  range('edge', 0.994, 1.15, [0.8, 1.15]),
  range('wander', 0.034, 0.166, [0, 0.4]),
  range('centreOff', 0, 0.347, [0, 1]),
  range('centreAngle', 1.784, 3.902, [0, TAU]),
  // never move
  range('bands', 1.5, 5.101, [0.3, 10]),
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.35, 0.5, [0, 1]),
  ...triple('palC', 0.7, 1.3, [0, 3]),
  int('segments', 3, 9, [1, 16]),
  range('theta', 1.093, 5.391, [0, TAU]),
  range('zoom', 1.311, 1.8, [0.4, 4]),
  range('spin', -0.05, 0.05, [-0.2, 0.2]),
  // how hard each beat voice flashes this run (the moving values follow the voices too)
  ...amountKnobs(),
  // fixed in code: the flash gain, the glow's strength and how fast c drifts
  fixed('flashGain', 0.5, GAIN_RANGE, 'follows the beat'),
  fixed('glow', 0.216, [0, 1], 'look'),
  fixed('wanderSpeed', 0.1, [0, 1], 'moves with time'),
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
 * The values that may move: two lists, each drawn on its own. An instance moves
 * the palette frequency (palD, all three of its values), and 3 of the centre's
 * offset and angle, the wander and the edge. Nothing outside the lists moves.
 */
export const JULIA_MOVING: readonly MovingList[] = [
  { pick: 1, entries: ['palD'] },
  { pick: 3, entries: ['centreOff', 'centreAngle', 'wander', 'edge'] },
];

const KEYS = JULIA_KNOBS.map((k) => k.key);
const boundsOf = (key: string): [number, number] => drawBounds(JULIA_KNOBS.find((k) => k.key === key)!.draw);

export const drawJuliaMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawLists(JULIA_MOVING, KEYS, bounds, rng);

export const julia: AlgorithmDef = {
  name: JULIA_NAME,
  home: 0.65,
  steadySpeed: true,
  knobs: JULIA_KNOBS,
  movable: listLabels(JULIA_MOVING, KEYS),
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, JULIA_NAME, source, juliaParams, values, relativeAmountsOf, drawJuliaMoving(rng, options?.bounds)),
};
