import { describe, expect, it } from 'vitest';
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, TapClock, median } from './clock';

/** Taps at `count` evenly spaced times starting at `from`. */
function tapEvery(clock: TapClock, from: number, intervalMs: number, count: number): number {
  let t = from;
  for (let i = 0; i < count; i++) {
    clock.tap(t);
    t += intervalMs;
  }
  return t - intervalMs;
}

describe('median', () => {
  it('takes the middle of an odd count and the mean of the middle two of an even count', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe('TapClock before the first tap', () => {
  it('free-runs at 120 BPM from its start time', () => {
    const clock = new TapClock(1000);
    const r = clock.read(1000 + 1250);
    expect(r.synced).toBe(false);
    expect(r.bpm).toBe(DEFAULT_BPM);
    expect(r.beats).toBeCloseTo(2.5);
    expect(r.beatInBar).toBe(2);
    expect(r.beatPhase).toBeCloseTo(0.5);
    expect(r.bar).toBe(0);
  });

  it('starts at the given BPM, clamped', () => {
    expect(new TapClock(0, 90).read(0).bpm).toBe(90);
    expect(new TapClock(0, 1000).read(0).bpm).toBe(MAX_BPM);
    expect(new TapClock(0, 1).read(0).bpm).toBe(MIN_BPM);
  });
});

describe('TapClock first tap', () => {
  it('is beat 1 of bar 1 and keeps the tempo', () => {
    const clock = new TapClock(0);
    expect(clock.tap(3000)).toBe(true);
    const r = clock.read(3000);
    expect(r.synced).toBe(true);
    expect(r.bpm).toBe(DEFAULT_BPM);
    expect(r.beats).toBe(0);
    expect(r.beatInBar).toBe(0);
    expect(r.bar).toBe(0);
    expect(r.barPhase).toBe(0);
  });
});

describe('TapClock tempo', () => {
  it('follows the interval between two taps', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    clock.tap(1500); // 500 ms = 120 BPM
    expect(clock.read(1500).bpm).toBeCloseTo(120);
    clock.tap(1500 + 400);
    expect(clock.read(1900).bpm).toBeGreaterThan(120);
  });

  it('is the median of the last intervals, so one stray interval does not move it', () => {
    const clock = new TapClock(0);
    // five taps 600 ms apart, then one 900 ms late tap
    const last = tapEvery(clock, 1000, 600, 5);
    clock.tap(last + 900);
    expect(clock.read(last + 900).bpm).toBeCloseTo(100);
  });

  it('uses only the latest intervals', () => {
    const clock = new TapClock(0);
    let t = tapEvery(clock, 1000, 600, 8); // 100 BPM, seven intervals
    t = tapEvery(clock, t + 400, 400, 5); // then five intervals of 150 BPM: the old ones are out of the window
    expect(clock.read(t).bpm).toBeCloseTo(150);
  });

  it('clamps to the allowed range', () => {
    const slow = new TapClock(0);
    slow.tap(0);
    slow.tap(1900); // 31.6 BPM
    expect(slow.read(1900).bpm).toBe(MIN_BPM);

    const fast = new TapClock(0);
    fast.tap(0);
    fast.tap(200); // 300 BPM
    expect(fast.read(200).bpm).toBe(MAX_BPM);
  });
});

describe('TapClock phase', () => {
  it('re-aligns on every tap so the tap lands on its beat', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    clock.tap(1500);
    clock.tap(2020); // 20 ms late
    const r = clock.read(2020);
    expect(r.beats).toBeCloseTo(2, 5);
    expect(r.beatPhase).toBeCloseTo(0, 5);
    expect(r.beatInBar).toBe(2);
  });

  it('counts beats and bars from the first tap of the run', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 9); // taps 1..9: the ninth is beat 9
    const r = clock.read(last);
    expect(r.beats).toBeCloseTo(8, 5);
    expect(r.bar).toBe(2);
    expect(r.beatInBar).toBe(0);
    expect(r.barPhase).toBeCloseTo(0, 5);
  });

  it('keeps running between taps', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 3);
    const r = clock.read(2000 + 750); // 1.5 beats after the third tap (beat 2)
    expect(r.beats).toBeCloseTo(3.5, 5);
    expect(r.beatInBar).toBe(3);
    expect(r.beatPhase).toBeCloseTo(0.5, 5);
    expect(r.barPhase).toBeCloseTo(0.875, 5);
  });
});

describe('TapClock gaps and double events', () => {
  it('starts a fresh count after a gap of 2 s, with the tempo kept and beat 1 reset', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 6);
    clock.tap(last + 2000);
    const r = clock.read(last + 2000);
    expect(r.bpm).toBeCloseTo(120);
    expect(r.beats).toBe(0);
    expect(r.bar).toBe(0);
    // the next tap after the reset measures a new interval
    clock.tap(last + 2000 + 666);
    expect(clock.read(last + 2000 + 666).bpm).toBeCloseTo(90.09, 1);
  });

  it('does not reset on a gap just under 2 s', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 4);
    clock.tap(2500 + 1900);
    expect(clock.read(2500 + 1900).beats).toBeCloseTo(4, 5);
  });

  it('ignores a second tap a few milliseconds after the first', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    expect(clock.tap(1030)).toBe(false);
    clock.tap(1500);
    expect(clock.read(1500).bpm).toBeCloseTo(120);
  });
});
