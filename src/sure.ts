/**
 * When the detected tempo is sure: the main page stops the microphone by itself then (Continuous listen off).
 *
 * Sure means a steady, precise fit that the beat clock has taken: over the last SURE_SECONDS the analyses that heard a
 * beat were at least SURE_FITS, every one with a grid standard error of at most SURE_SD BPM and a confidence of at
 * least SURE_CONFIDENCE, all within SURE_SPREAD BPM of each other, and within SAME_BPM of the clock's tempo. An analysis
 * without a beat says nothing either way (src/beatClock.ts does the same): it is skipped, not counted against. So is a
 * fit that is not precise or not confident enough: it does not count, and the fits around it still do.
 */

import { SAME_BPM } from './beatClock';
import type { Analysis } from './tempoDetect';

export const SURE_SECONDS = 4;
export const SURE_FITS = 10;
export const SURE_SD = 0.05;
export const SURE_SPREAD = 0.1;
export const SURE_CONFIDENCE = 0.5;

export class Sureness {
  private fits: { t: number; bpm: number }[] = [];
  private sureNow = false;
  private clockChanges: number | null = null;

  get sure(): boolean { return this.sureNow; }

  /**
   * How many of the fits in the last SURE_SECONDS agree (lie within SURE_SPREAD BPM of each other, the biggest such group), for
   * a display that fills up to SURE_FITS: the last step is sureness itself, so it reads SURE_FITS - 1 at most until sure.
   */
  get agreeing(): number {
    if (this.sureNow) return SURE_FITS;
    const bpms = this.fits.map((f) => f.bpm).sort((a, b) => a - b);
    let best = 0;
    for (let lo = 0, hi = 0; hi < bpms.length; hi++) {
      while (bpms[hi]! - bpms[lo]! > SURE_SPREAD) lo++;
      best = Math.max(best, hi - lo + 1);
    }
    return Math.min(SURE_FITS - 1, best);
  }

  reset(): void {
    this.fits = [];
    this.sureNow = false;
    this.clockChanges = null;
  }

  /**
   * Takes one analysis, the beat clock's tempo and its count of tempo changes; whether the tempo is sure now. Once sure, it
   * stays sure until reset, or until the clock takes a new tempo (the music changed while listening on): then it starts again.
   */
  update(a: Analysis | null, clockBpm: number | null, clockChanges = 0): boolean {
    if (this.clockChanges !== null && clockChanges !== this.clockChanges) {
      this.fits = [];
      this.sureNow = false;
    }
    this.clockChanges = clockChanges;
    if (this.sureNow || !a) return this.sureNow;
    const g = a.grid;
    // a beat heard but not precise or not confident is left out, as an analysis without a beat is: the run goes on
    if (a.beat && g && g.sd <= SURE_SD && a.confidence >= SURE_CONFIDENCE) this.fits.push({ t: a.time, bpm: g.bpm });
    while (this.fits.length && this.fits[0]!.t < a.time - SURE_SECONDS) this.fits.shift();
    if (this.fits.length < SURE_FITS || clockBpm === null) return false;
    const bpms = this.fits.map((f) => f.bpm);
    const lo = Math.min(...bpms);
    const hi = Math.max(...bpms);
    if (hi - lo > SURE_SPREAD) return false;
    if (Math.abs((lo + hi) / 2 - clockBpm) > SAME_BPM) return false;
    this.sureNow = true;
    return true;
  }
}
