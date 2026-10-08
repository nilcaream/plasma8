import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, int, range, triple, vec, type Knob, type Values } from '../knobs';
import { drawLists, listLabels, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './tunnel.frag?raw';

export const TUNNEL_NAME = 'tunnel';

/**
 * This run's own look: palette, cross-section, dive speed, ring and rib
 * spacing. The speed range is narrow, so the intensity, not the draw, says how
 * fast the dive goes. The ranges are the ones chosen on the debug panel. The
 * beat only flashes the picture, by the beat voices.
 * Listed the way the debug panel shows them: the values that may move, list by
 * list in the order of TUNNEL_MOVING; then the values that never move; then the beat voices.
 */
export const TUNNEL_KNOBS: readonly Knob[] = [
  // may move: list 1
  ...triple('palD', 0, 1, [0, 1]),
  range('hueDrift', 0.024, 0.079, [0, 0.2]),
  // may move: list 2; the spiral, and the far end: where it sits on screen (uv), the tube bends to it
  range('twist', -0.5, 0.5, [-0.5, 0.5]),
  range('farEnd.x', -0.271, 0.271, [-0.6, 0.6]),
  range('farEnd.y', -0.271, 0.271, [-0.6, 0.6]),
  // never move
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.35, 0.5, [0, 1]),
  ...triple('palC', 0.6, 1.2, [0, 3]),
  // 2 sides is the round tube, 3..9 a polygon of that many sides
  int('sides', 2, 9, [0, 12]),
  range('speed', 1.136, 1.896, [0, 8]),
  range('ringGap', 0.481, 2.058, [0.2, 4]),
  int('ribs', 1, 14, [1, 32]),
  // how hard each beat voice flashes this run (the moving values follow the voices too)
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
    u_twist: v.twist!,
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
    twist += dive * v.twist!;
    hue += dive * v.hueDrift!;
    return { u_twistPhase: twist, u_huePhase: hue };
  };
}

/**
 * The values that may move: two lists, each drawn on its own. An instance moves
 * 2 of 2 of palD (all three of its values) and the hue drift, and 2 of 2 of the
 * twist and the far end (both coordinates): all of them, every time.
 * Nothing outside the lists moves.
 */
export const TUNNEL_MOVING: readonly MovingList[] = [
  { pick: 2, entries: ['palD', 'hueDrift'] },
  { pick: 2, entries: ['twist', 'farEnd'] },
];

const KEYS = TUNNEL_KNOBS.map((k) => k.key);
const boundsOf = (key: string): [number, number] => drawBounds(TUNNEL_KNOBS.find((k) => k.key === key)!.draw);

export const drawTunnelMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawLists(TUNNEL_MOVING, KEYS, bounds, rng);

export const tunnel: AlgorithmDef = {
  name: TUNNEL_NAME,
  home: 0.9,
  steadySpeed: true,
  knobs: TUNNEL_KNOBS,
  movable: listLabels(TUNNEL_MOVING, KEYS),
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, TUNNEL_NAME, source, tunnelParams, values, relativeAmountsOf, drawTunnelMoving(rng, options?.bounds), divePhases()),
};
