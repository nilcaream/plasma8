import type { AlgorithmDef } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, range, triple, vec, type Knob, type Values } from '../knobs';
import { drawMoving, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './warpNoise.frag?raw';

export const WARP_NOISE_NAME = 'domain-warped-noise';

/** This run's own look: palette, scale, speeds, offsets and warp strength. palC is one base plus a small step per channel. */
export const WARP_NOISE_KNOBS: readonly Knob[] = [
  ...triple('palA', 0.5, 0.64, [0, 1]),
  range('palB.0', 0.14, 0.432, [0, 1]),
  range('palB.1', 0.14, 0.447, [0, 1]),
  range('palB.2', 0.14, 0.447, [0, 1]),
  range('palCBase', 0.696, 1.215, [0, 3]),
  range('palCStep.0', -0.158, 0.151, [-0.6, 0.6]),
  range('palCStep.1', -0.151, 0.151, [-0.6, 0.6]),
  range('palCStep.2', -0.17, 0.145, [-0.6, 0.6]),
  ...triple('palD', 0, 1, [0, 1]),
  range('scale', 1.402, 3.138, [0.4, 6]),
  range('speed.0', 0.033, 0.115, [0, 0.3]),
  range('speed.1', 0.04, 0.12, [0, 0.36]),
  range('offset.0', 0, 60, [0, 60]),
  range('offset.1', 0, 60, [0, 60]),
  range('offset2.0', 0, 60, [0, 60]),
  range('offset2.1', 0, 60, [0, 60]),
  range('warp', 2.5, 4.5, [0, 8]),
  range('rotate', -0.03, 0.03, [-0.1, 0.1]),
  // how hard each beat voice flashes this run: the only thing that follows the beat
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
 * The values that may move, in three groups of what they change on screen; an
 * instance moves one value from each of 2 to 3 groups. The flow and warp speeds
 * and the turn multiply the running time, so a change would jump the picture,
 * and the offsets are the picture's own place in the noise, so a change would
 * swap it for another: none of them move.
 */
export const WARP_NOISE_MOVING_GROUPS: readonly (readonly string[])[] = [
  ['scale', 'warp'], // shape
  ['palA.0', 'palA.1', 'palA.2', 'palB.0', 'palB.1', 'palB.2'], // colour tone
  ['palCBase', 'palCStep.0', 'palCStep.1', 'palCStep.2', 'palD.0', 'palD.1', 'palD.2'], // colour pattern
];
export const WARP_NOISE_MOVING_COUNT = [2, 3] as const;

const boundsOf = (key: string): [number, number] => drawBounds(WARP_NOISE_KNOBS.find((k) => k.key === key)!.draw);

export const drawWarpNoiseMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawMoving(WARP_NOISE_MOVING_GROUPS, bounds, rng, WARP_NOISE_MOVING_COUNT);

export const warpNoise: AlgorithmDef = {
  name: WARP_NOISE_NAME,
  home: 0.15,
  knobs: WARP_NOISE_KNOBS,
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, WARP_NOISE_NAME, source, warpNoiseParams, values, relativeAmountsOf, options?.moves === false ? [] : drawWarpNoiseMoving(rng, options?.bounds)),
};
