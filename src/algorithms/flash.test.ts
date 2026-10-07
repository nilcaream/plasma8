import { describe, expect, it } from 'vitest';
import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { drawKnobs } from '../knobs';
import { createRng } from '../rng';
import { RandomWalk } from '../randomWalk';
import { shaderAlgorithm } from '../shaderAlgorithm';
import { julia } from './julia';
import { plasma, plasmaParams } from './plasma';
import plasmaSource from './plasma.frag?raw';
import { tunnel } from './tunnel';
import { warpNoise } from './warpNoise';

/** A stand-in WebGL context that accepts everything and records the one-float uniforms by name. */
function mockGl(): { gl: WebGL2RenderingContext; floats: Map<string, number> } {
  const floats = new Map<string, number>();
  const methods: Record<string, unknown> = {
    getUniformLocation: (_program: unknown, name: string) => ({ name }),
    uniform1f: (location: { name: string } | null, value: number) => {
      if (location) floats.set(location.name, value);
    },
    getShaderParameter: () => true,
    getProgramParameter: () => true,
  };
  const gl = new Proxy({} as object, {
    get: (_t, key: string) => methods[key] ?? (() => ({})),
  }) as WebGL2RenderingContext;
  return { gl, floats };
}

const frame = (beats: number, strobe: number, intensity: number, bpm: number): FrameInputs => ({
  time: 1, beatPhase: 0, barPhase: 0, beatPulse: 0, barPulse: 0, beats, intensity, strobe, bpm, width: 64, height: 36,
});

/** The flash an algorithm sends to its shader at a position, with every voice at full strength. */
function flashOn(def: AlgorithmDef, beats: number, strobe: number, intensity = 0.5, bpm = 120): number | undefined {
  const { gl, floats } = mockGl();
  const values = drawKnobs(def.knobs, createRng(1));
  Object.assign(values, { 'A.kick': 1, 'A.snare': 1, 'A.crash': 1 });
  def.create(gl, values, createRng(2)).draw(null, frame(beats, strobe, intensity, bpm));
  return floats.get('u_flash');
}

/** The flash an algorithm sends at a position with its voices drawn as given. */
function flashWith(def: AlgorithmDef, amounts: { kick: number; snare: number; crash: number }, beats: number): number | undefined {
  const { gl, floats } = mockGl();
  const values = drawKnobs(def.knobs, createRng(1));
  Object.assign(values, { 'A.kick': amounts.kick, 'A.snare': amounts.snare, 'A.crash': amounts.crash });
  def.create(gl, values, createRng(2)).draw(null, frame(beats, 1, 0.5, 120));
  return floats.get('u_flash');
}

describe('plasma\'s moving values', () => {
  // walks 1.125..1.575, stepped by the kick
  const scale = { key: 'scale', min: 1.125, max: 1.575, voice: 'kick' as const, walk: new RandomWalk(createRng(3)) };
  const uniformsAt = (beats: number): Map<string, number> => {
    const { gl, floats } = mockGl();
    const values = drawKnobs(plasma.knobs, createRng(1));
    const moving = [scale];
    shaderAlgorithm(gl, 'plasma', plasmaSource, plasmaParams, values, undefined, moving).draw(null, frame(beats, 0, 1, 120));
    floats.set('drawn scale', values.scale!);
    floats.set('drawn swirl', values.swirl!);
    return floats;
  };

  it('stands still at the value it is given while held, and moves again when released', () => {
    const { gl, floats } = mockGl();
    const values = drawKnobs(plasma.knobs, createRng(1));
    const algorithm = shaderAlgorithm(gl, 'plasma', plasmaSource, plasmaParams, values, undefined, [scale]);
    const scaleAt = (beats: number): number | undefined => {
      algorithm.draw(null, frame(beats, 0, 1, 120));
      return floats.get('u_scale');
    };
    algorithm.hold!(true);
    algorithm.tune({ ...values, scale: 1.3 });
    expect([scaleAt(0.3), scaleAt(5.7), scaleAt(11.1)]).toEqual([1.3, 1.3, 1.3]);
    algorithm.hold!(false);
    expect(scaleAt(0.3)).not.toBe(scaleAt(5.7));
    expect(scaleAt(0.3)).not.toBe(1.3);
  });

  it('has no moving values when made with the moves off, and some when made with them on or by default', () => {
    for (const def of [plasma, tunnel, warpNoise, julia]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { gl } = mockGl();
        const values = drawKnobs(def.knobs, createRng(seed));
        expect(def.create(gl, values, createRng(seed), { moves: false }).moving).toEqual([]);
        expect(def.create(gl, values, createRng(seed), { moves: true }).moving!.length).toBeGreaterThanOrEqual(2);
        expect(def.create(gl, values, createRng(seed)).moving!.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('walks every value over the whole of the min and max it is given, as the panel\'s, and over the code\'s when it is given none', () => {
    for (const def of [plasma, tunnel, warpNoise, julia]) {
      for (let seed = 1; seed <= 20; seed++) {
        const { gl } = mockGl();
        const values = drawKnobs(def.knobs, createRng(seed));
        const given = def.create(gl, values, createRng(seed), { moves: true, bounds: () => [0.2, 0.3] }).moving!;
        expect(given.length).toBeGreaterThanOrEqual(2);
        for (const m of given) expect([m.min, m.max]).toEqual([0.2, 0.3]);
        const code = def.create(gl, values, createRng(seed), { moves: true }).moving!;
        expect(code.some((m) => m.min !== 0.2 || m.max !== 0.3)).toBe(true);
      }
    }
  });

  it('sends the moving value from the crossfader each frame, and every other value as drawn', () => {
    const a = uniformsAt(0.3);
    const b = uniformsAt(5.7);
    expect(a.get('u_scale')).not.toBe(b.get('u_scale'));
    for (const f of [a, b]) {
      expect(f.get('u_scale')).toBeGreaterThanOrEqual(1.125 - 1e-9);
      expect(f.get('u_scale')).toBeLessThanOrEqual(1.575 + 1e-9);
      expect(f.get('u_scale')).not.toBe(f.get('drawn scale'));
      expect(f.get('u_swirl')).toBeCloseTo(f.get('drawn swirl')!, 12);
    }
  });
});

describe('the tunnel\'s dive phases', () => {
  it('reach the shader and grow as the clock runs, and the far end reaches it as drawn', () => {
    const { gl, floats } = mockGl();
    const values = drawKnobs(tunnel.knobs, createRng(3));
    Object.assign(values, { twist: 0.2, hueDrift: 0.04, speed: 2, 'farEnd.x': 0.2, 'farEnd.y': -0.1 });
    // the twist always moves: with the moves off, their values are the ones set above
    const algorithm = tunnel.create(gl, values, createRng(0), { moves: false });
    const frameAt = (time: number): FrameInputs => ({ ...frame(0, 0, 0.5, 120), time });
    algorithm.draw(null, frameAt(10));
    algorithm.draw(null, frameAt(11));
    const early = floats.get('u_twistPhase')!;
    algorithm.draw(null, frameAt(13));
    expect(floats.get('u_twistPhase')! - early).toBeCloseTo(2 * 0.2 * 2, 9);
    expect(floats.get('u_huePhase')).toBeCloseTo(2 * 0.04 * 3, 9);
  });
});

describe('the strongest voice', () => {
  it('flashes plasma at exactly the strobe level, the others in proportion', () => {
    // Position 1 (beat 2) is the snare with the kick, position 2 (beat 3) the kick alone, position 4 (beat 1 of bar 2) the crash with the kick: the voices add up.
    const drawn = { kick: 0.1, snare: 0.2, crash: 0.05 };
    expect(flashWith(plasma, drawn, 1)).toBe(1);
    expect(flashWith(plasma, drawn, 2)).toBeCloseTo(0.5, 12);
    expect(flashWith(plasma, drawn, 4)).toBeCloseTo(0.75, 12);
    expect(flashWith(plasma, { kick: 0, snare: 0, crash: 0 }, 1)).toBe(0);
  });

});

describe.each([plasma, warpNoise, julia, tunnel])('$name\'s strongest voice', (def) => {
  it('flashes at exactly the strobe level, the others in proportion', () => {
    const drawn = { kick: 0.1, snare: 0.2, crash: 0.05 };
    expect(flashWith(def, drawn, 1)).toBe(1);
    expect(flashWith(def, drawn, 2)).toBeCloseTo(0.5, 12);
    expect(flashWith(def, { kick: 0, snare: 0, crash: 0 }, 1)).toBe(0);
  });
});

describe.each([plasma, warpNoise, julia, tunnel])('$name\'s flash', (def) => {
  it('reaches the shader as u_flash: full on a beat at strobe 1, none at strobe 0', () => {
    expect(flashOn(def, 0, 1)).toBe(1);
    expect(flashOn(def, 0, 0)).toBe(0);
  });

  it('is set by the strobe slider alone: the intensity never changes it', () => {
    for (const beats of [0, 0.4, 1, 2.1]) {
      const at = [0, 0.5, 1].map((intensity) => flashOn(def, beats, 0.6, intensity));
      expect(new Set(at).size).toBe(1);
    }
    expect(flashOn(def, 0, 0, 1)).toBe(0);
  });

  it('flashes on every beat at every tempo: the tempo thins nothing', () => {
    for (const bpm of [60, 120, 180]) {
      expect(flashOn(def, 1, 1, 0.5, bpm)).toBe(1);
      expect(flashOn(def, 2, 1, 0.5, bpm)).toBe(1);
    }
  });
});
