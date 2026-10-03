import { describe, expect, it } from 'vitest';
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, TapClock, slope } from './clock';

/** Taps at `count` evenly spaced times starting at `from`. */
function tapEvery(clock: TapClock, from: number, intervalMs: number, count: number): number {
  let t = from;
  for (let i = 0; i < count; i++) {
    clock.tap(t);
    t += intervalMs;
  }
  return t - intervalMs;
}

describe('slope', () => {
  it('is the step of an even series and the best fit of an uneven one', () => {
    expect(slope([100, 600, 1100, 1600])).toBe(500);
    expect(slope([0, 10, 10, 20])).toBeCloseTo(6, 10); // not first-to-last, which would be 6.67
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

  it('settles within a BPM or two once 8 jittery taps are in, and stays there', () => {
    const clock = new TapClock(0);
    // a hand tapping 120 BPM, each tap up to 30 ms early or late
    const jitter = [0, 25, -20, 10, -30, 15, -5, 30, -25, 5, -10, 20, -15, 12, -22, 8];
    const afterEight: number[] = [];
    jitter.forEach((j, i) => {
      const t = 1000 + 500 * i + j;
      clock.tap(t);
      if (i >= 7) afterEight.push(clock.read(t).bpm);
    });
    expect(Math.max(...afterEight) - Math.min(...afterEight)).toBeLessThan(3);
    expect(afterEight.at(-1)).toBeCloseTo(120, 0);
  });

  it('follows the latest 16 taps when the hand changes tempo', () => {
    const clock = new TapClock(0);
    let t = tapEvery(clock, 1000, 600, 20); // 100 BPM
    t = tapEvery(clock, t + 400, 400, 16); // then 16 taps at 150 BPM: the slow ones are out of the window
    expect(clock.read(t).bpm).toBeCloseTo(150);
    expect(clock.read(t).beats).toBeCloseTo(35, 3); // the 36th tap is still beat 36 of the run
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
  it('re-aligns on every tap so the tap lands (almost) on its beat', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    clock.tap(1500);
    clock.tap(2020); // 20 ms late: the fitted line puts it 3 ms off the beat
    const r = clock.read(2020);
    expect(r.beats).toBeCloseTo(2, 1);
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
    expect(clock.read(2500 + 1900).beats).toBeGreaterThan(3); // the run goes on; a reset would give 0
  });

  it('ignores a second tap a few milliseconds after the first', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    expect(clock.tap(1030)).toBe(false);
    clock.tap(1500);
    expect(clock.read(1500).bpm).toBeCloseTo(120);
  });
});
