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

/** How much of its full size a bar step takes. */
export function stepScale(intensity: number): number {
  return MIN_STEP + (1 - MIN_STEP) * intensity * intensity;
}

/** The share of the bar a step is eased over. */
export function stepEase(intensity: number): number {
  return EASE_SOFT + (EASE_HARD - EASE_SOFT) * intensity;
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

/**
 * Bar steps taken so far: up by stepScale at every bar start, eased over
 * stepEase of the bar, both fixed when the step starts. Each step starts from
 * the value last shown, so a fresh tap count (bars back to 0) or a step cut
 * short never makes the picture jump.
 */
export class BarSteps {
  private from = 0;
  private size = 0;
  private ease = EASE_HARD;
  private shown = 0;
  private bar: number | undefined;

  /** Call once a frame with the clock's bar count and bar phase. */
  update(bar: number, barPhase: number, intensity: number): number {
    if (this.bar !== undefined && bar !== this.bar) {
      this.from = this.shown;
      this.size = stepScale(intensity);
      this.ease = stepEase(intensity);
    }
    this.bar = bar;
    const s = Math.min(1, Math.max(0, barPhase / this.ease));
    this.shown = this.from + this.size * s * s * (3 - 2 * s);
    return this.shown;
  }
}
