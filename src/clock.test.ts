import { describe, expect, it } from 'vitest';
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, TapClock, pooledFit, runSums, tempoChanged } from './clock';

/** Taps at `count` evenly spaced times starting at `from`. */
function tapEvery(clock: TapClock, from: number, intervalMs: number, count: number): number {
  let t = from;
  for (let i = 0; i < count; i++) {
    clock.tap(t);
    t += intervalMs;
  }
  return t - intervalMs;
}

describe('pooledFit', () => {
  it('is the step of an even series and the best fit of an uneven one', () => {
    expect(pooledFit([runSums([100, 600, 1100, 1600])]).slope).toBe(500);
    expect(pooledFit([runSums([0, 10, 10, 20])]).slope).toBeCloseTo(6, 10); // not first-to-last, which would be 6.67
  });

  it('shares one slope between runs with different offsets', () => {
    const fit = pooledFit([runSums([0, 500, 1000]), runSums([7777, 8277, 8777, 9277])]);
    expect(fit.slope).toBeCloseTo(500, 10);
    expect(fit.ssr).toBeCloseTo(0, 6);
    expect(fit.dof).toBe(7 - 2 - 1);
  });

  it('has no slope while no run has two taps', () => {
    expect(pooledFit([runSums([100]), runSums([900])]).slope).toBeNaN();
  });
});

describe('tempoChanged', () => {
  const steady = runSums(Array.from({ length: 32 }, (_, i) => 500 * i + (i % 2 ? 10 : -10)));
  it('sees a clearly different tempo and lets a near one pass', () => {
    expect(tempoChanged([steady], runSums([0, 400, 800]))).toBe(true);
    expect(tempoChanged([steady], runSums([0, 505, 1010]))).toBe(false);
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

  it('fits every tap of the run, so a hand rushing at the end barely moves the tempo', () => {
    const clock = new TapClock(0);
    // the last 16 taps creep 2 ms earlier each: fitted alone they would say 120.5 BPM
    const taps = Array.from({ length: 100 }, (_, i) => 1000 + 500 * i - 2 * Math.max(0, i - 84));
    taps.forEach((t) => clock.tap(t));
    const last = 1000 + 500 * 99 - 2 * 15;
    expect(Math.abs(clock.read(last).bpm - 120)).toBeLessThan(0.1);
    expect(clock.read(last).beats).toBeCloseTo(99, 0); // the 100th tap is still beat 100 of the run
  });

  it('has a standard error from the third tap of a run on, shrinking as taps pile up', () => {
    const clock = new TapClock(0);
    expect(clock.read(0).bpmError).toBeUndefined();
    const jitter = [0, 12, -8, 5, -15, 9, -3, 14, -11, 6, -6, 10, -13, 2, -9, 7];
    jitter.forEach((j, i) => {
      clock.tap(1000 + 500 * i + j);
      if (i < 2) expect(clock.read(0).bpmError).toBeUndefined();
    });
    const sixteen = clock.read(0).bpmError ?? NaN;
    tapEvery(clock, 1000 + 500 * 16 + 4, 500, 16);
    const thirtyTwo = clock.read(0).bpmError ?? NaN;
    expect(sixteen).toBeGreaterThan(0.05);
    expect(thirtyTwo).toBeLessThan(sixteen);
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
    // a clearly different interval right after it replaces the tempo
    clock.tap(last + 2000 + 666);
    expect(clock.read(last + 2000 + 666).bpm).toBeCloseTo(90.09, 1);
  });

  it('keeps the tempo of every earlier tap when a new run is near it, and re-aligns the phase', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 32);
    const mark = last + 3000;
    clock.tap(mark); // "this is beat 1"
    clock.tap(mark + 480); // 125 BPM alone, but within a hand's jitter of 120
    const r = clock.read(mark + 480);
    expect(r.bpm).toBeCloseTo(120, 2);
    expect(r.beats).toBeCloseTo(1, 1);
    expect(r.run).toBe(2);
  });

  it('takes the new run alone once it has clearly tapped a new tempo', () => {
    const clock = new TapClock(0);
    const jitter = (i: number) => (i % 2 ? 10 : -10);
    let t = 0;
    for (let i = 0; i < 32; i++) clock.tap((t = 1000 + 500 * i + jitter(i))); // 120 BPM
    const start = t + 3000;
    for (let i = 0; i < 4; i++) clock.tap(start + 400 * i); // 150 BPM
    expect(clock.read(start + 1200).bpm).toBeCloseTo(150, 5);
  });

  it('does not reset on a gap just under 2 s', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 4);
    clock.tap(2500 + 1900);
    expect(clock.read(2500 + 1900).beats).toBeGreaterThan(3); // the run goes on; a reset would give 0
  });

  it('counts runs: 0 free-running, 1 from the first tap, one more at each fresh count', () => {
    const clock = new TapClock(0);
    expect(clock.read(500).run).toBe(0);
    const last = tapEvery(clock, 1000, 500, 4);
    expect(clock.read(last).run).toBe(1);
    clock.tap(last + 2000);
    expect(clock.read(last + 2000).run).toBe(2);
  });

  it('ignores a second tap a few milliseconds after the first', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    expect(clock.tap(1030)).toBe(false);
    clock.tap(1500);
    expect(clock.read(1500).bpm).toBeCloseTo(120);
  });
});
