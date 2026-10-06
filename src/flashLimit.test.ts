import { describe, expect, it } from 'vitest';
import { DEFAULT_SHAPE, MAX_FLASHES_PER_S, flash, flashStep } from './beatVoices';
import { TapClock } from './clock';
import { FlashLimiter } from './flashLimit';

const amounts = { kick: 1, snare: 1, crash: 1 };

/** The flash a frame at `t` ms shows, with the strobe at 1 and every voice at full strength: the clock, the limiter, then the flash. */
function frames(bpm: number, taps: readonly number[], to: number, limited = true): number[] {
  const clock = new TapClock(0, bpm);
  const limiter = new FlashLimiter();
  const out: number[] = [];
  for (let t = 0; t <= to; t++) {
    if (taps.includes(t)) clock.tap(t);
    const r = clock.read(t);
    const step = flashStep(r.bpm);
    out.push(flash(r.beats, !limited || limiter.allow(r.beats, r.bpm, step, t) ? 1 : 0, amounts, DEFAULT_SHAPE, step).total);
  }
  return out;
}

/** The most flash peaks (local maxima of at least 0.5) in any closed second. */
function mostPeaksInASecond(f: readonly number[]): number {
  const peaks: number[] = [];
  for (let t = 1; t < f.length - 1; t++) if (f[t]! >= 0.5 && f[t]! > f[t - 1]! && f[t]! >= f[t + 1]!) peaks.push(t);
  let most = 0;
  for (let i = 0; i < peaks.length; i++) {
    let n = 0;
    for (let j = i; j < peaks.length && peaks[j]! - peaks[i]! <= 1000; j++) n++;
    most = Math.max(most, n);
  }
  return most;
}

describe('the flash cap against the clock', () => {
  it('keeps every second to 3 flashes when one tap starts a fresh count at any phase', () => {
    for (const bpm of [100, 120, 140, 150, 170, 178, 200, 240]) {
      const beatMs = 60000 / bpm;
      for (let phase = 0; phase < 4 * beatMs; phase += 7) {
        const tap = 4000 + Math.round(phase);
        expect(mostPeaksInASecond(frames(bpm, [tap], tap + 2500)), `${bpm} BPM, tap at ${tap} ms`).toBeLessThanOrEqual(MAX_FLASHES_PER_S);
      }
    }
  });

  it('keeps every second to 3 flashes when a run of taps refits the tempo and the phase', () => {
    for (const bpm of [140, 175, 240]) {
      const gap = 60000 / bpm;
      for (const nudge of [0, 40, 90, 150]) {
        const taps = [0, 1, 2, 3, 4, 5].map((k) => Math.round(4000 + k * gap * 0.8 + (k % 2) * nudge));
        expect(mostPeaksInASecond(frames(bpm, taps, 9000)), `${bpm} BPM, nudge ${nudge}`).toBeLessThanOrEqual(MAX_FLASHES_PER_S);
      }
    }
  });

  it('leaves a steady grid alone: the same frames with and without the limiter, at every tempo', () => {
    for (const bpm of [40, 100, 120, 150, 179, 180, 200, 240]) {
      expect(frames(bpm, [], 9000)).toEqual(frames(bpm, [], 9000, false));
    }
  });
});

describe('FlashLimiter', () => {
  it('mutes a window whose peak is within a third of a second of the last peak and lets the next one through', () => {
    const limiter = new FlashLimiter();
    expect(limiter.allow(0, 120, 1, 1000)).toBe(true);
    expect(limiter.allow(0.5, 120, 1, 1250)).toBe(true);
    // a fresh count puts the beats back to 0 at 1300 ms: 300 ms after the last peak
    expect(limiter.allow(0, 120, 1, 1300)).toBe(false);
    expect(limiter.allow(0.4, 120, 1, 1500)).toBe(false);
    expect(limiter.allow(1, 120, 1, 1800)).toBe(true);
  });

  it('counts only the windows that sound: a silent odd onset does not hold the next one back', () => {
    const limiter = new FlashLimiter();
    expect(limiter.allow(2, 120, 2, 1000)).toBe(true);
    expect(limiter.allow(3, 120, 2, 1200)).toBe(true);
    expect(limiter.allow(4, 120, 2, 1400)).toBe(true);
  });
});
