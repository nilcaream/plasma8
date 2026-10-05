import type { AlgorithmDef } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawKnobs, fixed, int, range, sign, triple, vec, type Knob, type Values } from '../knobs';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './tunnel.frag?raw';

export const TUNNEL_NAME = 'tunnel';

/**
 * This run's own look: palette, cross-section, dive speed, ring and rib
 * spacing. The speed range is narrow, so the intensity, not the draw, says how
 * fast the dive goes. The ranges are the ones chosen on the debug panel. The
 * beat only flashes the picture, by the beat voices.
 */
export const TUNNEL_KNOBS: readonly Knob[] = [
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.35, 0.5, [0, 1]),
  ...triple('palC', 0.6, 1.2, [0, 3]),
  ...triple('palD', 0, 1, [0, 1]),
  // 2 is the round tube, 3..9 a polygon of that many sides
  int('sides', 2, 9, [0, 12]),
  range('speed', 2, 3, [0, 8]),
  range('ringGap', 0.481, 2.058, [0.2, 4]),
  int('ribs', 1, 14, [1, 32]),
  sign('twistSign'),
  range('twist', 0, 0.313, [0, 0.5]),
  range('hueDrift', 0.01, 0.05, [0, 0.2]),
  // how hard each beat voice flashes this run: the only thing that follows the beat
  ...amountKnobs(),
  // fixed in code: the flash gain
  fixed('flashGain', 0.5, GAIN_RANGE, 'follows the beat'),
];

export function tunnelParams(v: Values): ShaderParams {
  return {
    u_palA: vec(v, 'palA'),
    u_palB: vec(v, 'palB'),
    u_palC: vec(v, 'palC'),
    u_palD: vec(v, 'palD'),
    u_sides: v.sides!,
    u_speed: v.speed!,
    u_ringGap: v.ringGap!,
    u_ribs: v.ribs!,
    u_twist: v.twistSign! * v.twist!,
    u_hueDrift: v.hueDrift!,
    u_flashGain: v.flashGain!,
  };
}

export const drawTunnelParams = (rng: Rng): ShaderParams => tunnelParams(drawKnobs(TUNNEL_KNOBS, rng));

export const tunnel: AlgorithmDef = {
  name: TUNNEL_NAME,
  home: 0.9,
  knobs: TUNNEL_KNOBS,
  create: (gl, values) => shaderAlgorithm(gl, TUNNEL_NAME, source, tunnelParams, values, relativeAmountsOf),
};
