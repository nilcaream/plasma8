/**
 * The beat envelope every algorithm takes the beat through: 1 on the beat. The
 * intensity shapes it. Low, it is a slow swell like a breath, rising and
 * falling over the whole beat with no edge at the beat; high, it is a sharp
 * hit, full on the beat and gone soon after. In between it is a blend of the two.
 * The same shape over a bar gives the bar pulse.
 */

/** How quickly the hit falls away: (1 - phase) to this power. */
export const HIT_POWER = 4;

/** The share of its full size the beat's effect takes at intensity 0. */
export const MIN_BEAT_SIZE = 0.1;

/**
 * How much the beat changes the picture, as a share of its full size: barely
 * at intensity 0, all of it at 1. An algorithm scales what it does on the beat
 * by this, around its resting value, so the colours stay as they are.
 */
export function beatSize(intensity: number): number {
  return MIN_BEAT_SIZE + (1 - MIN_BEAT_SIZE) * Math.min(1, Math.max(0, intensity));
}

/** 0..1 for a phase 0..1 inside the beat (or bar) and an intensity 0 soft … 1 hard. */
export function pulse(phase: number, intensity: number): number {
  const sharp = Math.min(1, Math.max(0, intensity));
  const swell = 0.5 + 0.5 * Math.cos(2 * Math.PI * phase);
  const hit = (1 - phase) ** HIT_POWER;
  return swell + (hit - swell) * sharp;
}
