import type { AlgorithmDef } from '../algorithm';
import type { Rng } from '../rng';
import { ShaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import { Swing } from '../swing';
import source from './tunnel.frag?raw';

export const TUNNEL_NAME = 'tunnel';

/** Draws this run's own look: palette, cross-section, path, dive speed, ring and rib spacing, roll. */
export function drawTunnelParams(rng: Rng): ShaderParams {
  const triple = (min: number, max: number): number[] => [rng.range(min, max), rng.range(min, max), rng.range(min, max)];
  const sign = (): number => (rng.next() < 0.5 ? -1 : 1);
  return {
    u_palA: triple(0.45, 0.6),
    u_palB: triple(0.35, 0.5),
    u_palC: triple(0.6, 1.2),
    u_palD: triple(0, 1),
    u_sides: rng.pick([0, 0, 4, 5, 6, 8]),
    u_bend: [rng.range(0.3, 1.2), rng.range(0.3, 1.2)],
    u_bendFreq: [rng.range(0.08, 0.22), rng.range(0.08, 0.22)],
    u_speed: rng.range(1.5, 3.5),
    u_ringGap: rng.range(0.6, 1.6),
    u_ribs: Math.floor(rng.range(4, 17)),
    u_twist: sign() * rng.range(0, 0.25),
    u_roll: sign() * rng.range(0, 0.15),
    u_barRoll: sign() * rng.range(0.15, 0.5),
    u_hueDrift: rng.range(0.01, 0.05),
  };
}

export const tunnel: AlgorithmDef = {
  name: TUNNEL_NAME,
  home: 0.9,
  strobe: 'kick',
  create: (gl, rng) => {
    const params = drawTunnelParams(rng);
    // the far end swings on every beat or on every second one, drawn each time the tunnel comes up
    const swing = new Swing(rng, rng.next() < 0.5 ? 'kick' : 'snare');
    return new ShaderAlgorithm(gl, TUNNEL_NAME, source, params, (inputs) => ({
      u_aim: swing.update(inputs.beats, inputs.intensity),
    }));
  },
};
