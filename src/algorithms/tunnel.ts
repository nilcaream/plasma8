import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, int, range, sign, triple, vec, type Knob, type Values } from '../knobs';
import { drawMoving, type MovingGroup, type MovingValue } from '../moving';
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
  // where the far end sits on screen (uv); the tube bends to it
  range('farEnd.x', -0.26, 0.26, [-0.6, 0.6]),
  range('farEnd.y', -0.26, 0.26, [-0.6, 0.6]),
  // how hard each beat voice flashes this run: the only thing that follows the beat
  ...amountKnobs(),
  // fixed in code: the flash gain
  fixed('flashGain', 1, GAIN_RANGE, 'follows the beat'),
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
    u_farEnd: [v['farEnd.x']!, v['farEnd.y']!],
    u_flashGain: v.flashGain!,
  };
}

export const drawTunnelParams = (rng: Rng): ShaderParams => tunnelParams(drawKnobs(TUNNEL_KNOBS, rng));

/**
 * The spiral's and the colour drift's running sums. Both multiply the distance
 * dived, which grows for ever, so moving either would shift the picture by the
 * change times the whole dive; each sums its own (speed · time step · value now)
 * instead, and only the part that is spatial (p.z · value) follows the value at once.
 */
export function divePhases(): (v: Values, inputs: FrameInputs) => ShaderParams {
  let last: number | undefined;
  let twist = 0;
  let hue = 0;
  return (v, inputs) => {
    const dive = last === undefined ? 0 : Math.max(0, inputs.time - last) * v.speed!;
    last = inputs.time;
    twist += dive * v.twistSign! * v.twist!;
    hue += dive * v.hueDrift!;
    return { u_twistPhase: twist, u_huePhase: hue };
  };
}

/**
 * The values that may move, in four groups of what they change on screen; an
 * instance moves one entry from each of 2 to 4 groups. The far end's two
 * coordinates move together. ringGap (moving it reads as speed), the dive speed,
 * the number of sides and ribs and the twist's sign never move.
 */
export const TUNNEL_MOVING_GROUPS: readonly MovingGroup[] = [
  [['farEnd.x', 'farEnd.y']], // far end
  ['twist'], // spiral
  ['palA.0', 'palA.1', 'palA.2', 'palB.0', 'palB.1', 'palB.2'], // colour tone
  ['palC.0', 'palC.1', 'palC.2', 'palD.0', 'palD.1', 'palD.2', 'hueDrift'], // colour pattern
];
export const TUNNEL_MOVING_COUNT = [2, 4] as const;

const boundsOf = (key: string): [number, number] => drawBounds(TUNNEL_KNOBS.find((k) => k.key === key)!.draw);

export const drawTunnelMoving = (rng: Rng): MovingValue[] => drawMoving(TUNNEL_MOVING_GROUPS, boundsOf, rng, TUNNEL_MOVING_COUNT);

export const tunnel: AlgorithmDef = {
  name: TUNNEL_NAME,
  home: 0.9,
  knobs: TUNNEL_KNOBS,
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, TUNNEL_NAME, source, tunnelParams, values, relativeAmountsOf, options?.moves === false ? [] : drawTunnelMoving(rng), divePhases()),
};
