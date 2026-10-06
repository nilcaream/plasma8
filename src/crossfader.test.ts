import { describe, expect, it } from 'vitest';
import type { VoiceName } from './beatVoices';
import { MAX_TRAVEL, TRAVEL_AT_0, TRAVEL_AT_1, bandOf, crossfade, crossfaderState, drawRange, edgeOf, hitTime, stroke, travelFor, type Crossfader } from './crossfader';
import { createRng } from './rng';

/** One stroke length at every intensity, unless the test gives the two ends. */
const base = (voice: VoiceName, intensity = 1, travel = TRAVEL_AT_1, travel1 = travel): Crossfader =>
  ({ min: 2, max: 6, intensity, voice, travel0: travel, travel1 });

describe('bandOf', () => {
  it('is the middle at intensity 0 and the whole range at 1, mid ± I · half in between', () => {
    expect(bandOf(2, 6, 0)).toEqual({ low: 4, high: 4 });
    expect(bandOf(2, 6, 1)).toEqual({ low: 2, high: 6 });
    expect(bandOf(2, 6, 0.25)).toEqual({ low: 3.5, high: 4.5 });
    expect(bandOf(2, 6, 7)).toEqual({ low: 2, high: 6 });
    expect(bandOf(2, 6, -1)).toEqual({ low: 4, high: 4 });
  });
});

describe('the hits', () => {
  // [voice, beat in beats from beat 1 of bar 1, edge]
  const PATTERN: [VoiceName, number, 'low' | 'high'][] = [
    ['kick', 0, 'low'], ['kick', 1, 'high'], ['kick', 2, 'low'], ['kick', 3, 'high'], ['kick', 4, 'low'], ['kick', 5, 'high'],
    ['snare', 1, 'low'], ['snare', 3, 'high'], ['snare', 5, 'low'], ['snare', 7, 'high'],
    // bars count from 1: bar 1 starts at beat 0
    ['crash', 0, 'high'], ['crash', 4, 'low'], ['crash', 8, 'high'], ['crash', 12, 'low'],
  ];

  it('put the kick low on beats 1 and 3 and high on 2 and 4, the snare low on 2 and high on 4, the crash high on beat 1 of an odd bar (1, 3, ...) and low on an even one (2, 4, ...)', () => {
    for (const [voice, beat, edge] of PATTERN) {
      const s = crossfaderState(beat, base(voice));
      expect(s.last.time).toBe(beat);
      expect(s.last.edge).toBe(edge);
      expect(crossfade(beat, base(voice))).toBe(edge === 'low' ? 2 : 6);
    }
  });

  it('are on the beat grid the voices play: hit time and edge agree from any n', () => {
    expect([0, 1, 2, 3].map((n) => hitTime('kick', n))).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2].map((n) => hitTime('snare', n))).toEqual([1, 3, 5]);
    expect([0, 1, 2].map((n) => hitTime('crash', n))).toEqual([0, 4, 8]);
    expect([-3, -2, -1, 0, 1].map((n) => edgeOf('kick', n))).toEqual(['high', 'low', 'high', 'low', 'high']);
    expect([-3, -2, -1, 0, 1].map((n) => edgeOf('snare', n))).toEqual(['high', 'low', 'high', 'low', 'high']);
    expect([-3, -2, -1, 0, 1].map((n) => edgeOf('crash', n))).toEqual(['low', 'high', 'low', 'high', 'low']);
  });
});

describe('the stroke', () => {
  it('goes from 0 to 1 and is flat at both ends', () => {
    expect(stroke(0)).toBe(0);
    expect(stroke(1)).toBe(1);
    expect(stroke(0.5)).toBe(0.5);
    expect(stroke(-3)).toBe(0);
    expect(stroke(9)).toBe(1);
    expect(stroke(0.01)).toBeLessThan(0.001);
  });
});

describe('the value', () => {
  const VOICE_LIST: VoiceName[] = ['kick', 'snare', 'crash'];

  it('arrives on the hit exactly, whatever the intensity and the travel', () => {
    for (const voice of VOICE_LIST) {
      for (const intensity of [0, 0.3, 1]) {
        for (const travel of [0.01, TRAVEL_AT_1, 0.5, MAX_TRAVEL]) {
          const p = base(voice, intensity, travel);
          const { low, high } = bandOf(p.min, p.max, p.intensity);
          for (let n = -2; n < 6; n++) {
            const edge = crossfaderState(hitTime(voice, n), p).last.edge;
            expect(crossfade(hitTime(voice, n), p)).toBeCloseTo(edge === 'low' ? low : high, 12);
            // and one frame before it the value is not there yet (when it has to move)
            if (intensity > 0 && travel < 1) {
              const before = crossfade(hitTime(voice, n) - 0.0005, p);
              expect(Math.abs(before - (edge === 'low' ? low : high))).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it('holds the edge until a stroke before the next hit, then travels in exactly the travel length', () => {
    const p = base('kick', 1, 0.25);
    // hit 0 (low, beat 1) to hit 1 (high, beat 2): holds low until beat 1.75
    for (const t of [0, 0.1, 0.5, 0.74]) expect(crossfade(t, p)).toBe(2);
    expect(crossfade(0.75, p)).toBe(2);
    expect(crossfade(0.875, p)).toBeCloseTo(4, 12); // halfway through the stroke
    expect(crossfade(1, p)).toBe(6);
    // then holds high until beat 2.75, and goes down to arrive low on beat 3
    for (const t of [1, 1.4, 1.74, 1.75]) expect(crossfade(t, p)).toBe(6);
    expect(crossfade(1.875, p)).toBeCloseTo(4, 12);
    expect(crossfade(2, p)).toBe(2);
  });

  it('stays inside the band and never moves faster than the steepest slope of a stroke', () => {
    for (const voice of VOICE_LIST) {
      for (const travel of [0.05, TRAVEL_AT_1, 0.5]) {
        const p = base(voice, 0.6, travel);
        const { low, high } = bandOf(p.min, p.max, p.intensity);
        let previous = crossfade(-3, p);
        let lowest = Infinity;
        let highest = -Infinity;
        let biggestStep = 0;
        for (let i = -2999; i <= 32000; i++) {
          const v = crossfade(i / 1000, p);
          lowest = Math.min(lowest, v);
          highest = Math.max(highest, v);
          biggestStep = Math.max(biggestStep, Math.abs(v - previous));
          previous = v;
        }
        expect(lowest).toBeGreaterThanOrEqual(low - 1e-9);
        expect(highest).toBeLessThanOrEqual(high + 1e-9);
        expect(biggestStep).toBeLessThanOrEqual((1.5 * (high - low)) / (travel * 1000) + 1e-9); // the stroke's steepest slope, per sample
      }
    }
  });

  it('sits where the pattern puts it before the first hit, as if the one before had happened', () => {
    // the snare's first hit is beat 2 (low); the one before it, on beat 4 of the bar before, is high
    expect(crossfade(0, base('snare'))).toBe(6);
    expect(crossfade(-1, base('snare'))).toBe(6);
    expect(crossfade(-0.5, base('kick', 1, 0.25))).toBe(6); // the beat before beat 1 is an odd hit: high
    expect(crossfade(0, base('crash'))).toBe(6); // beat 1 of bar 1 is high
    expect(crossfade(2, base('crash'))).toBe(6);
    expect(crossfade(4, base('crash'))).toBe(2); // bar 2 is low
  });

  it('does not move at intensity 0, and uses the whole range at 1', () => {
    for (const voice of VOICE_LIST) {
      for (let t = 0; t < 16; t += 0.0625) expect(crossfade(t, base(voice, 0))).toBe(4);
    }
    const seen = Array.from({ length: 1600 }, (_, i) => crossfade(i / 100, base('kick')));
    expect(Math.min(...seen)).toBe(2);
    expect(Math.max(...seen)).toBe(6);
  });

  it('never outlasts the beats between two hits: a travel longer than that is cut to the period', () => {
    const p = base('kick', 1, 5);
    expect(crossfade(1, p)).toBe(6);
    expect(crossfade(2, p)).toBe(2);
    expect(crossfade(1.5, p)).toBeCloseTo(4, 12);
  });
});

describe('the stroke length by intensity', () => {
  it('is travel0 at intensity 0 and travel1 at 1, a straight line between, cut to the beats between two hits', () => {
    expect(TRAVEL_AT_0).toBeGreaterThan(TRAVEL_AT_1);
    expect(travelFor(base('kick', 0, 0.5, 0.125))).toBe(0.5);
    expect(travelFor(base('kick', 1, 0.5, 0.125))).toBe(0.125);
    expect(travelFor(base('kick', 0.5, 0.5, 0.125))).toBeCloseTo(0.3125, 12);
    expect(travelFor(base('kick', 0.25, 0.5, 0.125))).toBeCloseTo(0.40625, 12);
    expect(travelFor(base('kick', 9, 0.5, 0.125))).toBe(0.125);
    expect(travelFor(base('kick', 0, 3, 0.125))).toBe(1); // the kick's gap
    expect(travelFor(base('snare', 0, 3, 0.125))).toBe(2); // the snare's gap
  });

  it('starts the stroke that long before the hit at that intensity, and still arrives on it', () => {
    // I = 0.5: L = 0.3125; the kick goes from low (beat 1) to high (beat 2), so it leaves at 0.6875 beats
    const p = base('kick', 0.5, 0.5, 0.125);
    expect(crossfade(0.6875, p)).toBe(crossfade(0, p));
    expect(crossfade(0.6875 + 0.3125 / 2, p)).toBeCloseTo(4, 12);
    expect(crossfade(1, p)).toBe(crossfaderState(1, p).high);
    // at I = 1 the stroke is 0.125 long: at 0.7 the value has not left
    const hard = base('kick', 1, 0.5, 0.125);
    expect(crossfade(0.7, hard)).toBe(2);
    expect(crossfade(0.875 + 0.125 / 2, hard)).toBeCloseTo(4, 12);
  });
});

describe('drawRange', () => {
  it('draws a range inside the outer bounds, 25 to 60 percent of their width', () => {
    const rng = createRng(4);
    for (let i = 0; i < 500; i++) {
      const { min, max } = drawRange(rng, 2, 8);
      expect(min).toBeGreaterThanOrEqual(2);
      expect(max).toBeLessThanOrEqual(8);
      expect((max - min) / 6).toBeGreaterThanOrEqual(0.25 - 1e-12);
      expect((max - min) / 6).toBeLessThanOrEqual(0.6 + 1e-12);
    }
  });
});
