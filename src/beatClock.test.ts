import { describe, expect, it } from 'vitest';
import { ANCHOR_PEAKS, BeatClock, CHANGE_SD } from './beatClock';
import { CASES, scoreClock } from './tempoBench';
import type { Analysis, GridFit, Peak } from './tempoDetect';

/** An analysis at `time` whose grid has this tempo and a beat at `beat`, with on-grid peaks on every beat of the last 8 s. */
function seen(time: number, bpm: number, beat: number, more: Partial<GridFit> = {}): Analysis {
  const period = 60 / bpm;
  const peaks: Peak[] = [];
  for (let t = beat + Math.floor((time - 8 - beat) / period) * period; t <= time; t += period) if (t >= time - 8) peaks.push({ t, strength: 1, onGrid: true });
  const grid: GridFit = { bpm, sd: 0.005, phase: beat, period, offOdd: 0, beat, beatShare: 0.9, inliers: peaks.length, onGridShare: 0.8, rmsMs: 0.5, span: 8, ...more };
  return { time, beat: true, readings: { grid: bpm, comb: bpm, ioi: bpm }, grid, combScore: new Float64Array(0), wide: new Float64Array(0), odf: new Float32Array(0), odfStart: 0, rate: 100, peaks, confidence: 1 };
}

const silent = (time: number): Analysis => ({ ...seen(time, 128, 0), beat: false, grid: null, peaks: [], confidence: 0 });

/** Feeds analyses every quarter second from `from` to `to`. */
function feed(clock: BeatClock, from: number, to: number, make: (t: number) => Analysis): void {
  for (let t = from; t <= to + 1e-9; t += 0.25) clock.update(make(t));
}

describe('beat clock', () => {
  it('stays dark until the first grid fit, then starts on it', () => {
    const clock = new BeatClock();
    feed(clock, 3, 5, silent);
    expect(clock.beat).toBeNull();
    clock.update(seen(5.25, 128, 4.9));
    expect(clock.beat).toBe(4.9);
    expect(clock.bpm).toBeCloseTo(128, 9);
  });

  it('runs on at the last tempo and offset through silence', () => {
    const clock = new BeatClock();
    clock.update(seen(5, 128, 4.9));
    const v = clock.version;
    feed(clock, 5.25, 30, silent);
    expect(clock.version).toBe(v);
    expect(clock.beat).toBe(4.9);
  });

  it(`re-anchors on the grid's beat after ${ANCHOR_PEAKS} new on-grid peaks, not before`, () => {
    const clock = new BeatClock();
    const p = 60 / 128;
    clock.update(seen(5, 128, 4.9));
    // the grid now hears the beat 5 ms later and the tempo a little faster: the same tempo, more precisely
    const later = (t: number): Analysis => seen(t, 128.2, 4.905 + Math.floor((t - 4.905) / p) * p);
    clock.update(later(5 + (ANCHOR_PEAKS - 1) * p));
    expect(clock.beat).toBe(4.9);
    clock.update(later(5 + ANCHOR_PEAKS * p + 0.01));
    expect(clock.beat).not.toBe(4.9);
    expect(clock.bpm).toBeCloseTo(128.2, 9);
  });

  it('takes a step of more than an eighth of a beat only when the next re-anchor finds it again', () => {
    const clock = new BeatClock();
    const p = 60 / 128;
    clock.update(seen(5, 128, 4.9));
    const shifted = (t: number): Analysis => seen(t, 128, 4.9 + p / 4 + Math.floor((t - 4.9) / p) * p);
    clock.update(shifted(5 + ANCHOR_PEAKS * p + 0.01));
    expect(clock.beat).toBe(4.9);
    clock.update(shifted(5 + 2 * ANCHOR_PEAKS * p + 0.01));
    expect(((clock.beat! - 4.9) / p) % 1).toBeCloseTo(0.25, 6);
  });

  it('keeps its parity when the grid flips to the half beat on a near coin flip', () => {
    const clock = new BeatClock();
    const p = 60 / 128;
    clock.update(seen(5, 128, 4.9));
    const flipped = (t: number): Analysis => seen(t, 128, 4.9 + p / 2 + Math.floor((t - 4.9) / p) * p, { beatShare: 0.52 });
    for (let k = 1; k <= 4; k++) clock.update(flipped(5 + k * ANCHOR_PEAKS * p + 0.01));
    expect(clock.anchors).toBe(4);
    const off = (((clock.beat! - 4.9) / p) % 1 + 1) % 1;
    expect(Math.min(off, 1 - off)).toBeLessThan(0.01);
  });

  it('takes a new tempo only after 2 s of precise fits that agree, and an imprecise one starts the count again', () => {
    const clock = new BeatClock();
    clock.update(seen(5, 128, 4.9));
    feed(clock, 10, 11.75, (t) => seen(t, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(128, 6);
    clock.update(seen(12, 135, 9.8, { sd: CHANGE_SD * 2 }));
    feed(clock, 12.25, 14, (t) => seen(t, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(128, 6);
    clock.update(seen(14.25, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(135, 6);
    expect(clock.changes).toBe(1);
  });

  // on the synthetic tracks (offset 0.37 s, so the true beats are known)
  const on = (name: string) => scoreClock({ ...CASES.find((c) => c.name === name)!.spec, offset: 0.37 });

  it('takes the jump from 128 to 135 within 8 s, once', () => {
    const s = on('C jump 128 to 135 at 15 s');
    expect(s.took).toBeLessThan(8);
    expect(s.changes).toBe(1);
  });

  it('holds 128 through a 14 s breakdown', () => {
    const s = on('C long breakdown 128 (8-22 s)');
    expect(s.maxErr).toBeLessThan(0.05);
    expect(s.changes).toBe(0);
  });

  it('keeps the beat of breakA on the beat, within 5 ms', () => {
    const s = on('breakA 130');
    expect(s.half).toBe(0);
    expect(s.maxPhaseMs).toBeLessThan(5);
  });
});
