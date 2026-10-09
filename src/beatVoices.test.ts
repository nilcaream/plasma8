import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHAPE, MAX_FLASHES_PER_S, VOICES, VOICE_NAMES, fallPower, flash, light, relativeAmounts, relativeAmountsOf, rise, voiceEnvelope,
  windowEnvelope,
} from './beatVoices';

const INTENSITIES = [0, 0.25, 0.5, 0.75, 1];
const RISES = [0, 0.02, 0.1, 0.26, 0.5, 0.75, 1];
const POWERS = [0.5, 1, 2.5, 4, 8];
const STEP = 1 / 256; // a grid that lands exactly on every beat

/** Every position on the grid over two bars, from beat 1. */
const grid = (): number[] => Array.from({ length: 8 * 256 + 1 }, (_, i) => i * STEP);

/** The beats of the bar where a voice has an onset, over two bars. */
const onsets = (name: keyof typeof VOICES): number[] => {
  const v = VOICES[name];
  const out: number[] = [];
  for (let b = v.onset; b <= 8; b += v.period) out.push(b);
  return out;
};

describe('rise and fallPower', () => {
  it('run from the intensity-0 values to the intensity-1 values', () => {
    expect(rise(0)).toBeCloseTo(DEFAULT_SHAPE.a0, 12);
    expect(rise(1)).toBeCloseTo(DEFAULT_SHAPE.a1, 12);
    expect(fallPower(0)).toBeCloseTo(DEFAULT_SHAPE.p0, 12);
    expect(fallPower(1)).toBeCloseTo(DEFAULT_SHAPE.p1, 12);
    // the settled shape: a longer, softer rise and gentler fall at 0
    expect(DEFAULT_SHAPE).toEqual({ a0: 0.165, a1: 0.045, p0: 1.7, p1: 5 });
    expect(rise(0.5)).toBeCloseTo(0.105, 12);
    expect(fallPower(0.5)).toBeCloseTo(3.35, 12);
  });
});

describe('windowEnvelope', () => {
  it('is 1 on the onset and below it everywhere else, for every rise and power', () => {
    for (const length of [1, 2, 4]) {
      for (const r of RISES) {
        for (const p of POWERS) {
          expect(windowEnvelope(0, length, r, p)).toBe(1);
          for (let t = -length; t <= length + 1; t += STEP) {
            if (t === 0) continue;
            expect(windowEnvelope(t, length, r, p)).toBeLessThan(1);
            expect(windowEnvelope(t, length, r, p)).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it('rises only in the r beats before the onset and has fallen to 0 at L - r', () => {
    for (const length of [1, 2, 4]) {
      for (const r of RISES) {
        expect(windowEnvelope(-r - STEP, length, r, 2)).toBe(0);
        expect(windowEnvelope(length - r, length, r, 2)).toBe(r === length ? 1 : 0);
        expect(windowEnvelope(length - r + STEP, length, r, 2)).toBe(0);
        if (r > 0) {
          expect(windowEnvelope(-r / 2, length, r, 2)).toBeCloseTo(0.5, 12);
          expect(windowEnvelope(-r / 4, length, r, 2)).toBeGreaterThan(0.5);
        }
      }
    }
  });
});

describe('voiceEnvelope', () => {
  it('is 1 on every onset of every voice, for a grid of intensity, rise and power', () => {
    for (const name of VOICE_NAMES) {
      for (const I of INTENSITIES) {
        for (const a0 of [0.25, 0.5, 1]) {
          for (const p1 of [1, 4, 8]) {
            const shape = { ...DEFAULT_SHAPE, a0, p1 };
            const r = rise(I, shape), p = fallPower(I, shape);
            for (const b of onsets(name)) expect(voiceEnvelope(VOICES[name], b, r, p)).toBe(1);
          }
        }
      }
    }
  });

  it('never peaks off the beat: everywhere off an onset it is below 1', () => {
    for (const name of VOICE_NAMES) {
      const on = new Set(onsets(name));
      for (const r of RISES) {
        for (const p of POWERS) {
          for (const b of grid()) {
            if (on.has(b)) continue;
            expect(voiceEnvelope(VOICES[name], b, r, p)).toBeLessThan(1);
          }
        }
      }
    }
  });

  it('is 0 outside its windows and their rises: the snare is dark on beats 1 and 3 until its rise before 2 and 4', () => {
    for (const r of RISES) {
      for (const b of grid()) {
        const inPair = b % 2;
        const lit = inPair >= 1 - r && inPair <= 2 - r;
        if (!lit) expect(voiceEnvelope(VOICES.snare, b, r, 2)).toBe(0);
      }
    }
  });

  it('is 0 outside its window and rise: the crash lights only beat 1 and the rise before it', () => {
    for (const r of RISES) {
      for (const b of grid()) {
        const inBar = b % 4;
        const lit = inBar <= 1 - r || inBar >= 4 - r;
        if (!lit) expect(voiceEnvelope(VOICES.crash, b, r, 2)).toBe(0);
      }
    }
  });

  it("never overlaps a voice's own rise and fall: the fall ends before the next rise starts", () => {
    for (const name of VOICE_NAMES) {
      const v = VOICES[name];
      for (const r of RISES) {
        const fallEnd = v.length - r;
        const nextRise = v.period - r;
        expect(fallEnd).toBeLessThanOrEqual(nextRise);
        // the rise of the next onset never starts while the fall is still lit
        for (let t = 0; t < v.period; t += STEP) {
          const fall = windowEnvelope(t, v.length, r, 2);
          const next = windowEnvelope(t - v.period, v.length, r, 2);
          expect(fall > 0 && next > 0).toBe(false);
        }
      }
    }
  });
});

describe('flash and light', () => {
  const amounts = { kick: 0.3, snare: 0.1, crash: 0.8 };

  it('sums the voices as I·A·e, capped at 1, and is dark at intensity 0', () => {
    const f = flash(0, 1, amounts);
    expect(f.voices.kick).toBeCloseTo(0.3, 12);
    expect(f.voices.snare).toBe(0);
    expect(f.voices.crash).toBeCloseTo(0.8, 12);
    expect(f.total).toBeCloseTo(1, 12);
    expect(flash(1, 0.5, amounts).voices.snare).toBeCloseTo(0.05, 12);
    expect(flash(3, 0.5, amounts).voices.snare).toBeCloseTo(0.05, 12);
    expect(flash(2, 0.5, amounts).voices.snare).toBe(0);
    expect(flash(4, 0.5, amounts).voices.crash).toBeCloseTo(0.4, 12);
    expect(flash(2, 0.5, amounts).voices.crash).toBe(0);
    for (const name of VOICE_NAMES) expect(VOICES[name].length).toBe(1);
    expect(flash(0, 1, { kick: 1, snare: 1, crash: 1 }).total).toBe(1);
    for (const b of grid()) expect(flash(b, 0, amounts).total).toBe(0);
  });

  it('flashes the strongest voice at exactly the strobe level once the strengths are divided by the largest', () => {
    const relative = relativeAmounts({ kick: 0.3, snare: 0.1, crash: 0.6 });
    expect(relative).toEqual({ kick: 0.5, snare: 0.1 / 0.6, crash: 1 });
    expect(flash(0, 0.4, relative).voices.crash).toBeCloseTo(0.4, 12);
    expect(flash(0, 0.4, { kick: 0.3, snare: 0.1, crash: 0.6 }).voices.crash).toBeCloseTo(0.24, 12);
    expect(relativeAmounts({ kick: 0, snare: 0, crash: 0 })).toEqual({ kick: 0, snare: 0, crash: 0 });
    expect(relativeAmounts({ kick: 0.2, snare: 0.1, crash: 0.05 })).toEqual(relativeAmountsOf({ 'A.kick': 0.2, 'A.snare': 0.1, 'A.crash': 0.05 }));
  });

  it('lights 1 + G·F', () => {
    expect(light(0, 2)).toBe(1);
    expect(light(0.5, 2)).toBe(2);
  });
});

describe('the flash cap: at most 3 strong flashes in any second', () => {
  it('sounds every beat, whatever the tempo: the kick peaks on each, the snare on 2 and 4, the crash on 1', () => {
    const r = rise(1);
    const p = fallPower(1);
    for (let beat = 0; beat < 8; beat++) {
      expect(voiceEnvelope(VOICES.kick, beat, r, p)).toBe(1);
      expect(voiceEnvelope(VOICES.snare, beat, r, p) === 1).toBe(beat % 2 === 1);
      expect(voiceEnvelope(VOICES.crash, beat, r, p) === 1).toBe(beat % 4 === 0);
    }
  });

  it('puts never more than 3 onsets in any second, at every tempo from 60 to 180 BPM', () => {
    for (let bpm = 60; bpm <= 180; bpm += 0.5) {
      const times: number[] = [];
      for (let beat = 0; beat < 64; beat++) {
        const sounds = VOICE_NAMES.some((name) => voiceEnvelope(VOICES[name], beat, rise(1), fallPower(1)) === 1);
        if (sounds) times.push((beat * 60) / bpm);
      }
      for (let i = 0; i + MAX_FLASHES_PER_S < times.length; i++) {
        expect(times[i + MAX_FLASHES_PER_S]! - times[i]!).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
  });
});
