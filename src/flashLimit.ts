/**
 * The flash cap held against the clock. On a steady beat grid, at the fastest
 * tempo (180 BPM), flashes are exactly MIN_FLASH_GAP_S apart and never more than
 * 3 in a second, but a tap that starts a fresh count or refits the tempo moves
 * the grid under a flash already shown.
 * This looks at wall time only: a flash window whose peak would come less than
 * MIN_FLASH_GAP_S after the peak of the last one that sounded is muted until the next
 * window. A flash already rising is never cut short by a tap, which would put its peak
 * earlier than the one the window was judged by: it finishes its rise to that peak
 * on the old grid (`flashBeats`). So whatever the clock does, no two peaks are closer than
 * that and no one second holds more than MAX_FLASHES_PER_S of them.
 */

import { DEFAULT_SHAPE, MIN_FLASH_GAP_S } from './beatVoices';

/**
 * The window of onset w holds the beats from w - WINDOW_LEAD (the longest rise) up to
 * w + 1 - WINDOW_LEAD, where the next window's rise can begin.
 */
export const WINDOW_LEAD = Math.max(DEFAULT_SHAPE.a0, DEFAULT_SHAPE.a1);

/** Milliseconds of float noise allowed, so a grid at exactly the fastest tempo is not cut. */
const SLACK_MS = 1e-6;

/** The peak of a window moving by more than this, from one frame to the next, means a tap moved the grid. */
const MOVED_MS = 1e-3;

export class FlashLimiter {
  private window: number | undefined;
  private lastBeats = -Infinity;
  private lastPeak = -Infinity;
  private lastBpm = 0;
  private muted = false;
  private finishing = false;
  /**
   * The position in beats the flash is drawn at, set by `allow`: the clock's beats, except while a rising flash
   * finishes on the grid it began on.
   */
  flashBeats = 0;

  /**
   * Call once a frame with the clock's beats and tempo and the time in
   * milliseconds; false while the window under way is muted.
   */
  allow(beats: number, bpm: number, now: number): boolean {
    this.flashBeats = beats;
    const back = beats < this.lastBeats;
    this.lastBeats = beats;
    if (this.finishing) {
      if (now < this.lastPeak) {
        this.flashBeats = this.window! - ((this.lastPeak - now) * this.lastBpm) / 60000;
        return true;
      }
      this.finishing = false;
      this.window = undefined;
    }
    const onset = Math.floor(beats + WINDOW_LEAD);
    const peak = now + ((onset - beats) * 60000) / bpm;
    // a flash on its way up whose peak the tap moved: it goes on to the peak it was judged by
    if (!this.muted && this.window !== undefined && now < this.lastPeak && Math.abs(peak - this.lastPeak) > MOVED_MS) {
      this.finishing = true;
      this.flashBeats = this.window - ((this.lastPeak - now) * this.lastBpm) / 60000;
      return true;
    }
    // a new window: the beats moved on to another one, or went back (a fresh count)
    if (onset !== this.window || back) {
      this.window = onset;
      this.muted = peak - this.lastPeak < MIN_FLASH_GAP_S * 1000 - SLACK_MS;
      if (!this.muted) {
        this.lastPeak = peak;
        this.lastBpm = bpm;
      }
    }
    return !this.muted;
  }
}
