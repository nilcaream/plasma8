/**
 * Tap-tempo clock. Pure: every method takes the time in milliseconds, so the
 * clock never reads a real clock and tests run on made-up timestamps.
 *
 * The meter is 4/4. Before the first tap the clock free-runs at DEFAULT_BPM.
 * Every tap is one beat: the first tap of a run is beat 1 of bar 1, the next
 * tap beat 2, and so on. A tap more than RESET_GAP_MS after the previous one is
 * not a tempo tap: it only starts a fresh count (that tap is beat 1 of bar 1)
 * and the tempo stays as it was.
 *
 * The tempo is set from the TEMPO_TAPS-th tap of a run on: a straight line
 * (tap number against time) is fitted by least squares through the last
 * WINDOW_TAPS taps, its slope is the tempo and its position is the phase, so
 * a change of tempo is followed as the window slides. When two taps in a row
 * land further from the line than RESTART_Z times the noise, the window starts
 * again from the last RESTART_KEEP taps, which follows a big change at once.
 *
 * The tempo lies between MIN_BPM and MAX_BPM. A run whose tapped tempo is above
 * MAX_BPM is taken as taps on the half beats: the tempo is halved, decided once
 * at the first tempo of the run, and every tap of the run is then half a beat.
 */

export const DEFAULT_BPM = 120;
export const MIN_BPM = 60;
export const MAX_BPM = 180;
export const BEATS_PER_BAR = 4;
/** A tap later than this after the previous one only resets the bar. */
export const RESET_GAP_MS = 1000;
/** A tap closer than this to the previous one is a double event, not a beat. */
export const MIN_TAP_GAP_MS = 120;
/** How many of the latest taps the line is fitted through. */
export const WINDOW_TAPS = 12;
/** The tap of a run on which a tempo is first set. */
export const TEMPO_TAPS = 4;
/** A tap further than this many times the noise from the line is off the tempo. */
export const RESTART_Z = 4;
/** The noise is at least this much (ms): no hand taps steadier than that. */
export const RESTART_FLOOR_MS = 15;
/** Taps kept when the window starts again. */
export const RESTART_KEEP = 3;
/** Taps remembered for the early/late strip. */
export const MARKS_KEPT = 24;
/** Float noise allowed on "above MAX_BPM", so 180.0 stays 180. */
const HALVE_SLACK = 1e-6;

/** One tap of the current run, as the strip shows it. */
export interface TapMark {
  /** When it happened. */
  time: number;
  /** Milliseconds after (+) or before (-) where the clock expected it; undefined while there was no line to expect it from. */
  offsetMs: number | undefined;
  /** Still one of the taps the tempo is fitted through. */
  inWindow: boolean;
}

export interface ClockReading {
  bpm: number;
  /** Standard error of the fitted tempo in BPM; undefined until there are enough taps to tell. */
  bpmError: number | undefined;
  /** False until the first tap. */
  synced: boolean;
  /** Counts fresh runs: 0 while free-running, 1 from the first tap, one more at each reset. */
  run: number;
  /** Taps in the current run, 0 before the first tap. */
  taps: number;
  /** When the last tap happened, -Infinity before the first. */
  lastTapAt: number;
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

/** Clamps to the tempo range. */
export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
}

/** A tempo from outside (a URL, a slider, a typed value): above MAX_BPM it is halved once, then clamped. */
export function toBpm(bpm: number): number {
  return clampBpm(bpm > MAX_BPM + HALVE_SLACK ? bpm / 2 : bpm);
}

/** `132.31 +/- 0.41`: the tempo and its standard error, both to 2 decimals; the tempo alone while there is no error. */
export function formatTempo(bpm: number, error: number | undefined): string {
  return error === undefined ? bpm.toFixed(2) : `${bpm.toFixed(2)} +/- ${error.toFixed(2)}`;
}

/** The least-squares line time = a + b·i through taps i = 0, 1, 2, … */
export interface Line {
  n: number;
  /** Time at i = 0. */
  a: number;
  /** Milliseconds per tap. */
  b: number;
  meanX: number;
  meanY: number;
  sxx: number;
  /** Sum of squared residuals. */
  ssr: number;
}

export function fitLine(times: readonly number[]): Line {
  const n = times.length;
  const meanX = (n - 1) / 2;
  const meanY = times.reduce((p, c) => p + c, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  times.forEach((y, x) => {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  });
  const b = sxx > 0 ? sxy / sxx : NaN;
  return { n, a: meanY - b * meanX, b, meanX, meanY, sxx, ssr: sxx > 0 ? Math.max(0, syy - b * sxy) : 0 };
}

export class TapClock {
  private bpm: number;
  private bpmError: number | undefined;
  private synced = false;
  private run = 0;
  /** Time of beat 1 of bar 1 of the current run; while free-running, the time the clock started. */
  private anchor: number;
  private lastTap = -Infinity;
  /** Taps so far in the current run. */
  private count = 0;
  /** Times of the latest taps of the run, oldest first. */
  private window: number[] = [];
  /** Taps in a row that landed far from the line. */
  private off = 0;
  /** Whether this run's taps are half beats; undecided until its first tempo. */
  private halved: boolean | undefined;
  private marks: { time: number; index: number; offsetMs: number | undefined }[] = [];

  constructor(start = 0, bpm = DEFAULT_BPM) {
    this.anchor = start;
    this.bpm = toBpm(bpm);
  }

  /** Registers a tap at `now`. Returns false when it was ignored as a double event. */
  tap(now: number): boolean {
    const gap = now - this.lastTap;
    if (gap >= 0 && gap < MIN_TAP_GAP_MS) return false;
    this.lastTap = now;

    if (!this.synced || gap > RESET_GAP_MS || gap < 0) {
      // First tap ever, or a fresh count: this tap is beat 1 of bar 1, and the tempo stays.
      this.synced = true;
      this.run += 1;
      this.count = 1;
      this.window = [now];
      this.off = 0;
      this.halved = undefined;
      this.marks = [{ time: now, index: 0, offsetMs: undefined }];
      this.anchor = now;
      return true;
    }

    // Where the line through the taps so far expected this one, and whether it is far off.
    let offsetMs: number | undefined;
    if (this.window.length >= TEMPO_TAPS - 1) {
      const line = fitLine(this.window);
      offsetMs = now - (line.a + line.b * this.window.length);
      if (this.window.length >= TEMPO_TAPS) {
        const noise = Math.max(RESTART_FLOOR_MS, Math.sqrt(line.ssr / line.n));
        this.off = Math.abs(offsetMs) > RESTART_Z * noise ? this.off + 1 : 0;
      }
    }
    this.marks.push({ time: now, index: this.count, offsetMs });
    if (this.marks.length > MARKS_KEPT) this.marks.shift();
    this.count += 1;
    this.window.push(now);
    if (this.window.length > WINDOW_TAPS) this.window.shift();
    if (this.off >= 2) {
      this.window = this.window.slice(-RESTART_KEEP);
      this.off = 0;
    }

    if (this.window.length >= TEMPO_TAPS) this.refit();
    return true;
  }

  /** The tempo and the phase from the line through the window. */
  private refit(): void {
    const line = fitLine(this.window);
    this.halved ??= 60000 / line.b > MAX_BPM + HALVE_SLACK;
    const perBeat = this.halved ? 2 : 1; // taps per beat
    this.bpm = clampBpm(60000 / (line.b * perBeat));
    const dof = line.n - 2;
    const slopeError = dof >= 1 ? Math.sqrt(line.ssr / dof / line.sxx) : undefined;
    this.bpmError = slopeError === undefined ? undefined : (60000 / (perBeat * line.b ** 2)) * slopeError;
    // Beat 1 of bar 1 sits where the line puts it: the line passes through the
    // window's average tap at that tap's number.
    const meanBeat = (this.count - this.window.length + line.meanX) / perBeat;
    this.anchor = line.meanY - (meanBeat * 60000) / this.bpm;
  }

  /** Sets the tempo by hand, keeping the beat position it is at now. The next tap starts a fresh count. */
  setBpm(bpm: number, now: number): void {
    const { beats } = this.read(now);
    this.bpm = toBpm(bpm);
    this.bpmError = undefined;
    this.anchor = now - (beats * 60000) / this.bpm;
    this.lastTap = -Infinity;
    this.count = 0;
    this.window = [];
    this.off = 0;
    this.halved = undefined;
    this.marks = [];
  }

  /** The taps of the current run to draw, oldest first. */
  tapMarks(): TapMark[] {
    const firstInWindow = this.count - this.window.length;
    return this.marks.map((m) => ({ time: m.time, offsetMs: m.offsetMs, inWindow: m.index >= firstInWindow }));
  }

  read(now: number): ClockReading {
    const beats = Math.max(0, ((now - this.anchor) * this.bpm) / 60000);
    const wholeBeat = Math.floor(beats);
    const beatInBar = wholeBeat % BEATS_PER_BAR;
    const beatPhase = beats - wholeBeat;
    return {
      bpm: this.bpm,
      bpmError: this.bpmError,
      synced: this.synced,
      run: this.run,
      taps: this.count,
      lastTapAt: this.lastTap,
      beats,
      beatPhase,
      beatInBar,
      barPhase: (beatInBar + beatPhase) / BEATS_PER_BAR,
      bar: Math.floor(wholeBeat / BEATS_PER_BAR),
    };
  }
}
