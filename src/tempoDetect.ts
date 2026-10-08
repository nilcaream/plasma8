/**
 * Tempo from an onset envelope, for the /tempo/ page: 110–150 BPM, octave
 * safe. Three readings come out of one analysis:
 *
 * - comb: the autocorrelation of each band's envelope over the last
 *   COMB_SECONDS, normalised per band and summed, read by a comb of the first
 *   four multiples of every candidate beat period in the range. A snare on
 *   2 and 4 only (half the beat rate) still lands on the 2nd and 4th teeth of
 *   the true tempo's comb, and on no comb of any other tempo in the range,
 *   because the range is less than an octave wide.
 * - grid: the comb's tempo refined by a weighted least-squares line through
 *   the picked onset peaks on a half-beat grid, grown from the last 4 s to
 *   the last FIT_SECONDS, like the tap clock's line through taps.
 * - ioi: a histogram of the intervals between peaks, folded into the range
 *   by octaves: the simple method, kept as a baseline.
 */

import { BANDS, OnsetEnvelope } from './onsets';

export const MIN_BPM = 110;
export const MAX_BPM = 150;
/** The candidates reach a little past the range, so its edges are found like any tempo inside. */
export const SEARCH_LO = 106;
export const SEARCH_HI = 154;
const SEARCH_STEP = 0.05;
const COMB_SECONDS = 12;
const FIT_SECONDS = 32;
const HISTORY_SECONDS = 34;
/** Weights of the comb's teeth at 1, 2, 3 and 4 beat periods. */
const TEETH = [1, 1, 0.6, 0.6];
/** Before this much envelope there is no reading. */
const MIN_SECONDS = 2.5;
const PEAK_HALF = 0.05;
const PEAK_K = 0.5;
const LOCAL_SECONDS = 1;
/** The first stage is also the beat test, long enough for a snare on 2 and 4 at 110 to hit 5 times. */
const FIT_STAGES = [6, 12, 24, 32];
/** Wide view for the page: from this BPM to WIDE_HI, log-spaced. */
export const WIDE_LO = 50;
export const WIDE_HI = 320;
const WIDE_POINTS = 240;

export type Method = 'grid' | 'comb' | 'ioi';
export const METHODS: readonly Method[] = ['grid', 'comb', 'ioi'];

export interface Peak { t: number; strength: number; onGrid: boolean }

export interface GridFit {
  bpm: number;
  /** Standard error of the fitted tempo, BPM. */
  sd: number;
  /** A beat (or half-beat) time, seconds, and the beat period. */
  phase: number;
  period: number;
  inliers: number;
  /** Share of the peaks' strength that lies on the grid, 0..1. */
  onGridShare: number;
  rmsMs: number;
  span: number;
}

export interface Analysis {
  /** Seconds of audio seen since the last reset (newest frame). */
  time: number;
  /** Hits on a beat grid in the last seconds; without, the readings are the last ones that had a beat. */
  beat: boolean;
  readings: Record<Method, number | null>;
  grid: GridFit | null;
  /** The comb: score per candidate BPM, SEARCH_LO..SEARCH_HI in SEARCH_STEP. */
  combScore: Float64Array;
  /** Summed band autocorrelation read at the beat period of each BPM, WIDE_LO..WIDE_HI log-spaced. */
  wide: Float64Array;
  /** The combined onset envelope over the fit window, and the time of its first frame. */
  odf: Float32Array;
  odfStart: number;
  rate: number;
  peaks: Peak[];
  /** 0..1: how sure the reading is (share of onset strength on the grid, scaled by the comb's contrast). */
  confidence: number;
}

export const combBpm = (i: number): number => SEARCH_LO + i * SEARCH_STEP;
export const COMB_POINTS = Math.round((SEARCH_HI - SEARCH_LO) / SEARCH_STEP) + 1;
export const wideBpm = (i: number): number => WIDE_LO * Math.pow(WIDE_HI / WIDE_LO, i / (WIDE_POINTS - 1));

export class TempoDetector {
  readonly env: OnsetEnvelope;
  readonly rate: number;
  private readonly cap: number;
  private readonly hist: Float32Array[];
  /** Frames stored since the reset, and the stored ones (at most cap). */
  private total = 0;
  /** The readings of the last analysis that heard a beat. */
  private held: Record<Method, number | null> | null = null;

  constructor(fs: number) {
    this.env = new OnsetEnvelope(fs);
    this.rate = this.env.rate;
    this.cap = Math.ceil(HISTORY_SECONDS * this.rate);
    this.hist = Array.from({ length: BANDS }, () => new Float32Array(this.cap));
  }

  push(samples: Float32Array): void {
    this.env.push(samples, (bands) => {
      const at = this.total % this.cap;
      for (let b = 0; b < BANDS; b++) this.hist[b]![at] = bands[b]!;
      this.total++;
    });
  }

  /** Forget everything heard: the next reading starts from scratch. */
  reset(): void {
    this.total = 0;
    this.held = null;
    for (const h of this.hist) h.fill(0);
  }

  get seconds(): number { return this.total / this.rate; }

  /** The last n frames of band b, oldest first. */
  private last(b: number, n: number): Float64Array {
    const out = new Float64Array(n);
    const h = this.hist[b]!;
    for (let i = 0; i < n; i++) out[i] = h[(this.total - n + i) % this.cap]!;
    return out;
  }

  analyse(): Analysis | null {
    const rate = this.rate;
    if (this.total < MIN_SECONDS * rate) return null;
    const time = this.total / rate;

    // --- periodicity: per-band autocorrelation, normalised, summed -----------------
    const nc = Math.min(this.total, Math.round(COMB_SECONDS * rate), this.cap);
    const maxLag = Math.min(nc - 1, Math.ceil((TEETH.length * 60 * rate) / SEARCH_LO) + 2);
    const acf = new Float64Array(maxLag + 1);
    const bandAcf: Float64Array[] = [];
    for (let b = 0; b < BANDS; b++) {
      const x = this.last(b, nc);
      let mean = 0;
      for (let i = 0; i < nc; i++) mean += x[i]!;
      mean /= nc;
      let e = 0;
      for (let i = 0; i < nc; i++) { x[i] = x[i]! - mean; e += x[i]! * x[i]!; }
      const r = new Float64Array(maxLag + 1);
      bandAcf.push(r);
      if (e <= 1e-12) continue;
      e /= nc;
      for (let l = 1; l <= maxLag; l++) {
        let s = 0;
        for (let i = 0; i + l < nc; i++) s += x[i]! * x[i + l]!;
        r[l] = s / (nc - l) / e;
        acf[l]! += r[l]!;
      }
    }
    const at = (r: Float64Array, lag: number): number => {
      const i = Math.floor(lag);
      if (i < 0 || i + 1 >= r.length) return 0;
      const f = lag - i;
      return r[i]! * (1 - f) + r[i + 1]! * f;
    };

    // --- comb over the candidates ---------------------------------------------------
    const combScore = new Float64Array(COMB_POINTS);
    let best = 0;
    for (let c = 0; c < COMB_POINTS; c++) {
      const period = (60 * rate) / combBpm(c);
      let s = 0, w = 0;
      for (let k = 0; k < TEETH.length; k++) {
        const lag = (k + 1) * period;
        if (lag > maxLag - 1 || lag > nc * 0.75) break;
        s += TEETH[k]! * at(acf, lag);
        w += TEETH[k]!;
      }
      combScore[c] = w > 0 ? s / w : 0;
      if (combScore[c]! > combScore[best]!) best = c;
    }
    const combReading = combBpm(best) + SEARCH_STEP * parabola(combScore, best);
    const sorted = Array.from(combScore).sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1]!;
    const contrast = combScore[best]! > 0 ? Math.max(0, Math.min(1, (combScore[best]! - median) / combScore[best]!)) : 0;

    const wide = new Float64Array(WIDE_POINTS);
    for (let i = 0; i < WIDE_POINTS; i++) wide[i] = at(acf, (60 * rate) / wideBpm(i));

    // --- combined envelope over the fit window, weighted by each band's periodicity --
    const nf = Math.min(this.total, Math.round(FIT_SECONDS * rate), this.cap);
    const beatLag = (60 * rate) / combReading;
    const weights = bandAcf.map((r) => Math.max(0, at(r, beatLag)) + Math.max(0, at(r, 2 * beatLag)));
    if (weights.every((w) => w <= 0)) weights.fill(1);
    const odf = new Float32Array(nf);
    for (let b = 0; b < BANDS; b++) {
      if (weights[b]! <= 0) continue;
      const x = this.last(b, nf);
      let mean = 0, sq = 0;
      for (let i = 0; i < nf; i++) { mean += x[i]!; sq += x[i]! * x[i]!; }
      mean /= nf;
      const sd = Math.sqrt(Math.max(1e-12, sq / nf - mean * mean));
      for (let i = 0; i < nf; i++) odf[i]! += (weights[b]! * Math.max(0, x[i]! - mean)) / sd;
    }
    const odfStart = (this.total - nf) / rate;

    const peaks = pickPeaks(odf, rate, odfStart);
    const grid = fitGrid(peaks, 60 / combReading, time);
    const gridOk = grid !== null && Math.abs(grid.bpm - combReading) < 1.5;
    const ioi = ioiTempo(peaks);

    // no hits on a beat grid lately (a breakdown, talk, silence): every method keeps its last reading with a beat
    const beat = grid !== null;
    const fresh: Record<Method, number | null> = { grid: gridOk ? grid!.bpm : combReading, comb: combReading, ioi };
    if (beat) this.held = fresh;
    const readings = beat || !this.held ? fresh : this.held;
    const confidence = beat ? (gridOk ? grid!.onGridShare : 0.5) * Math.min(1, contrast * 1.5) : 0;
    return { time, beat, readings, grid: gridOk ? grid : null, combScore, wide, odf, odfStart, rate, peaks, confidence };
  }
}

/** Offset in steps of the vertex of the parabola through i-1, i, i+1. */
function parabola(y: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= y.length - 1) return 0;
  const a = y[i - 1]!, b = y[i]!, c = y[i + 1]!;
  const d = a - 2 * b + c;
  return d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
}

/** Local maxima above the local mean + PEAK_K local deviations, timed to a fraction of a frame. */
export function pickPeaks(odf: Float32Array, rate: number, start: number): Peak[] {
  const n = odf.length;
  const half = Math.max(1, Math.round(PEAK_HALF * rate));
  const local = Math.round(LOCAL_SECONDS * rate);
  const s1 = new Float64Array(n + 1), s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { s1[i + 1] = s1[i]! + odf[i]!; s2[i + 1] = s2[i]! + odf[i]! * odf[i]!; }
  const peaks: Peak[] = [];
  for (let i = 1; i < n - half; i++) {
    const v = odf[i]!;
    if (v <= 0) continue;
    let isMax = true;
    for (let j = Math.max(0, i - half); j <= i + half; j++) {
      if (odf[j]! > v || (odf[j]! === v && j < i)) { isMax = false; break; }
    }
    if (!isMax) continue;
    const a = Math.max(0, i - local), b = Math.min(n, i + local + 1);
    const m = (s1[b]! - s1[a]!) / (b - a);
    const sd = Math.sqrt(Math.max(0, (s2[b]! - s2[a]!) / (b - a) - m * m));
    if (v <= m + PEAK_K * sd) continue;
    peaks.push({ t: start + (i + parabola(odf, i)) / rate, strength: v - m, onGrid: false });
  }
  return peaks;
}

interface Line {
  /** Intercept (seconds, from the phase given) and slope (seconds per half beat), the slope's standard error. */
  a: number; b: number; se: number;
  rms: number; n: number;
  /** Strength on the grid and of all peaks given. */
  inW: number; allW: number;
  span: number;
}

/** Weighted least squares of the peaks within tol of the grid phase + m·half, against m. */
function fitLine(peaks: Peak[], phase: number, half: number, tol: number): Line | null {
  let W = 0, Wm = 0, Wt = 0, n = 0, allW = 0;
  const ms: number[] = [], ts: number[] = [], ws: number[] = [];
  for (const p of peaks) {
    allW += p.strength;
    const m = Math.round((p.t - phase) / half);
    const e = p.t - phase - m * half;
    if (Math.abs(e) > tol) continue;
    ms.push(m); ts.push(p.t - phase); ws.push(p.strength);
    W += p.strength; Wm += p.strength * m; Wt += p.strength * (p.t - phase); n++;
  }
  if (n < 3) return null;
  const mx = Wm / W, my = Wt / W;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = ms[i]! - mx; sxx += ws[i]! * dx * dx; sxy += ws[i]! * dx * (ts[i]! - my); }
  if (sxx <= 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  let rr = 0;
  for (let i = 0; i < n; i++) { const r = ts[i]! - a - b * ms[i]!; rr += ws[i]! * r * r; }
  const rms = Math.sqrt(rr / W);
  // weights scaled to a mean of 1 for the standard error
  const se = Math.sqrt(((rr / W) * n) / Math.max(1, n - 2) / ((sxx * n) / W));
  return { a, b, se, rms, n, inW: W, allW, span: (Math.max(...ms) - Math.min(...ms)) * b };
}

/**
 * A line t = phase + m·period/2 through the peaks on a half-beat grid,
 * weighted by strength: from the last 4 s, then 8, 16 and 32, each stage
 * assigning the peaks with the line of the stage before.
 */
export function fitGrid(peaks: Peak[], period0: number, now: number): GridFit | null {
  if (peaks.length < 6) return null;
  let half = period0 / 2;
  // phase: the offset of the half-beat grid that collects the most strength over the last 4 s
  const recent = peaks.filter((p) => p.t > now - FIT_STAGES[0]!);
  let phase = 0, bestScore = -1;
  const sigma = 0.01;
  for (let s = 0; s < 64; s++) {
    const ph = (s / 64) * half;
    let score = 0;
    for (const p of recent) {
      let e = (p.t - ph) / half;
      e = (e - Math.round(e)) * half;
      score += p.strength * Math.exp(-(e * e) / (2 * sigma * sigma));
    }
    if (score > bestScore) { bestScore = score; phase = ph; }
  }
  // keep the phase near now, so the intercept is well conditioned
  phase += Math.round((now - phase) / half) * half;

  let tol = 0.15 * half;
  let fit: Line | null = null;
  for (const seconds of FIT_STAGES) {
    // grow only while the line, carried back to the stage's start, is still sure to half the tolerance
    if (fit && (fit.se * seconds) / half > tol / 2) break;
    const use = peaks.filter((p) => p.t > now - seconds);
    let line = fitLine(use, phase, half, tol);
    // the first stage is the beat test: enough hits on the grid in the last seconds, most of the strength
    if (!line || line.n < (fit ? 6 : 4) || (!fit && line.inW < 0.5 * line.allW)) break;
    // once more without the hits far off the first line (claps, ghost notes)
    const trimmed = fitLine(use, phase + line.a, line.b, Math.max(0.008, Math.min(tol, 3 * line.rms)));
    if (trimmed && trimmed.n >= 0.7 * line.n) line = { ...trimmed, a: trimmed.a + line.a, allW: line.allW };
    // a longer stage that moves the slope by more than both stages' errors allow is a different tempo
    if (fit && Math.abs(line.b - half) > 4 * Math.hypot(fit.se, line.se) + 1e-6) break;
    fit = line;
    phase += line.a;
    half = line.b;
    tol = Math.max(0.012, Math.min(0.15 * half, 4 * line.rms));
  }
  if (!fit || fit.span < 2) return null;
  for (const p of peaks) {
    const e = (p.t - phase) / half;
    p.onGrid = Math.abs(e - Math.round(e)) * half <= tol;
  }
  const period = 2 * half;
  return {
    bpm: 60 / period,
    sd: (60 / (period * period)) * 2 * fit.se,
    phase,
    period,
    inliers: fit.n,
    onGridShare: fit.inW / Math.max(1e-12, fit.allW),
    rmsMs: fit.rms * 1000,
    span: fit.span,
  };
}

/** Intervals between peaks (up to 2.2 s apart), folded by octaves into the search range, as a smoothed histogram. */
export function ioiTempo(peaks: Peak[]): number | null {
  if (peaks.length < 4) return null;
  const hist = new Float64Array(COMB_POINTS);
  const sigma = 0.5 / SEARCH_STEP;
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      const d = peaks[j]!.t - peaks[i]!.t;
      if (d > 2.2) break;
      if (d < 0.1) continue;
      let bpm = 60 / d;
      while (bpm < SEARCH_LO) bpm *= 2;
      while (bpm > SEARCH_HI) bpm /= 2;
      if (bpm < SEARCH_LO) continue;
      const c = (bpm - SEARCH_LO) / SEARCH_STEP;
      const w = peaks[i]!.strength * peaks[j]!.strength;
      for (let k = Math.max(0, Math.floor(c - 3 * sigma)); k <= Math.min(COMB_POINTS - 1, Math.ceil(c + 3 * sigma)); k++) {
        hist[k]! += w * Math.exp(-((k - c) ** 2) / (2 * sigma * sigma));
      }
    }
  }
  let best = 0;
  for (let k = 1; k < COMB_POINTS; k++) if (hist[k]! > hist[best]!) best = k;
  return hist[best]! > 0 ? combBpm(best) + SEARCH_STEP * parabola(hist, best) : null;
}
