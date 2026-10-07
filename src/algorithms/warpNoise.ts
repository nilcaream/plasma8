import type { AlgorithmDef } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, range, triple, vec, type Knob, type Values } from '../knobs';
import { drawLists, listLabels, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './warpNoise.frag?raw';

export const WARP_NOISE_NAME = 'domain-warped-noise';

/**
 * This run's own look: palette, scale, speeds, offsets and warp strength. palC is one base plus a small step per channel.
 * Listed the way the debug panel shows them: the values that may move, in the
 * order of WARP_NOISE_MOVING; then the values that never move; then the beat voices.
 */
export const WARP_NOISE_KNOBS: readonly Knob[] = [
  // may move
  range('warp', 2.5, 3.664, [0, 8]),
  range('offset2.1', 0, 0.5, [0, 60]),
  // never move
  range('scale', 3.553, 5.294, [0.4, 6]),
  ...triple('palA', 0.5, 0.64, [0, 1]),
  range('palB.0', 0.14, 0.432, [0, 1]),
  range('palB.1', 0.14, 0.447, [0, 1]),
  range('palB.2', 0.14, 0.447, [0, 1]),
  range('palCBase', 1.233, 1.878, [0, 3]),
  range('palCStep.0', -0.158, 0.151, [-0.6, 0.6]),
  range('palCStep.1', -0.151, 0.151, [-0.6, 0.6]),
  range('palCStep.2', -0.17, 0.145, [-0.6, 0.6]),
  ...triple('palD', 0, 1, [0, 1]),
  range('speed.0', 0.03, 0.114, [0, 0.3]),
  range('speed.1', 0.04, 0.12, [0, 0.36]),
  range('offset.0', 0, 60, [0, 60]),
  range('offset.1', 0, 60, [0, 60]),
  range('offset2.0', 0, 60, [0, 60]),
  range('rotate', 0, 0, [-0.1, 0.1]),
  // how hard each beat voice flashes this run (the moving values follow the voices too)
  ...amountKnobs(),
  // fixed in code: the flash gain
  fixed('flashGain', 0.5, GAIN_RANGE, 'follows the beat'),
];

export function warpNoiseParams(v: Values): ShaderParams {
  return {
    u_palA: vec(v, 'palA'),
    u_palB: vec(v, 'palB'),
    u_palC: vec(v, 'palCStep').map((step) => v.palCBase! + step),
    u_palD: vec(v, 'palD'),
    u_scale: v.scale!,
    u_speed: vec(v, 'speed', 2),
    u_offset: vec(v, 'offset', 2),
    u_offset2: vec(v, 'offset2', 2),
    u_warp: v.warp!,
    u_rotate: v.rotate!,
    u_flashGain: v.flashGain!,
  };
}

export const drawWarpNoiseParams = (rng: Rng): ShaderParams => warpNoiseParams(drawKnobs(WARP_NOISE_KNOBS, rng));

/**
 * The values that may move: one list, and an instance moves 2 of its 2 entries,
 * so both always move. Nothing outside the list moves.
 */
export const WARP_NOISE_MOVING: readonly MovingList[] = [{ pick: 2, entries: ['warp', 'offset2.1'] }];

const KEYS = WARP_NOISE_KNOBS.map((k) => k.key);
const boundsOf = (key: string): [number, number] => drawBounds(WARP_NOISE_KNOBS.find((k) => k.key === key)!.draw);

export const drawWarpNoiseMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawLists(WARP_NOISE_MOVING, KEYS, bounds, rng);

export const warpNoise: AlgorithmDef = {
  name: WARP_NOISE_NAME,
  home: 0.15,
  steadySpeed: true,
  knobs: WARP_NOISE_KNOBS,
  movable: listLabels(WARP_NOISE_MOVING, KEYS),
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, WARP_NOISE_NAME, source, warpNoiseParams, values, relativeAmountsOf, options?.moves === false ? [] : drawWarpNoiseMoving(rng, options?.bounds)),
};
