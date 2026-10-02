/**
 * Tap-tempo clock. Pure: every method takes the time in milliseconds, so the
 * clock never reads a real clock and tests run on made-up timestamps.
 *
 * The meter is 4/4. Before the first tap the clock free-runs at DEFAULT_BPM.
 * Every tap is one beat: the first tap of a run is beat 1 of bar 1, the next
 * tap beat 2, and so on. The tempo is the median of the last few intervals
 * between taps, and each tap re-aligns the phase so that the tap lands exactly
 * on its beat. A gap of RESET_GAP_MS or more starts a fresh run.
 */

export const DEFAULT_BPM = 120;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const BEATS_PER_BAR = 4;
/** A gap this long between two taps starts a fresh count. */
export const RESET_GAP_MS = 2000;
/** A tap closer than this to the previous one is a double event, not a beat. */
export const MIN_TAP_GAP_MS = 120;
/** How many of the latest intervals the tempo is taken from. */
export const TEMPO_WINDOW = 5;

export interface ClockReading {
  bpm: number;
  /** False until the first tap. */
  synced: boolean;
  /** Beats elapsed since beat 1 of bar 1, fractional. */
  beats: number;
  /** 0..1 inside the current beat. */
  beatPhase: number;
  /** 0..BEATS_PER_BAR-1: the beat inside the bar, 0 is beat 1. */
  beatInBar: number;
  /** 0..1 inside the current bar. */
  barPhase: number;
  /** Bars completed since bar 1, so 0 during the first bar. */
  bar: number;
}

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export class TapClock {
  private bpm: number;
  private synced = false;
  /** Time of beat 1 of bar 1; while free-running, the time the clock started. */
  private anchor: number;
  private lastTap = -Infinity;
  /** Taps in the current run, counting the first. */
  private runLength = 0;
  private intervals: number[] = [];

  constructor(start = 0, bpm = DEFAULT_BPM) {
    this.anchor = start;
    this.bpm = clampBpm(bpm);
  }

  /** Registers a tap at `now`. Returns false when it was ignored as a double event. */
  tap(now: number): boolean {
    const gap = now - this.lastTap;
    if (gap >= 0 && gap < MIN_TAP_GAP_MS) return false;

    if (!this.synced || gap >= RESET_GAP_MS || gap < 0) {
      // First tap ever, or a fresh count: this tap is beat 1 of bar 1.
      this.synced = true;
      this.runLength = 1;
      this.intervals = [];
      this.anchor = now;
      this.lastTap = now;
      return true;
    }

    this.intervals.push(gap);
    if (this.intervals.length > TEMPO_WINDOW) this.intervals.shift();
    this.bpm = clampBpm(60000 / median(this.intervals));
    // This tap is beat number runLength (0-based); put it exactly there.
    this.anchor = now - (this.runLength * 60000) / this.bpm;
    this.runLength += 1;
    this.lastTap = now;
    return true;
  }

  read(now: number): ClockReading {
    const beats = Math.max(0, ((now - this.anchor) * this.bpm) / 60000);
    const wholeBeat = Math.floor(beats);
    const beatInBar = wholeBeat % BEATS_PER_BAR;
    const beatPhase = beats - wholeBeat;
    return {
      bpm: this.bpm,
      synced: this.synced,
      beats,
      beatPhase,
      beatInBar,
      barPhase: (beatInBar + beatPhase) / BEATS_PER_BAR,
      bar: Math.floor(wholeBeat / BEATS_PER_BAR),
    };
  }
}
