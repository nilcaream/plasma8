/**
 * How the intensity reaches the motion. Intensity never touches the colours:
 * it sets how fast things happen and how far each bar step moves (and, in
 * src/envelope.ts, how hard the beat hits).
 *
 * Speed: each algorithm runs at its own designed speed at its home intensity,
 * twice as fast for every SPEED_OCTAVE above it and half as fast for every one
 * below. Steps: every turn, roll or shift an algorithm takes at a bar start
 * is scaled by stepScale (a quarter of its size at intensity 0, full only near
 * 1) and eased over a share of the bar that shrinks as the intensity grows.
 */

import { fixed, type Knob, type Values } from './knobs';

/** The intensity distance that doubles (or halves) the speed. */
export const SPEED_OCTAVE = 0.6;
/** The share of its full size a bar step takes at intensity 0. */
export const MIN_STEP = 0.25;
/** The share of the bar a step is eased over, at intensity 0 and 1. */
export const EASE_SOFT = 0.5;
export const EASE_HARD = 0.125;

/** How fast an algorithm at home `home` runs at `intensity`: 1 at home. */
export function motionRate(home: number, intensity: number): number {
  return 2 ** ((intensity - home) / SPEED_OCTAVE);
}

/** A bar step's size (share of its full size) and how long it takes (share of the bar), at intensity 0 and 1. */
export interface StepShape { sizeSoft: number; sizeHard: number; easeSoft: number; easeHard: number }

export const STEP_SHAPE: StepShape = { sizeSoft: MIN_STEP, sizeHard: 1, easeSoft: EASE_SOFT, easeHard: EASE_HARD };

/** A step shape as fixed knobs, for the debug panel; spans up to a whole bar's ease and twice the full size. */
export function stepKnobs(shape: StepShape = STEP_SHAPE): Knob[] {
  return [
    fixed('stepSizeAt0', shape.sizeSoft, [0, 1]),
    fixed('stepSizeAt1', shape.sizeHard, [0, 2]),
    fixed('stepEaseAt0', shape.easeSoft, [0.02, 1]),
    fixed('stepEaseAt1', shape.easeHard, [0.02, 1]),
  ];
}

export const STEP_KNOBS: readonly Knob[] = stepKnobs();

/** The step shape from an algorithm's knob values; the shape in code for an algorithm that takes no bar steps. */
export function stepShape(v: Values): StepShape {
  return {
    sizeSoft: v.stepSizeAt0 ?? STEP_SHAPE.sizeSoft,
    sizeHard: v.stepSizeAt1 ?? STEP_SHAPE.sizeHard,
    easeSoft: v.stepEaseAt0 ?? STEP_SHAPE.easeSoft,
    easeHard: v.stepEaseAt1 ?? STEP_SHAPE.easeHard,
  };
}

/** How much of its full size a bar step takes: the soft size at 0, growing with the square of the intensity to the hard size at 1. */
export function stepScale(intensity: number, shape: StepShape = STEP_SHAPE): number {
  return shape.sizeSoft + (shape.sizeHard - shape.sizeSoft) * intensity * intensity;
}

/** The share of the bar a step is eased over. */
export function stepEase(intensity: number, shape: StepShape = STEP_SHAPE): number {
  return shape.easeSoft + (shape.easeHard - shape.easeSoft) * intensity;
}

/**
 * Seconds of motion: real seconds times the rate, summed frame by frame, so a
 * change of speed never makes the picture jump.
 */
export class MotionClock {
  private seconds = 0;

  /** Call once a frame with the real seconds since the last one; returns the motion so far. */
  update(dt: number, rate: number): number {
    this.seconds += Math.max(0, dt) * rate;
    return this.seconds;
  }
}

/** The motion seconds an algorithm is drawn at: its own steady clock if it keeps its designed speed, else the shared one. */
export function motionTimeFor(def: { readonly steadySpeed?: boolean }, shared: number, steady: number): number {
  return def.steadySpeed ? steady : shared;
}

/**
 * Bar steps taken so far: up by stepScale at every bar start, eased over
 * stepEase of the bar, both fixed when the step starts. Each step starts from
 * the value last shown, so a fresh tap count (bars back to 0) or a step cut
 * short never makes the picture jump.
 */
export class BarSteps {
  /** Read at each bar start: a new shape takes effect from the next step on. */
  shape: StepShape = STEP_SHAPE;
  private from = 0;
  private size = 0;
  private ease = EASE_HARD;
  private shown = 0;
  private bar: number | undefined;

  /** Call once a frame with the clock's bar count and bar phase. */
  update(bar: number, barPhase: number, intensity: number): number {
    if (this.bar !== undefined && bar !== this.bar) {
      this.from = this.shown;
      this.size = stepScale(intensity, this.shape);
      this.ease = stepEase(intensity, this.shape);
    }
    this.bar = bar;
    const s = Math.min(1, Math.max(0, barPhase / this.ease));
    this.shown = this.from + this.size * s * s * (3 - 2 * s);
    return this.shown;
  }
}
