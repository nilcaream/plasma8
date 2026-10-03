/**
 * How much the picture is softened: nothing while the intensity is at or above
 * the running algorithm's home, growing smoothly the further the slider sits
 * below it. Softening never blurs. The algorithms move slower and smaller and
 * change contrast and colour more gently; the shared final pass only lowers
 * saturation and contrast a little.
 */

/** Below home by this much or more, the softening is full. */
export const FULL_SOFTENING_BELOW = 0.6;
/** At full softening, motion runs at 1 - this of its speed. */
export const SOFT_SLOWDOWN = 0.6;

/** 0 (none) … 1 (full). */
export function softening(home: number, intensity: number): number {
  const s = Math.min(1, Math.max(0, (home - intensity) / FULL_SOFTENING_BELOW));
  return s * s * (3 - 2 * s);
}

/**
 * Seconds of motion: real seconds, run slower the more the picture is softened.
 * Summed frame by frame, so moving the slider changes the speed and never makes
 * the picture jump.
 */
export class MotionClock {
  private seconds = 0;

  /** Call once a frame with the real seconds since the last one; returns the motion so far. */
  update(dt: number, soft: number): number {
    this.seconds += Math.max(0, dt) * (1 - SOFT_SLOWDOWN * soft);
    return this.seconds;
  }
}
