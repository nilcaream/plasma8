/**
 * How far the beat has pushed things along: a count that grows by one every
 * beat, front-loaded (most of each step comes right after the beat), and that
 * never goes back. Pure: it reads the clock's beat count.
 *
 * The clock's beat count starts again at 0 when a tap starts a fresh count, and
 * a tap that re-aligns the phase can move it back a little; travel holds where
 * it was in both cases and grows again from there, so nothing driven by it
 * ever jumps back.
 */

/** Whole beats plus a front-loaded share of the current one. */
export function easedBeats(beats: number): number {
  const whole = Math.floor(beats);
  return whole + 1 - (1 - (beats - whole)) ** 3;
}

export class BeatTravel {
  private total = 0;
  private lastBeats: number | undefined;

  /** Call once a frame with the clock's beat count; returns the travel so far. */
  update(beats: number): number {
    if (this.lastBeats !== undefined) this.total += Math.max(0, easedBeats(beats) - easedBeats(this.lastBeats));
    this.lastBeats = beats;
    return this.total;
  }
}
