import type { Rng } from './rng';
import type { StrobeBeat } from './strobe';

/** What every algorithm gets each frame, whatever it draws. */
export interface FrameInputs {
  /** Seconds since the page loaded; continuous, never re-aligned by taps. */
  time: number;
  /** 0..1 inside the current beat. */
  beatPhase: number;
  /** 0..1 inside the current 4/4 bar. */
  barPhase: number;
  /** Bars completed so far; 0 during the first bar. */
  barCount: number;
  /** Beats travelled, front-loaded after each beat; never goes back, even when a tap starts a fresh count. */
  travel: number;
  /** 0 soft … 1 hard. */
  intensity: number;
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
  draw(target: WebGLFramebuffer | null, inputs: FrameInputs): void;
  dispose(): void;
}

/** Makes an algorithm with its own parameters drawn from `rng`. */
export interface AlgorithmDef {
  readonly name: string;
  /** The intensity (0 soft … 1 hard) it is at home at: picked most there, softened below it. */
  readonly home: number;
  /** Which beats its strobe flashes on. */
  readonly strobe: StrobeBeat;
  create(gl: WebGL2RenderingContext, rng: Rng): Algorithm;
}
