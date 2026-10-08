/**
 * The onset envelope of the /tempo/ page: audio in, one value per band per
 * hop out. Each hop takes a Hann-windowed frame, compresses the magnitude
 * spectrum with log(1 + γ|X|) (so a level change hardly moves it), and sums
 * the rise of every bin against the frame two hops back (spectral flux), per
 * band, as a mean per bin.
 */

import { Fft } from './tempoFft';

/** Band edges in Hz: kick, low body, snare crack, hats. */
export const BAND_EDGES = [25, 140, 700, 5000, 16000] as const;
export const BANDS = BAND_EDGES.length - 1;
/** Frames per second the envelope aims at; the hop is the nearest whole number of samples. */
export const FRAME_RATE = 200;
const GAMMA = 100;
/** The flux compares a frame with the one this many hops back. */
const FLUX_LAG = 2;

export class OnsetEnvelope {
  readonly fs: number;
  readonly n: number;
  readonly hop: number;
  /** Frames per second, exactly: fs / hop. */
  readonly rate: number;
  /**
   * Seconds from frame k's time k / rate to the centre of its window: the first frame comes at the first
   * hop once the window is full, and a hit shows in the frames around the one centred on it.
   */
  readonly delay: number;
  /** Frames produced since the start. */
  frames = 0;

  private readonly fft: Fft;
  private readonly win: Float64Array;
  private readonly ring: Float32Array;
  private ringPos = 0;
  private sinceHop = 0;
  private filled = 0;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly logs: Float64Array[];
  private readonly bandOf: Int8Array;
  private readonly bandBins: number[];

  constructor(fs: number) {
    this.fs = fs;
    this.n = fs > 60000 ? 2048 : 1024;
    this.hop = Math.round(fs / FRAME_RATE);
    this.rate = fs / this.hop;
    this.delay = (Math.ceil(this.n / this.hop) * this.hop - this.n / 2) / fs;
    this.fft = new Fft(this.n);
    this.win = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / this.n);
    this.ring = new Float32Array(this.n);
    this.re = new Float64Array(this.n);
    this.im = new Float64Array(this.n);
    const bins = this.n / 2 + 1;
    this.logs = Array.from({ length: FLUX_LAG + 1 }, () => new Float64Array(bins));
    this.bandOf = new Int8Array(bins).fill(-1);
    this.bandBins = new Array(BANDS).fill(0);
    for (let k = 1; k < bins; k++) {
      const f = (k * fs) / this.n;
      for (let b = 0; b < BANDS; b++) {
        if (f >= BAND_EDGES[b]! && f < BAND_EDGES[b + 1]!) { this.bandOf[k] = b; this.bandBins[b]!++; }
      }
    }
  }

  /** Feeds samples; calls out(bands) once per finished hop, with a fresh array per call. */
  push(samples: Float32Array, out: (bands: Float32Array) => void): void {
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.ringPos] = samples[i]!;
      this.ringPos = (this.ringPos + 1) % this.n;
      if (this.filled < this.n) this.filled++;
      if (++this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        if (this.filled === this.n) out(this.frame());
      }
    }
  }

  private frame(): Float32Array {
    const { n, re, im, win, ring } = this;
    for (let i = 0; i < n; i++) {
      re[i] = ring[(this.ringPos + i) % n]! * win[i]!;
      im[i] = 0;
    }
    this.fft.transform(re, im);
    // the oldest log spectrum becomes the newest
    const cur = this.logs.shift()!;
    this.logs.push(cur);
    const old = this.logs[0]!;
    const bands = new Float32Array(BANDS);
    for (let k = 1; k < cur.length; k++) {
      cur[k] = Math.log1p(GAMMA * Math.hypot(re[k]!, im[k]!));
      const b = this.bandOf[k]!;
      if (b >= 0) {
        const d = cur[k]! - old[k]!;
        if (d > 0) bands[b]! += d;
      }
    }
    for (let b = 0; b < BANDS; b++) bands[b]! /= Math.max(1, this.bandBins[b]!);
    // the first frames compare with an empty spectrum
    if (this.frames++ < FLUX_LAG) bands.fill(0);
    return bands;
  }
}
