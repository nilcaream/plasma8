import { describe, expect, it } from 'vitest';
import { DEFAULT_GAIN, VOICE_NAMES, amountsOf, flash, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixedGroups } from '../knobs';
import { stepShape } from '../motion';
import { createRng, type Rng } from '../rng';
import type { ShaderParams } from '../shaderAlgorithm';
import { JULIA_KNOBS, drawJuliaParams, juliaParams } from './julia';
import { PLASMA_KNOBS, drawPlasmaParams, plasmaParams } from './plasma';
import plasmaSource from './plasma.frag?raw';
import { TUNNEL_KNOBS, drawTunnelParams, tunnelParams } from './tunnel';
import tunnelSource from './tunnel.frag?raw';
import { WARP_NOISE_KNOBS, warpNoiseParams } from './warpNoise';
import warpSource from './warpNoise.frag?raw';

const DRAWS: [string, (rng: Rng) => ShaderParams][] = [
  ['plasma', drawPlasmaParams],
  ['julia', drawJuliaParams],
  ['tunnel', drawTunnelParams],
];

describe.each(DRAWS)('%s parameters', (_name, draw) => {
  it('are the same for the same seed', () => {
    expect(draw(createRng(5))).toEqual(draw(createRng(5)));
  });

  it('differ from one draw to the next of one run', () => {
    const rng = createRng(5);
    expect(draw(rng)).not.toEqual(draw(rng));
  });

  it('are finite numbers or vectors of 2 to 4, for any seed', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const value of Object.values(draw(createRng(seed)))) {
        const parts = typeof value === 'number' ? [value] : value;
        expect(typeof value === 'number' || (parts.length >= 2 && parts.length <= 4)).toBe(true);
        for (const v of parts) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });
});

describe('julia parameters', () => {
  it('fold the plane into 3 to 9 whole wedges', () => {
    for (let seed = 0; seed < 100; seed++) {
      const n = drawJuliaParams(createRng(seed)).u_segments as number;
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(9);
    }
  });
});

describe('julia\'s fixed values', () => {
  it('are the ones set on the debug panel, its own bar-step shape among them', () => {
    const v = drawKnobs(JULIA_KNOBS, createRng(1));
    expect(stepShape(v)).toEqual({ sizeSoft: 0.021, sizeHard: 0.052, easeSoft: 0.793, easeHard: 0.227 });
    const p = juliaParams(v);
    expect([p.u_beatZoom, p.u_barZoom, p.u_beatLight, p.u_barLight, p.u_glow, p.u_colourShift, p.u_wanderSpeed])
      .toEqual([0.011, 0.029, 0.184, 0.089, 0.263, 0.056, 0.105]);
  });
});

describe('plasma\'s and warp noise\'s fixed values', () => {
  const PLASMA_FIXED = {
    u_flashGain: 0.5, u_swirlSpin: 0.011, u_orbitSpeed: 0.02, u_colourDrift: 0.021,
  };
  const WARP_FIXED = { u_flashGain: DEFAULT_GAIN };

  it('are plasma\'s as set on the debug panel, and warp noise\'s the beats page\'s gain', () => {
    const p = plasmaParams(drawKnobs(PLASMA_KNOBS, createRng(1)));
    for (const [key, value] of Object.entries(PLASMA_FIXED)) expect(p[key]).toBe(value);
    const w = warpNoiseParams(drawKnobs(WARP_NOISE_KNOBS, createRng(1)));
    for (const [key, value] of Object.entries(WARP_FIXED)) expect(w[key]).toBe(value);
  });

  it('are each read by the shader as a uniform', () => {
    for (const key of Object.keys(PLASMA_FIXED)) expect(plasmaSource).toContain(`uniform float ${key};`);
    for (const key of Object.keys(WARP_FIXED)) expect(warpSource).toContain(`uniform float ${key};`);
  });
});

describe('plasma\'s beat flash', () => {
  it('draws each voice\'s strength from 0 to 1, reaching both ends', () => {
    const rng = createRng(4);
    const draws = Array.from({ length: 3000 }, () => amountsOf(drawKnobs(PLASMA_KNOBS, rng)));
    for (const name of VOICE_NAMES) {
      const seen = draws.map((a) => a[name]);
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...seen)).toBeLessThan(1);
      expect(Math.min(...seen)).toBeLessThan(0.02);
      expect(Math.max(...seen)).toBeGreaterThan(0.98);
    }
  });

  it('takes each strength from its own knob', () => {
    expect(amountsOf({ 'A.kick': 0.1, 'A.snare': 0.2, 'A.crash': 0.3 })).toEqual({ kick: 0.1, snare: 0.2, crash: 0.3 });
  });

  it('scales the strengths by the largest, and keeps all-zero at zero', () => {
    expect(relativeAmountsOf({ 'A.kick': 0.2, 'A.snare': 0.1, 'A.crash': 0.05 })).toEqual({ kick: 1, snare: 0.5, crash: 0.25 });
    expect(relativeAmountsOf({ 'A.kick': 0, 'A.snare': 0, 'A.crash': 0 })).toEqual({ kick: 0, snare: 0, crash: 0 });
  });

  it('never flashes at intensity 0, whatever the strengths and the beat', () => {
    const rng = createRng(5);
    for (let i = 0; i < 50; i++) {
      const amounts = amountsOf(drawKnobs(PLASMA_KNOBS, rng));
      for (let beats = 0; beats < 8; beats += 0.05) expect(flash(beats, 0, amounts).total).toBe(0);
    }
  });

  it('has no bar step: no knob for it, and nothing in the shader reads one', () => {
    const keys = PLASMA_KNOBS.map((k) => k.key);
    expect(keys.filter((k) => /barShift|^step/.test(k))).toEqual([]);
    expect(plasmaSource).not.toContain('barStep');
    expect(plasmaSource).not.toContain('u_barShift');
  });

  it('shows the flash gain under "follows the beat" and the time terms under "moves with time"', () => {
    expect(fixedGroups(PLASMA_KNOBS).map((g) => [g.group, g.knobs.map((k) => k.key)])).toEqual([
      ['follows the beat', ['flashGain']],
      ['moves with time', ['swirlSpin', 'orbitSpeed', 'colourDrift']],
    ]);
  });

  it('has the shader read the gain, and no other beat or bar pulse', () => {
    expect(plasmaSource).toContain('u_flashGain * u_flash');
    expect(plasmaSource).toContain('u_flash');
    for (const gone of ['beatPulse', 'barPulse', 'u_beatLight', 'u_barLight', 'u_beatColour', 'u_beatBreath', 'u_barBreath']) {
      expect(plasmaSource).not.toContain(gone);
    }
  });
});

describe('warp noise\'s beat flash', () => {
  it('draws each voice\'s strength from 0 to 1, reaching both ends', () => {
    const rng = createRng(6);
    const draws = Array.from({ length: 3000 }, () => amountsOf(drawKnobs(WARP_NOISE_KNOBS, rng)));
    for (const name of VOICE_NAMES) {
      const seen = draws.map((a) => a[name]);
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...seen)).toBeLessThan(1);
      expect(Math.min(...seen)).toBeLessThan(0.02);
      expect(Math.max(...seen)).toBeGreaterThan(0.98);
    }
  });

  it('never flashes at intensity 0, and the shader has the flash alone for the beat', () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) {
      const amounts = amountsOf(drawKnobs(WARP_NOISE_KNOBS, rng));
      for (let beats = 0; beats < 8; beats += 0.05) expect(flash(beats, 0, amounts).total).toBe(0);
    }
    expect(warpSource).toContain('u_flashGain * u_flash');
    for (const gone of ['beatPulse', 'barPulse', 'barStep', 'u_beatLight', 'u_barLight', 'u_beatColour', 'u_barColour', 'u_beatBreath', 'u_barBreath']) {
      expect(warpSource).not.toContain(gone);
    }
  });

  it('shows the flash gain alone under "follows the beat"', () => {
    expect(fixedGroups(WARP_NOISE_KNOBS).map((g) => [g.group, g.knobs.map((k) => k.key)])).toEqual([['follows the beat', ['flashGain']]]);
  });
});

describe('plasma\'s random ranges', () => {
  const RANGES: Record<string, [number, number]> = {
    'palA.0': [0.089, 0.868], 'palA.1': [0.211, 0.853], 'palA.2': [0.226, 0.868],
    'palB.0': [0, 1], 'palB.1': [0, 1], 'palB.2': [0, 0.732],
    'freq.0': [1.891, 5.226], 'freq.1': [1.466, 6.25], 'freq.2': [2.872, 8.172],
    'speed.0': [0.3, 0.843], 'speed.1': [0.3, 0.882], 'orbit.0': [0, 1.5], 'orbit.1': [0, 0.7],
  };

  it('are the ones set on the debug panel: every draw inside, both ends reached', () => {
    const rng = createRng(3);
    const draws = Array.from({ length: 3000 }, () => drawKnobs(PLASMA_KNOBS, rng));
    for (const [key, [lo, hi]] of Object.entries(RANGES)) {
      const seen = draws.map((v) => v[key]!);
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...seen)).toBeLessThan(hi);
      expect(Math.min(...seen)).toBeLessThan(lo + (hi - lo) * 0.02);
      expect(Math.max(...seen)).toBeGreaterThan(hi - (hi - lo) * 0.02);
    }
  });
});

describe('signed values', () => {
  const ALL = [
    ['plasma', PLASMA_KNOBS], ['domain-warped-noise', WARP_NOISE_KNOBS], ['julia', JULIA_KNOBS], ['tunnel', TUNNEL_KNOBS],
  ] as const;

  it('are one range through zero each, with no sign knob left in any algorithm', () => {
    for (const [, knobs] of ALL) {
      expect(knobs.filter((k) => /Sign$/.test(k.key))).toEqual([]);
      expect(knobs.filter((k) => k.draw.kind === 'pick' && Math.min(...k.draw.values) === -1 && Math.max(...k.draw.values) === 1 && k.draw.values.length === 2)).toEqual([]);
    }
  });

  it.each([
    ['plasma', PLASMA_KNOBS, 'swirl', 1.2, 3],
    ['domain-warped-noise', WARP_NOISE_KNOBS, 'rotate', 0.03, 0.1],
    ['julia', JULIA_KNOBS, 'barTheta', 0.04, 0.12],
    ['julia', JULIA_KNOBS, 'spin', 0.05, 0.2],
    ['julia', JULIA_KNOBS, 'barTurn', 1, 2],
    ['tunnel', TUNNEL_KNOBS, 'twist', 0.5, 0.5],
  ] as const)('%s: %s is drawn from -M to M and tried from -X to X', (_name, knobs, key, m, x) => {
    const knob = knobs.find((k) => k.key === key)!;
    expect(drawBounds(knob.draw)).toEqual([-m, m]);
    expect(knob.wide).toEqual([-x, x]);
  });
});

describe('tunnel\'s beat flash', () => {
  it('has the flash gain 1 as a fixed value "follows the beat", read by the shader', () => {
    expect(tunnelParams(drawKnobs(TUNNEL_KNOBS, createRng(1))).u_flashGain).toBe(1);
    expect(fixedGroups(TUNNEL_KNOBS).map((g) => [g.group, g.knobs.map((k) => k.key)])).toEqual([['follows the beat', ['flashGain']]]);
    expect(tunnelSource).toContain('u_flashGain * u_flash');
    expect(drawKnobs(TUNNEL_KNOBS, createRng(2))).toHaveProperty('A.kick');
  });

  it('has no other beat- or bar-locked term: no far-end swing, bar step, bar wave or beat pulse', () => {
    expect(TUNNEL_KNOBS.map((k) => k.key).filter((k) => /swing|^step/.test(k))).toEqual([]);
    for (const old of ['u_beatSize', 'barStep', 'beatPulse', 'barPulse', 'u_barPhase', 'u_beatPhase', 'u_barSteps']) {
      expect(tunnelSource).not.toContain(old);
    }
  });
});

describe('tunnel parameters', () => {
  it('draw the dive speed from 1.136 to 1.896', () => {
    const rng = createRng(3);
    const speeds = Array.from({ length: 2000 }, () => drawTunnelParams(rng).u_speed as number);
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(1.136);
    expect(Math.max(...speeds)).toBeLessThan(1.896);
    expect(Math.min(...speeds)).toBeLessThan(1.15);
    expect(Math.max(...speeds)).toBeGreaterThan(1.88);
  });

  it('draw every whole number of sides from 2 to 9, and nothing else', () => {
    const rng = createRng(1);
    const seen = new Set(Array.from({ length: 2000 }, () => drawTunnelParams(rng).u_sides));
    expect(seen).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('draw whole ribs from 1 to 14, rings 0.481..2.058 apart and a twist of at most 0.5 either way, and a hue drift of 0.024..0.079', () => {
    const rng = createRng(2);
    const draws = Array.from({ length: 2000 }, () => drawTunnelParams(rng));
    expect(new Set(draws.map((p) => p.u_ribs))).toEqual(new Set(Array.from({ length: 14 }, (_, i) => i + 1)));
    for (const p of draws) {
      expect(p.u_ringGap as number).toBeGreaterThanOrEqual(0.481);
      expect(p.u_ringGap as number).toBeLessThan(2.058);
      expect(Math.abs(p.u_twist as number)).toBeLessThan(0.5);
      expect(p.u_hueDrift as number).toBeGreaterThanOrEqual(0.024);
      expect(p.u_hueDrift as number).toBeLessThan(0.079);
    }
  });
});
