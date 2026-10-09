import { describe, expect, it } from 'vitest';
import { DEFAULT_BPM, MAX_BPM, MIN_BPM, TapClock, fitLine, formatTempo, toBpm } from './clock';

/** Taps at `count` evenly spaced times starting at `from`. Returns the time of the last one. */
function tapEvery(clock: TapClock, from: number, intervalMs: number, count: number): number {
  let t = from;
  for (let i = 0; i < count; i++) {
    clock.tap(t);
    t += intervalMs;
  }
  return t - intervalMs;
}

describe('formatTempo', () => {
  it('writes both numbers to 2 decimals, or the tempo alone while there is no error', () => {
    expect(formatTempo(132.3149, 0.4071)).toBe('132.31 +/- 0.41');
    expect(formatTempo(120, 0.5)).toBe('120.00 +/- 0.50');
    expect(formatTempo(120, undefined)).toBe('120.00');
  });
});

describe('toBpm', () => {
  it('keeps 60 to 180 as it is, and 180.0 stays 180', () => {
    expect(toBpm(60)).toBe(60);
    expect(toBpm(120)).toBe(120);
    expect(toBpm(170)).toBe(170);
    expect(toBpm(180)).toBe(180);
    expect(toBpm(180 + 1e-9)).toBe(180);
  });

  it('halves what is above 180, once', () => {
    expect(toBpm(200)).toBe(100);
    expect(toBpm(181)).toBe(90.5);
    expect(toBpm(360)).toBe(180);
    expect(toBpm(400)).toBe(180); // 200 after the halving, then clamped, not halved again
  });

  it('raises what is below 60 to 60', () => {
    expect(toBpm(59)).toBe(MIN_BPM);
    expect(toBpm(1)).toBe(MIN_BPM);
  });
});

describe('fitLine', () => {
  it('is the step of an even series and the best fit of an uneven one', () => {
    expect(fitLine([100, 600, 1100, 1600]).b).toBe(500);
    expect(fitLine([0, 10, 10, 20]).b).toBeCloseTo(6, 10); // not first-to-last, which would be 6.67
  });

  it('puts the line through the average tap', () => {
    const line = fitLine([100, 600, 1100, 1600]);
    expect(line.a + line.b * line.meanX).toBeCloseTo(line.meanY, 10);
    expect(line.ssr).toBeCloseTo(0, 6);
  });
});

describe('TapClock before the first tap', () => {
  it('free-runs at 120 BPM from its start time', () => {
    const clock = new TapClock(1000);
    const r = clock.read(1000 + 1250);
    expect(r.synced).toBe(false);
    expect(r.taps).toBe(0);
    expect(r.bpm).toBe(DEFAULT_BPM);
    expect(r.beats).toBeCloseTo(2.5);
    expect(r.beatInBar).toBe(2);
    expect(r.beatPhase).toBeCloseTo(0.5);
    expect(r.bar).toBe(0);
  });

  it('starts at the given BPM: halved above 180, then limited to 60..180', () => {
    expect(new TapClock(0, 90).read(0).bpm).toBe(90);
    expect(new TapClock(0, 200).read(0).bpm).toBe(100);
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
    expect(r.taps).toBe(1);
    expect(r.bpm).toBe(DEFAULT_BPM);
    expect(r.beats).toBe(0);
    expect(r.beatInBar).toBe(0);
    expect(r.bar).toBe(0);
    expect(r.barPhase).toBe(0);
  });
});

describe('TapClock tempo', () => {
  it('is set on the 4th tap of a run and not before', () => {
    const clock = new TapClock(0);
    for (const t of [1000, 1400, 1800]) {
      clock.tap(t); // 400 ms = 150 BPM, but only 3 taps
      expect(clock.read(t).bpm).toBe(DEFAULT_BPM);
    }
    clock.tap(2200);
    expect(clock.read(2200).bpm).toBeCloseTo(150, 8);
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
    expect(Math.max(...afterEight) - Math.min(...afterEight)).toBeLessThan(4);
    expect(afterEight.at(-1)).toBeCloseTo(120, 0);
  });

  it('fits only the last 12 taps, so a gentle change of tempo is followed', () => {
    const clock = new TapClock(0);
    // 40 taps at 120 BPM, then 20 more 5 ms shorter each (121.2 BPM): too small a step to restart the window
    let t = 1000;
    for (let i = 0; i < 40; i++, t += 500) clock.tap(t);
    t -= 500 - 495;
    for (let i = 0; i < 20; i++, t += 495) clock.tap(t);
    expect(clock.read(t - 495).bpm).toBeCloseTo(60000 / 495, 2);
  });

  it('starts the window again from the last 3 taps when two taps in a row land far off the line', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 20);
    clock.tap(last + 400); // 100 ms early: one tap, the window just refits
    const afterOne = clock.read(last + 400).bpm;
    expect(afterOne).toBeLessThan(122);
    clock.tap(last + 800); // the 2nd in a row: the window is now the last 3 taps, and a window of 3 sets no tempo
    expect(clock.read(last + 800).bpm).toBe(afterOne);
    clock.tap(last + 1200);
    expect(clock.read(last + 1200).bpm).toBeCloseTo(150, 8);
  });

  it('does not restart on one stray tap', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 20);
    clock.tap(last + 500 + 120); // one tap 120 ms late
    tapEvery(clock, last + 1000, 500, 4); // back on the beat
    expect(clock.read(last + 2500).bpm).toBeCloseTo(120, 0);
  });

  it('has a standard error from the 4th tap of a run on, shrinking as the window fills', () => {
    const clock = new TapClock(0);
    expect(clock.read(0).bpmError).toBeUndefined();
    const jitter = [0, 12, -8, 5, -15, 9, -3, 14, -11, 6, -6, 10];
    const errors: (number | undefined)[] = [];
    jitter.forEach((j, i) => {
      clock.tap(1000 + 500 * i + j);
      errors.push(clock.read(0).bpmError);
    });
    expect(errors.slice(0, 3)).toEqual([undefined, undefined, undefined]);
    expect(errors[3]).toBeGreaterThan(0.05);
    expect(errors[11] as number).toBeLessThan(errors[3] as number);
  });

  it('limits a tapped tempo to 60..180', () => {
    const slow = new TapClock(0);
    tapEvery(slow, 0, 1000, 4); // 60.0 BPM, as slow as a run goes
    expect(slow.read(3000).bpm).toBeCloseTo(60, 8);
    const slower = new TapClock(0, 90);
    tapEvery(slower, 0, 1000, 3);
    slower.tap(3000 + 1000);
    slower.tap(4000 + 1000); // a hand slowing to 1 s a tap cannot go below 60
    expect(slower.read(5000).bpm).toBeGreaterThanOrEqual(MIN_BPM);
  });
});

describe('TapClock above 180 BPM', () => {
  it('halves a run: taps at 200 BPM give 100, and every tap is half a beat', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 300, 5);
    const r = clock.read(last);
    expect(r.bpm).toBeCloseTo(100, 8);
    expect(r.beats).toBeCloseTo(2, 6); // the 5th tap is 4 half beats in
    expect(r.beatInBar).toBe(2);
  });

  it('leaves exactly 180 as it is', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 60000 / 180, 8);
    expect(clock.read(last).bpm).toBeCloseTo(180, 6);
    expect(clock.read(last).beats).toBeCloseTo(7, 6);
  });

  it('decides once per run: a run that began below 180 never halves, one that began above stays halved', () => {
    const fastLater = new TapClock(0);
    const last = tapEvery(fastLater, 1000, 400, 8); // 150 BPM, not halved
    tapEvery(fastLater, last + 300, 300, 6); // 200 BPM from here on, in the same run
    expect(fastLater.read(last + 300 + 5 * 300).bpm).toBe(MAX_BPM); // clamped, not 100

    const slowLater = new TapClock(0);
    const last2 = tapEvery(slowLater, 1000, 300, 8); // 200 BPM, halved to 100
    tapEvery(slowLater, last2 + 400, 400, 6); // 150 BPM taps from here on, same run
    expect(slowLater.read(last2 + 400 + 5 * 400).bpm).toBeCloseTo(75, 6); // still half beats: 75, not 150
  });

  it('decides again for a fresh run after a pause', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 300, 6); // halved
    tapEvery(clock, last + 3000, 400, 6); // 150 BPM, a new run
    expect(clock.read(last + 3000 + 5 * 400).bpm).toBeCloseTo(150, 6);
  });
});

describe('TapClock phase', () => {
  it('re-aligns on every tap so the tap lands (almost) on its beat', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 4);
    clock.tap(3020); // 20 ms late: the fitted line puts it a few ms off the beat
    const r = clock.read(3020);
    expect(r.beats).toBeCloseTo(4, 1);
    expect(r.beatInBar).toBe(0);
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
    const last = tapEvery(clock, 1000, 500, 4);
    const r = clock.read(last + 750); // 1.5 beats after the 4th tap (beat 4)
    expect(r.beats).toBeCloseTo(4.5, 5);
    expect(r.beatInBar).toBe(0);
    expect(r.beatPhase).toBeCloseTo(0.5, 5);
    expect(r.barPhase).toBeCloseTo(0.125, 5);
  });
});

describe('TapClock gaps and double events', () => {
  it('only resets the bar after a gap over 1 s: that tap is beat 1 of bar 1 and the tempo stays', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 6);
    clock.tap(last + 1001);
    const r = clock.read(last + 1001);
    expect(r.bpm).toBeCloseTo(120, 8);
    expect(r.beats).toBe(0);
    expect(r.bar).toBe(0);
    expect(r.taps).toBe(1);
    // and the interval to that tap is not a tempo: the 2nd and 3rd taps of the new run set none either
    clock.tap(last + 1001 + 666);
    clock.tap(last + 1001 + 1332);
    expect(clock.read(last + 2333).bpm).toBeCloseTo(120, 8);
  });

  it('does not reset on a gap of exactly 1 s', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 4);
    clock.tap(2500 + 1000);
    expect(clock.read(3500).beats).toBeGreaterThan(3); // the run goes on; a reset would give 0
    expect(clock.read(3500).taps).toBe(5);
  });

  it('takes the tempo of the new run alone, from its 4th tap', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 32);
    const start = last + 3000;
    tapEvery(clock, start, 400, 4); // 150 BPM; the 32 taps before it do not count
    expect(clock.read(start + 1200).bpm).toBeCloseTo(150, 8);
  });

  it('counts runs: 0 free-running, 1 from the first tap, one more at each reset', () => {
    const clock = new TapClock(0);
    expect(clock.read(500).run).toBe(0);
    const last = tapEvery(clock, 1000, 500, 4);
    expect(clock.read(last).run).toBe(1);
    clock.tap(last + 1100);
    expect(clock.read(last + 1100).run).toBe(2);
  });

  it('ignores a second tap a few milliseconds after the first', () => {
    const clock = new TapClock(0);
    clock.tap(1000);
    expect(clock.tap(1030)).toBe(false);
    expect(clock.read(1030).taps).toBe(1);
    tapEvery(clock, 1500, 500, 3);
    expect(clock.read(2500).bpm).toBeCloseTo(120, 8);
  });
});

describe('TapClock tap marks', () => {
  it('have no offset for the first 3 taps, then how far each tap was from where the line expected it', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 4);
    clock.tap(3000 + 20); // 5th tap, 20 ms late
    const marks = clock.tapMarks();
    expect(marks.map((m) => m.offsetMs === undefined)).toEqual([true, true, true, false, false]);
    expect(marks[4]?.offsetMs ?? NaN).toBeCloseTo(20, 6);
    expect(marks[3]?.offsetMs ?? NaN).toBeCloseTo(0, 6);
  });

  it('say which taps the tempo is still fitted through', () => {
    const clock = new TapClock(0);
    tapEvery(clock, 1000, 500, 14);
    const marks = clock.tapMarks();
    expect(marks).toHaveLength(14);
    expect(marks.filter((m) => m.inWindow)).toHaveLength(12);
    expect(marks.slice(0, 2).every((m) => !m.inWindow)).toBe(true);
  });

  it('start again at a reset', () => {
    const clock = new TapClock(0);
    const last = tapEvery(clock, 1000, 500, 8);
    clock.tap(last + 2000);
    expect(clock.tapMarks()).toHaveLength(1);
  });
});

