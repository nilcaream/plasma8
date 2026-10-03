/**
 * Tap-tempo clock. Pure: every method takes the time in milliseconds, so the
 * clock never reads a real clock and tests run on made-up timestamps.
 *
 * The meter is 4/4. Before the first tap the clock free-runs at DEFAULT_BPM.
 * Every tap is one beat: the first tap of a run is beat 1 of bar 1, the next
 * tap beat 2, and so on. A gap of RESET_GAP_MS or more starts a fresh run.
 *
 * The tempo is fitted to every tap since tapping started: one straight line
 * per run (tap number against time), all runs sharing one slope, each with its
 * own offset, since the beats between two runs were not counted. Jitter in a
 * hand averages out, and the longer the tapping, the less the beat drifts once
 * it stops. Each tap refits, which also re-aligns the phase of the current run.
 * So a single tap after a pause only marks beat 1 and leaves the tempo as it
 * was; the runs before it are dropped only once the new run's own slope
 * differs from theirs by more than TEMPO_CHANGE_Z standard errors, which is
 * when a new tempo has been tapped clearly enough to replace the old one.
 */

export const DEFAULT_BPM = 120;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const BEATS_PER_BAR = 4;
/** A gap this long between two taps starts a fresh count. */
export const RESET_GAP_MS = 2000;
/** A tap closer than this to the previous one is a double event, not a beat. */
export const MIN_TAP_GAP_MS = 120;
/** How many standard errors a new run's slope must differ by before it replaces the tempo. */
export const TEMPO_CHANGE_Z = 3.5;
/** No hand taps steadier than this (ms, standard deviation); keeps a lucky handful of taps from passing for a tempo change. */
export const MIN_TAP_SD_MS = 5;

export interface ClockReading {
  bpm: number;
  /** Standard error of the fitted tempo in BPM; undefined until there are enough taps to tell. */
  bpmError: number | undefined;
  /** False until the first tap. */
  synced: boolean;
  /** Counts fresh runs: 0 while free-running, 1 from the first tap, one more at each reset. */
  run: number;
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

/** `132.31 +/- 0.41`: the tempo and its standard error, both to 2 decimals; the tempo alone while there is no error. */
export function formatTempo(bpm: number, error: number | undefined): string {
  return error === undefined ? bpm.toFixed(2) : `${bpm.toFixed(2)} +/- ${error.toFixed(2)}`;
}

/** Sums of one run's taps (time y against tap number x = 0, 1, 2, …), centred on their means. */
export interface RunSums {
  n: number;
  meanX: number;
  meanY: number;
  sxx: number;
  sxy: number;
  syy: number;
}

export function runSums(times: readonly number[]): RunSums {
  const n = times.length;
  const meanX = (n - 1) / 2;
  const meanY = times.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  times.forEach((y, x) => {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  });
  return { n, meanX, meanY, sxx, sxy, syy };
}

/** One slope shared by several runs, each with its own offset. */
export interface PooledFit {
  /** Milliseconds per beat; NaN while no run has two taps. */
  slope: number;
  sxx: number;
  /** Sum of squared residuals around the shared slope. */
  ssr: number;
  /** Degrees of freedom left for the residuals: taps - runs - 1. */
  dof: number;
}

export function pooledFit(runs: readonly RunSums[]): PooledFit {
  let n = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const r of runs) {
    n += r.n;
    sxx += r.sxx;
    sxy += r.sxy;
    syy += r.syy;
  }
  const slope = sxx > 0 ? sxy / sxx : NaN;
  const ssr = sxx > 0 ? Math.max(0, syy - slope * sxy) : 0;
  return { slope, sxx, ssr, dof: n - runs.length - 1 };
}

/** Standard error of the slope, or undefined while there are no residual degrees of freedom. */
function slopeError(fit: PooledFit): number | undefined {
  if (!(fit.sxx > 0) || fit.dof < 1) return undefined;
  return Math.sqrt(fit.ssr / fit.dof / fit.sxx);
}

/**
 * True when the current run's own slope differs from the earlier runs' shared
 * slope by more than TEMPO_CHANGE_Z standard errors of that difference.
 */
export function tempoChanged(earlier: readonly RunSums[], current: RunSums): boolean {
  const before = pooledFit(earlier);
  const now = pooledFit([current]);
  if (!(before.sxx > 0) || !(now.sxx > 0)) return false;
  // Residuals of the two fits kept apart, so a real change does not inflate the noise estimate.
  const dof = before.dof + now.dof;
  if (dof < 1) return false;
  const variance = Math.max(MIN_TAP_SD_MS ** 2, (before.ssr + now.ssr) / dof);
  const se = Math.sqrt(variance * (1 / before.sxx + 1 / now.sxx));
  return Math.abs(now.slope - before.slope) > TEMPO_CHANGE_Z * se;
}

export class TapClock {
  private bpm: number;
  private bpmError: number | undefined;
  private synced = false;
  private run = 0;
  /** Time of beat 1 of bar 1 of the current run; while free-running, the time the clock started. */
  private anchor: number;
  private lastTap = -Infinity;
  /** Sums of the earlier runs that share the tempo with the current one. */
  private earlier: RunSums[] = [];
  /** Times of every tap of the current run, oldest first. */
  private taps: number[] = [];

  constructor(start = 0, bpm = DEFAULT_BPM) {
    this.anchor = start;
    this.bpm = clampBpm(bpm);
  }

  /** Registers a tap at `now`. Returns false when it was ignored as a double event. */
  tap(now: number): boolean {
    const gap = now - this.lastTap;
    if (gap >= 0 && gap < MIN_TAP_GAP_MS) return false;
    this.lastTap = now;

    if (!this.synced || gap >= RESET_GAP_MS || gap < 0) {
      // First tap ever, or a fresh count: this tap is beat 1 of bar 1, and the tempo stays.
      if (this.taps.length > 0) this.earlier.push(runSums(this.taps));
      this.synced = true;
      this.run += 1;
      this.taps = [now];
      this.anchor = now;
      return true;
    }

    this.taps.push(now);
    const current = runSums(this.taps);
    if (tempoChanged(this.earlier, current)) this.earlier = [];
    const fit = pooledFit([...this.earlier, current]);
    if (fit.sxx > 0) {
      this.bpm = clampBpm(60000 / fit.slope);
      const error = slopeError(fit);
      this.bpmError = error === undefined ? undefined : (60000 / fit.slope ** 2) * error;
    }
    // Beat 1 of bar 1 sits where the fitted line puts it: the line passes through
    // the run's average tap at its average tap number.
    this.anchor = current.meanY - (current.meanX * 60000) / this.bpm;
    return true;
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
      beats,
      beatPhase,
      beatInBar,
      barPhase: (beatInBar + beatPhase) / BEATS_PER_BAR,
      bar: Math.floor(wholeBeat / BEATS_PER_BAR),
    };
  }
}
