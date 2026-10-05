import { describe, expect, it } from 'vitest';
import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { drawKnobs } from '../knobs';
import { createRng } from '../rng';
import { plasma } from './plasma';
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

const frame = (beats: number, intensity: number): FrameInputs => ({
  time: 1, beatPhase: 0, barPhase: 0, beatPulse: 0, barPulse: 0, beats, intensity, width: 64, height: 36,
});

/** The flash an algorithm sends to its shader on a beat, with every voice at full strength. */
function flashOn(def: AlgorithmDef, beats: number, intensity: number): number | undefined {
  const { gl, floats } = mockGl();
  const values = drawKnobs(def.knobs, createRng(1));
  Object.assign(values, { 'A.kick': 1, 'A.snare': 1, 'A.crash': 1 });
  def.create(gl, values, createRng(2)).draw(null, frame(beats, intensity));
  return floats.get('u_flash');
}

describe.each([plasma, warpNoise])('$name\'s flash', (def) => {
  it('reaches the shader as u_flash: full on a beat at intensity 1, none at intensity 0', () => {
    expect(flashOn(def, 0, 1)).toBe(1);
    expect(flashOn(def, 0, 0)).toBe(0);
  });
});
