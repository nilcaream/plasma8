/**
 * The flash cap held against the clock. `flashStep` thins the onsets so that a
 * steady beat grid never puts more than 3 in a second, but a tap that starts a
 * fresh count or refits the tempo moves the grid under a flash already shown.
 * This looks at wall time only: a flash window whose peak would come less than
 * MIN_FLASH_GAP_S after the peak of the last one that sounded is muted until the next
 * window, so whatever the clock does, no two peaks are closer than that and no
 * one second holds more than MAX_FLASHES_PER_S of them.
 */

import { DEFAULT_SHAPE, MIN_FLASH_GAP_S } from './beatVoices';

/**
 * The window of onset w holds the beats from w - WINDOW_LEAD (the longest rise) up to
 * w + 1 - WINDOW_LEAD, where the next window's rise can begin.
 */
export const WINDOW_LEAD = Math.max(DEFAULT_SHAPE.a0, DEFAULT_SHAPE.a1);

export class FlashLimiter {
  private window: number | undefined;
  private lastBeats = -Infinity;
  private lastPeak = -Infinity;
  private muted = false;

  /**
   * Call once a frame with the clock's beats and tempo, the flash step (flashStep) and the time in
   * milliseconds; false while the window under way is muted.
   */
  allow(beats: number, bpm: number, step: number, now: number): boolean {
    const onset = Math.floor(beats + WINDOW_LEAD);
    // a new window: the beats moved on to another one, or went back (a fresh count)
    if (onset !== this.window || beats < this.lastBeats) {
      this.window = onset;
      if (onset % step !== 0) {
        this.muted = false; // an onset that does not sound: nothing flashes in it
      } else {
        const peak = now + ((onset - beats) * 60000) / bpm;
        this.muted = peak - this.lastPeak <= MIN_FLASH_GAP_S * 1000;
        if (!this.muted) this.lastPeak = peak;
      }
    }
    this.lastBeats = beats;
    return !this.muted;
  }
}
