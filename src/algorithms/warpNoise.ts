import type { AlgorithmDef } from '../algorithm';
import { drawKnobs, fixed, range, sign, triple, vec, type Knob, type Values } from '../knobs';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './warpNoise.frag?raw';

export const WARP_NOISE_NAME = 'domain-warped-noise';

/** This run's own look: palette, scale, speeds, offsets and warp strength. palC is one base plus a small step per channel. */
export const WARP_NOISE_KNOBS: readonly Knob[] = [
  ...triple('palA', 0.5, 0.64, [0, 1]),
  ...triple('palB', 0.14, 0.3, [0, 1]),
  range('palCBase', 0.6, 1.1, [0, 3]),
  ...triple('palCStep', -0.15, 0.15, [-0.6, 0.6]),
  ...triple('palD', 0, 1, [0, 1]),
  range('scale', 1.2, 2.6, [0.4, 6]),
  range('speed.0', 0.03, 0.09, [0, 0.3]),
  range('speed.1', 0.04, 0.12, [0, 0.36]),
  range('offset.0', 0, 60, [0, 60]),
  range('offset.1', 0, 60, [0, 60]),
  range('offset2.0', 0, 60, [0, 60]),
  range('offset2.1', 0, 60, [0, 60]),
  range('warp', 2.5, 4.5, [0, 8]),
  sign('rotateSign'),
  range('rotate', 0.008, 0.03, [0, 0.1]),
  // fixed in code: how the picture follows the beat (set on the debug panel)
  fixed('beatBreath', 0.1, [0, 1]),
  fixed('barBreath', 0.18, [0, 1]),
  fixed('beatColour', 0.06, [0, 0.5]),
  fixed('barColour', 0.15, [0, 0.5]),
  fixed('beatLight', 0.09, [0, 1]),
  fixed('barLight', 0.06, [0, 1]),
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
    u_rotate: v.rotateSign! * v.rotate!,
    u_beatBreath: v.beatBreath!,
    u_barBreath: v.barBreath!,
    u_beatColour: v.beatColour!,
    u_barColour: v.barColour!,
    u_beatLight: v.beatLight!,
    u_barLight: v.barLight!,
  };
}

export const drawWarpNoiseParams = (rng: Rng): ShaderParams => warpNoiseParams(drawKnobs(WARP_NOISE_KNOBS, rng));

export const warpNoise: AlgorithmDef = {
  name: WARP_NOISE_NAME,
  home: 0.15,
  strobe: 'snare',
  knobs: WARP_NOISE_KNOBS,
  create: (gl, values) => shaderAlgorithm(gl, WARP_NOISE_NAME, source, warpNoiseParams, values),
};
