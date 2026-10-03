/**
 * Tap-tempo clock. Pure: every method takes the time in milliseconds, so the
 * clock never reads a real clock and tests run on made-up timestamps.
 *
 * The meter is 4/4. Before the first tap the clock free-runs at DEFAULT_BPM.
 * Every tap is one beat: the first tap of a run is beat 1 of bar 1, the next
 * tap beat 2, and so on. The tempo is the slope of a straight line fitted
 * through the latest taps (tap number against time), so jitter in a hand
 * averages out and the number settles as taps pile up. Each tap refits the
 * line, which also re-aligns the phase. A gap of RESET_GAP_MS or more starts a
 * fresh run.
 */

export const DEFAULT_BPM = 120;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const BEATS_PER_BAR = 4;
/** A gap this long between two taps starts a fresh count. */
export const RESET_GAP_MS = 2000;
/** A tap closer than this to the previous one is a double event, not a beat. */
export const MIN_TAP_GAP_MS = 120;
/** How many of the latest taps the tempo and the phase are fitted to. */
export const TEMPO_TAPS = 16;

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

/** Least-squares slope of y against x = 0, 1, 2, …; needs at least two values. */
export function slope(ys: readonly number[]): number {
  const n = ys.length;
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, x) => {
    num += (x - meanX) * (y - meanY);
    den += (x - meanX) ** 2;
  });
  return num / den;
}

export class TapClock {
  private bpm: number;
  private synced = false;
  /** Time of beat 1 of bar 1; while free-running, the time the clock started. */
  private anchor: number;
  private lastTap = -Infinity;
  /** Times of the latest taps of the current run, oldest first. */
  private taps: number[] = [];
  /** Beat number (0 = the first tap of the run) of taps[0]. */
  private firstBeat = 0;

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
      this.taps = [now];
      this.firstBeat = 0;
      this.anchor = now;
      this.lastTap = now;
      return true;
    }

    this.taps.push(now);
    if (this.taps.length > TEMPO_TAPS) {
      this.taps.shift();
      this.firstBeat += 1;
    }
    this.bpm = clampBpm(60000 / slope(this.taps));
    // Beat 1 of bar 1 sits where the fitted line puts it: the line passes through
    // the average tap, and the tap numbered firstBeat + mean index is that beat.
    const n = this.taps.length;
    const meanTime = this.taps.reduce((a, b) => a + b, 0) / n;
    this.anchor = meanTime - ((this.firstBeat + (n - 1) / 2) * 60000) / this.bpm;
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
