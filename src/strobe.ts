/**
 * The strobe: a short white flash on the beat. Pure: it takes beat numbers and
 * times in seconds and never reads a clock.
 *
 * Each algorithm says which beats it flashes on: every kick (every beat) or the
 * snare/clap (beats 2 and 4). Whatever the tempo, there are never 3 flashes in
 * any one second (under the WCAG 2.3.1 threshold). Two layers keep it so: when
 * the beats come too fast, beats are skipped on the grid (every other one, or
 * one in four), with a margin for frames that land a little late; and a flash
 * that would make 3 within a second never fires, which also covers a tap that
 * re-aligns the clock between two flashes.
 */

export type StrobeBeat = 'kick' | 'snare';

/** The grid keeps flashes at least this far apart: half a second plus a margin for frame timing. */
export const MIN_GRID_GAP_S = 0.52;
/** Never this many flashes inside one second. */
export const MAX_FLASHES_PER_S = 3;
/** Never two flashes closer than this, whatever the clock does. */
export const MIN_GAP_S = 0.25;
/** The flash holds at full strength this long, then decays. */
export const FLASH_HOLD_S = 0.05;
export const FLASH_DECAY_S = 0.04;
/** After this long the flash is over. */
export const FLASH_END_S = 0.2;

const SPACING: Record<StrobeBeat, number> = { kick: 1, snare: 2 };
const OFFSET: Record<StrobeBeat, number> = { kick: 0, snare: 1 };

/** How many beats lie between two flashes at this tempo: 1, 2, 4 or 8. */
export function flashStep(beat: StrobeBeat, bpm: number): number {
  const beatS = 60 / bpm;
  let step = SPACING[beat];
  while (step * beatS < MIN_GRID_GAP_S && step < 8) step *= 2;
  return step;
}

/** Whether the beat numbered `beatIndex` (0 is beat 1 of bar 1) is on this algorithm's flash grid. */
export function onFlashGrid(beat: StrobeBeat, beatIndex: number, bpm: number): boolean {
  const k = beatIndex - OFFSET[beat];
  return k >= 0 && k % flashStep(beat, bpm) === 0;
}

/** Remembers the latest flashes and fires a new one only when the cap allows it. */
export class FlashGate {
  /** Times of the latest flashes, oldest first. */
  private recent: number[] = [];

  /** Call when the beat numbered `beatIndex` starts; true when it flashes. */
  onBeat(beat: StrobeBeat, beatIndex: number, bpm: number, nowS: number): boolean {
    if (!onFlashGrid(beat, beatIndex, bpm)) return false;
    const last = this.recent[this.recent.length - 1];
    if (last !== undefined && nowS - last < MIN_GAP_S) return false;
    const window = this.recent.filter((t) => nowS - t < 1);
    if (window.length >= MAX_FLASHES_PER_S - 1) return false;
    this.recent = [...window, nowS];
    return true;
  }

  /** Time of the latest flash, or -Infinity. */
  get lastFlash(): number {
    return this.recent[this.recent.length - 1] ?? -Infinity;
  }
}

/** How bright the flash is `ageS` seconds after it fired, for a strobe slider at `strength`. */
export function flashLevel(ageS: number, strength: number): number {
  if (strength <= 0 || ageS < 0 || ageS >= FLASH_END_S) return 0;
  if (ageS < FLASH_HOLD_S) return strength;
  return strength * Math.exp(-(ageS - FLASH_HOLD_S) / FLASH_DECAY_S);
}
