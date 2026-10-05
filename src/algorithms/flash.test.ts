import { describe, expect, it } from 'vitest';
import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { drawKnobs } from '../knobs';
import { createRng } from '../rng';
import { shaderAlgorithm } from '../shaderAlgorithm';
import { plasma, plasmaParams } from './plasma';
import plasmaSource from './plasma.frag?raw';
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
  const draw = { seed: 12345, widthShare: 0.5, offsetShare: 0.5, factors: [1, 1, 1, 1] };
  const uniformsAt = (beats: number): Map<string, number> => {
    const { gl, floats } = mockGl();
    const values = drawKnobs(plasma.knobs, createRng(1));
    const moving = [{ key: 'scale', lo: 0.9, hi: 1.8, draw }];
    shaderAlgorithm(gl, 'plasma', plasmaSource, plasmaParams, values, undefined, moving).draw(null, frame(beats, 0, 1, 120));
    floats.set('drawn scale', values.scale!);
    floats.set('drawn swirl', values.swirl!);
    return floats;
  };

  it('sends the moving value from the harmonics each frame, and every other value as drawn', () => {
    const a = uniformsAt(0.3);
    const b = uniformsAt(5.7);
    expect(a.get('u_scale')).not.toBe(b.get('u_scale'));
    for (const f of [a, b]) {
      // width 0.5 of 0.9..1.8 placed half way: 1.125..1.575
      expect(f.get('u_scale')).toBeGreaterThanOrEqual(1.125 - 1e-9);
      expect(f.get('u_scale')).toBeLessThanOrEqual(1.575 + 1e-9);
      expect(f.get('u_scale')).not.toBe(f.get('drawn scale'));
      expect(Math.abs(f.get('u_swirl')!)).toBeCloseTo(f.get('drawn swirl')!, 12);
    }
  });
});

describe('the strongest voice', () => {
  it('flashes plasma at exactly the strobe level, the others in proportion', () => {
    // Beat 1 is the snare (with the kick), beat 2 the kick alone, beat 4 the crash (with the kick): the voices add up.
    const drawn = { kick: 0.1, snare: 0.2, crash: 0.05 };
    expect(flashWith(plasma, drawn, 1)).toBe(1);
    expect(flashWith(plasma, drawn, 2)).toBeCloseTo(0.5, 12);
    expect(flashWith(plasma, drawn, 4)).toBeCloseTo(0.75, 12);
    expect(flashWith(plasma, { kick: 0, snare: 0, crash: 0 }, 1)).toBe(0);
  });

  it('leaves the domain-warped noise at the drawn strengths', () => {
    const drawn = { kick: 0.1, snare: 0.2, crash: 0.05 };
    expect(flashWith(warpNoise, drawn, 1)).toBeCloseTo(0.3, 12);
    expect(flashWith(warpNoise, drawn, 2)).toBeCloseTo(0.1, 12);
    expect(flashWith(warpNoise, drawn, 4)).toBeCloseTo(0.15, 12);
  });
});

describe.each([plasma, warpNoise])('$name\'s flash', (def) => {
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

  it('skips the beats the flash cap thins out: beat 2 is silent above 180 BPM, and sounds at 120', () => {
    expect(flashOn(def, 1, 1, 0.5, 120)).toBe(1);
    expect(flashOn(def, 1, 1, 0.5, 200)).toBe(0);
    expect(flashOn(def, 2, 1, 0.5, 200)).toBe(1);
  });
});
