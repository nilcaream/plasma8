/**
 * How much the shared final pass softens the picture (blur, lower contrast and
 * saturation): nothing while the intensity is at or above the running
 * algorithm's home, growing smoothly the further the slider sits below it.
 */

/** Below home by this much or more, the softening is full. */
export const FULL_SOFTENING_BELOW = 0.6;

/** 0 (none) … 1 (full). */
export function softening(home: number, intensity: number): number {
  const s = Math.min(1, Math.max(0, (home - intensity) / FULL_SOFTENING_BELOW));
  return s * s * (3 - 2 * s);
}
