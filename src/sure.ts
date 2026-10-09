/**
 * When the detected tempo is sure: the main page stops the microphone by itself then (Continuous listen off).
 *
 * Sure means a steady, precise fit that the beat clock has taken: over the last SURE_SECONDS the analyses that heard a
 * beat were at least SURE_FITS, every one with a grid standard error of at most SURE_SD BPM and a confidence of at
 * least SURE_CONFIDENCE, all within SURE_SPREAD BPM of each other, and within SAME_BPM of the clock's tempo. An analysis
 * without a beat says nothing either way (src/beatClock.ts does the same): it is skipped, not counted against.
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

  get sure(): boolean { return this.sureNow; }

  reset(): void {
    this.fits = [];
    this.sureNow = false;
  }

  /** Takes one analysis and the beat clock's tempo; whether the tempo is sure now. Once sure, it stays sure until reset. */
  update(a: Analysis | null, clockBpm: number | null): boolean {
    if (this.sureNow || !a) return this.sureNow;
    const g = a.grid;
    if (a.beat && g && g.sd <= SURE_SD && a.confidence >= SURE_CONFIDENCE) this.fits.push({ t: a.time, bpm: g.bpm });
    else if (a.beat && g) this.fits = []; // a beat heard but not precise or not confident: the run starts again
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
