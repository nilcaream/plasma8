import { describe, expect, it } from 'vitest';
import { DEFAULT_SHAPE, MAX_FLASHES_PER_S, flash } from './beatVoices';
import { TapClock } from './clock';
import { FlashLimiter } from './flashLimit';

// the kick alone, on every beat: with all three voices on, their sum is capped at 1 for a stretch and the peak has no one frame
const amounts = { kick: 1, snare: 0, crash: 0 };

/** The flash a frame at `t` ms shows, with the strobe at 1 and every voice at full strength: the clock, the limiter, then the flash. */
function frames(bpm: number, taps: readonly number[], to: number, limited = true): number[] {
  const clock = new TapClock(0, bpm);
  const limiter = new FlashLimiter();
  const out: number[] = [];
  for (let t = 0; t <= to; t++) {
    if (taps.includes(t)) clock.tap(t);
    const r = clock.read(t);
    out.push(flash(r.beats, !limited || limiter.allow(r.beats, r.bpm, t) ? 1 : 0, amounts, DEFAULT_SHAPE).total);
  }
  return out;
}

/**
 * The most flash peaks (local maxima of at least 0.5) in any second: from a peak up to but not including 1000 ms
 * later, less `slackMs`. At 180 BPM four peaks sit a second apart, so rounding each end to a 1 ms frame needs 2 ms.
 */
function mostPeaksInASecond(f: readonly number[], slackMs = 2): number {
  const peaks: number[] = [];
  for (let t = 1; t < f.length - 1; t++) if (f[t]! >= 0.5 && f[t]! > f[t - 1]! && f[t]! >= f[t + 1]!) peaks.push(t);
  let most = 0;
  for (let i = 0; i < peaks.length; i++) {
    let n = 0;
    for (let j = i; j < peaks.length && peaks[j]! - peaks[i]! < 1000 - slackMs; j++) n++;
    most = Math.max(most, n);
  }
  return most;
}

describe('the flash cap against the clock', () => {
  it('keeps every second to 3 flashes when one tap starts a fresh count at any phase', () => {
    for (const bpm of [100, 120, 140, 150, 170, 178, 180]) {
      const beatMs = 60000 / bpm;
      for (let phase = 0; phase < 4 * beatMs; phase += 7) {
        const tap = 4000 + Math.round(phase);
        // 8 ms: a tap that lands just before a rising flash's peak cuts it short, so at 180 BPM (grid gap exactly a third of a second)
        // the cut flash can sit a few ms closer to the last peak than the limiter, which looks at windows, can hold
        expect(mostPeaksInASecond(frames(bpm, [tap], tap + 2500), 8), `${bpm} BPM, tap at ${tap} ms`).toBeLessThanOrEqual(MAX_FLASHES_PER_S);
      }
    }
  });

  it('keeps every second to 3 flashes when a run of taps refits the tempo and the phase', () => {
    for (const bpm of [140, 175, 180]) {
      const gap = 60000 / bpm;
      for (const nudge of [0, 40, 90, 150]) {
        const taps = [0, 1, 2, 3, 4, 5].map((k) => Math.round(4000 + k * gap * 0.8 + (k % 2) * nudge));
        expect(mostPeaksInASecond(frames(bpm, taps, 9000)), `${bpm} BPM, nudge ${nudge}`).toBeLessThanOrEqual(MAX_FLASHES_PER_S);
      }
    }
  });

  it('leaves a steady grid alone: the same frames with and without the limiter, at every tempo', () => {
    for (const bpm of [60, 100, 120, 150, 179, 180, 200, 240]) {
      expect(frames(bpm, [], 9000)).toEqual(frames(bpm, [], 9000, false));
    }
  });

  it('lets every beat flash at exactly 180 BPM: 3 a second, none cut by float noise', () => {
    const f = frames(180, [], 9000);
    expect(mostPeaksInASecond(f)).toBe(MAX_FLASHES_PER_S);
    expect(f.filter((v, t) => v >= 0.5 && v > f[t - 1]! && v >= f[t + 1]!)).toHaveLength(26); // beats 1..26; the 27th falls on the last frame
  });
});

describe('FlashLimiter', () => {
  it('mutes a window whose peak is within a third of a second of the last peak and lets the next one through', () => {
    const limiter = new FlashLimiter();
    expect(limiter.allow(0, 120, 1000)).toBe(true);
    expect(limiter.allow(0.5, 120, 1250)).toBe(true);
    // a fresh count puts the beats back to 0 at 1300 ms: 300 ms after the last peak
    expect(limiter.allow(0, 120, 1300)).toBe(false);
    expect(limiter.allow(0.4, 120, 1500)).toBe(false);
    expect(limiter.allow(1, 120, 1800)).toBe(true);
  });

  it('mutes the next window when the grid comes closer than a third of a second, but not at exactly a third', () => {
    const limiter = new FlashLimiter();
    expect(limiter.allow(0, 180, 1000)).toBe(true); // peak of window 0 at 1000 ms
    expect(limiter.allow(1, 180, 1000 + 60000 / 180)).toBe(true); // the next beat at exactly 180 BPM
    expect(limiter.allow(2, 180, 1000 + 2 * (60000 / 180) - 1)).toBe(false); // 1 ms too early
  });
});
