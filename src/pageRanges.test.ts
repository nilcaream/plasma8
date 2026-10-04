import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAIN, DEFAULT_SHAPE, VOICES, VOICE_NAMES, drawAmounts, voiceEnvelope, windowEnvelope,
} from './beatVoices';
import { TapClock, clampBpm } from './clock';
import { DAMPING, drawHarmonic, weights } from './harmonics';
import { BEATS, HARMONICS, LIVE, type Range } from './pageRanges';
import { createRng } from './rng';
import { sanitizeSettings } from './settings';

/** Every sample inside the range, and the samples reach close to both ends: the range is the draw's, no wider and no narrower. */
function spans(samples: number[], r: Range): void {
  for (const s of samples) {
    expect(s).toBeGreaterThanOrEqual(r.min);
    expect(s).toBeLessThanOrEqual(r.max);
  }
  expect(Math.min(...samples)).toBeLessThan(r.min + 0.01 * (r.max - r.min));
  expect(Math.max(...samples)).toBeGreaterThan(r.max - 0.01 * (r.max - r.min));
}

describe('the random sliders span exactly what the app draws', () => {
  const rng = createRng(2024);
  const harmonics = Array.from({ length: 4000 }, () => drawHarmonic(rng));
  const amounts = Array.from({ length: 4000 }, () => drawAmounts(rng));

  it('harmonics: f_0..f_3, the width share and the offset', () => {
    HARMONICS.factors.forEach((r, k) => spans(harmonics.map((d) => d.factors[k]!), r));
    spans(harmonics.map((d) => d.widthShare), HARMONICS.width);
    spans(harmonics.map((d) => d.offsetShare), HARMONICS.offset);
  });

  it('beats: each voice strength', () => {
    for (const name of VOICE_NAMES) spans(amounts.map((a) => a[name]), BEATS.amount);
  });
});

describe('the live sliders span exactly what the app accepts', () => {
  it('intensity: what a stored value is clamped to', () => {
    expect(sanitizeSettings({ intensity: -5 }).intensity).toBe(LIVE.intensity.min);
    expect(sanitizeSettings({ intensity: 5 }).intensity).toBe(LIVE.intensity.max);
    expect(LIVE.intensity).toEqual({ min: 0, max: 1 });
  });

  it('BPM: what the tap clock can reach', () => {
    expect(clampBpm(1)).toBe(LIVE.bpm.min);
    expect(clampBpm(10000)).toBe(LIVE.bpm.max);
    const fast = new TapClock(0);
    for (let i = 0; i < 8; i++) fast.tap(i * 130); // as fast as taps count: 461 BPM
    expect(fast.read(2000).bpm).toBe(LIVE.bpm.max);
    const slow = new TapClock(0);
    for (let i = 0; i < 4; i++) slow.tap(i * 1900); // as slow as a run allows: 31.6 BPM
    expect(slow.read(8000).bpm).toBe(LIVE.bpm.min);
  });
});

describe('the fixed sliders stay where the code works', () => {
  it('a rise up to the maximum keeps every peak on its onset and never overlaps a fall', () => {
    const r = BEATS.rise.max;
    for (const name of VOICE_NAMES) {
      const v = VOICES[name];
      expect(r).toBeLessThanOrEqual(v.length);
      for (let b = 0; b < 8; b += 1 / 64) {
        const onset = ((b - v.onset) % v.period + v.period) % v.period === 0;
        const e = voiceEnvelope(v, b, r, BEATS.power.min);
        if (onset) expect(e).toBe(1); else expect(e).toBeLessThan(1);
      }
    }
  });

  it('the lowest fall power still falls: the peak is on the onset alone', () => {
    expect(BEATS.power.min).toBeGreaterThan(0);
    expect(windowEnvelope(0.01, 1, 0.1, BEATS.power.min)).toBeLessThan(1);
  });

  it('the damping stays where its powers are defined and finite', () => {
    expect(HARMONICS.damping.min).toBeGreaterThan(0);
    for (const base of [HARMONICS.damping.min, HARMONICS.damping.max]) {
      const w = weights([1, 1, 1, 1], 0, base);
      for (const wk of w) expect(Number.isFinite(wk) && wk > 0).toBe(true);
    }
  });

  it('the fixed spans reach well beyond the code values, for trying them', () => {
    expect(BEATS.rise.max).toBeGreaterThanOrEqual(5 * DEFAULT_SHAPE.a0);
    expect(BEATS.power.max).toBeGreaterThanOrEqual(3 * DEFAULT_SHAPE.p1);
    expect(BEATS.gain.max).toBeGreaterThanOrEqual(3 * DEFAULT_GAIN);
    expect(HARMONICS.damping.max).toBeGreaterThanOrEqual(3 * DAMPING);
  });
});
