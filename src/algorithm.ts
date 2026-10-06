import type { Knob, Values } from './knobs';
import type { MovingValue } from './moving';
import type { Rng } from './rng';

/** What every algorithm gets each frame, whatever it draws. */
export interface FrameInputs {
  /** Seconds of motion since the page loaded, at the speed the intensity sets (src/motion.ts); continuous, never re-aligned by taps. */
  time: number;
  /** 0..1 inside the current beat. */
  beatPhase: number;
  /** 0..1 inside the current 4/4 bar. */
  barPhase: number;
  /** The beat envelope (src/envelope.ts): 1 on the beat, a swell when soft, a sharp hit when hard. */
  beatPulse: number;
  /** The same envelope over the bar: 1 on beat 1. */
  barPulse: number;
  /** Beats since beat 1 of bar 1, fractional; starts again from 0 when a tap starts a fresh count. */
  beats: number;
  /** 0 soft … 1 hard: how hard the beat hits and how far beat moves reach; never the colours. */
  intensity: number;
  /** The strobe slider, 0 off … 1: the size and the shape of the beat voices' flash (src/beatVoices.ts); never the intensity. 0 while the flash limiter holds a window dark (src/flashLimit.ts). */
  strobe: number;
  /** The tempo in beats per minute: the flash keeps to at most 3 flashes a second by it. */
  bpm: number;
  /** Size of the drawing surface in pixels. */
  width: number;
  height: number;
}

/**
 * A drawing algorithm. `target` is the framebuffer to draw into, or null for the
 * canvas: a morph draws the outgoing and the incoming algorithm into textures
 * and blends them, so no algorithm ever assumes it owns the screen.
 */
export interface Algorithm {
  readonly name: string;
  /** The values that move this instance, when it has any: they follow the harmonics every frame instead of holding a drawn number. */
  readonly moving?: readonly MovingValue[];
  draw(target: WebGLFramebuffer | null, inputs: FrameInputs): void;
  /** Takes new values for its knobs while it runs (the debug panel's overrides). */
  tune(values: Values): void;
  /** While held, its moving values stand at the values last given to `tune`; released, they move again (the debug panel's "Moves off"). */
  hold?(on: boolean): void;
  dispose(): void;
}

/** What the debug panel asks of a new instance. */
export interface CreateOptions {
  /** false: no value moves; every value stays as drawn. */
  moves: boolean;
  /** The bounds a moving value moves inside: the panel's min and max for the knob; the code's range when left out. */
  bounds?: (key: string) => readonly [number, number];
}

/** Makes an algorithm from values for its knobs; `rng` is for what it draws as it runs. */
export interface AlgorithmDef {
  readonly name: string;
  /** The intensity (0 soft … 1 hard) it is at home at: picked most there, and runs at its designed speed there. */
  readonly home: number;
  /** Runs at its designed speed at every intensity, including during a fade, on a clock of its own. */
  readonly steadySpeed?: boolean;
  /** Everything it draws at random when it starts. */
  readonly knobs: readonly Knob[];
  create(gl: WebGL2RenderingContext, values: Values, rng: Rng, options?: CreateOptions): Algorithm;
}
