import type { AlgorithmDef } from '../algorithm';
import { beatSize } from '../envelope';
import { drawKnobs, int, pick, range, sign, triple, vec, type Knob, type Values } from '../knobs';
import type { Rng } from '../rng';
import { ShaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import { Swing, type SwingBeat } from '../swing';
import source from './tunnel.frag?raw';

export const TUNNEL_NAME = 'tunnel';

/**
 * This run's own look: palette, cross-section, dive speed, ring and rib
 * spacing. The speed range is narrow, so the intensity, not the draw, says how
 * fast the dive goes. The ranges are the ones chosen on the debug panel. The
 * far end swings on every beat (kick) or on every second one (snare), and each
 * of its layers goes round its own way.
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
  pick('swingSnare', [0, 1], [0, 1]),
  ...[0, 1, 2, 3].map((j) => sign(`swingWay.${j}`)),
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
  };
}

export const drawTunnelParams = (rng: Rng): ShaderParams => tunnelParams(drawKnobs(TUNNEL_KNOBS, rng));

const swingBeat = (v: Values): SwingBeat => (v.swingSnare! >= 0.5 ? 'snare' : 'kick');

export const tunnel: AlgorithmDef = {
  name: TUNNEL_NAME,
  home: 0.9,
  strobe: 'kick',
  knobs: TUNNEL_KNOBS,
  create: (gl, values, rng) => {
    const swing = new Swing(rng, swingBeat(values), vec(values, 'swingWay', 4));
    const shader = new ShaderAlgorithm(gl, TUNNEL_NAME, source, tunnelParams(values), (inputs) => ({
      u_farEnd: swing.update(inputs.beats, inputs.intensity),
      u_beatSize: beatSize(inputs.intensity),
    }));
    return {
      name: TUNNEL_NAME,
      draw: (target, inputs) => shader.draw(target, inputs),
      dispose: () => shader.dispose(),
      tune: (v) => {
        shader.tune(tunnelParams(v));
        swing.tune(swingBeat(v), vec(v, 'swingWay', 4));
      },
    };
  },
};
