import { describe, expect, it } from 'vitest';
import { ANCHOR_PEAKS, BeatClock, CHANGE_SD, FIRST_FITS } from './beatClock';
import { CASES, scoreClock } from './tempoBench';
import type { Analysis, GridFit, Peak } from './tempoDetect';
import { PATTERNS } from './tempoSynth';

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

/** A clock started on FIRST_FITS fits of this tempo and beat, a quarter second apart, the last at `time`. */
function started(time: number, bpm: number, beat: number): BeatClock {
  const clock = new BeatClock();
  for (let k = FIRST_FITS - 1; k >= 0; k--) clock.update(seen(time - 0.25 * k, bpm, beat));
  return clock;
}

describe('beat clock', () => {
  it(`stays dark until ${FIRST_FITS} grid fits agree, then starts on them`, () => {
    const clock = new BeatClock();
    feed(clock, 3, 5, silent);
    feed(clock, 5.25, 5.25 + 0.25 * (FIRST_FITS - 2), (t) => seen(t, 128, 4.9));
    expect(clock.beat).toBeNull();
    clock.update(seen(5.25 + 0.25 * (FIRST_FITS - 1), 128, 4.9));
    expect(clock.beat).toBe(4.9);
    expect(clock.bpm).toBeCloseTo(128, 9);
  });

  it('does not start on a lone first fit of a relative of the tempo', () => {
    // Montauk P "Out of Choices" through the room: the clock's first fit read 88.4, 2:3 of 131.9, and it held it for 30 s
    const clock = new BeatClock();
    clock.update(seen(3, 88.4, 2.9));
    feed(clock, 3.25, 3.25 + 0.25 * (FIRST_FITS - 1), (t) => seen(t, 131.9, 2.9));
    expect(clock.bpm).toBeCloseTo(131.9, 6);
    expect(clock.changes).toBe(0);
  });

  it('starts on the beat most of the first fits put it on', () => {
    const clock = new BeatClock();
    const p = 60 / 128;
    // the last of the first fits puts the beat on the half beat, the ones before on the beat
    feed(clock, 5, 5 + 0.25 * (FIRST_FITS - 2), (t) => seen(t, 128, 4.9));
    clock.update(seen(5 + 0.25 * (FIRST_FITS - 1), 128, 4.9 + p / 2));
    const off = (((clock.beat! - 4.9) / p) % 1 + 1) % 1;
    expect(Math.min(off, 1 - off)).toBeLessThan(0.01);
  });

  it('runs on at the last tempo and offset through silence', () => {
    const clock = started(5, 128, 4.9);
    const v = clock.version;
    feed(clock, 5.25, 30, silent);
    expect(clock.version).toBe(v);
    expect(clock.beat).toBe(4.9);
  });

  it(`re-anchors on the grid's beat after ${ANCHOR_PEAKS} new on-grid peaks, not before`, () => {
    const p = 60 / 128;
    const clock = started(5, 128, 4.9);
    // the grid now hears the beat 5 ms later and the tempo a little faster: the same tempo, more precisely
    const later = (t: number): Analysis => seen(t, 128.2, 4.905 + Math.floor((t - 4.905) / p) * p);
    clock.update(later(5 + (ANCHOR_PEAKS - 1) * p));
    expect(clock.beat).toBe(4.9);
    clock.update(later(5 + ANCHOR_PEAKS * p + 0.01));
    expect(clock.beat).not.toBe(4.9);
    expect(clock.bpm).toBeCloseTo(128.2, 9);
  });

  it('takes a step of more than an eighth of a beat only when the next re-anchor finds it again', () => {
    const p = 60 / 128;
    const clock = started(5, 128, 4.9);
    const shifted = (t: number): Analysis => seen(t, 128, 4.9 + p / 4 + Math.floor((t - 4.9) / p) * p);
    clock.update(shifted(5 + ANCHOR_PEAKS * p + 0.01));
    expect(clock.beat).toBe(4.9);
    clock.update(shifted(5 + 2 * ANCHOR_PEAKS * p + 0.01));
    expect(((clock.beat! - 4.9) / p) % 1).toBeCloseTo(0.25, 6);
  });

  it('keeps its parity when the grid flips to the half beat on a near coin flip', () => {
    const p = 60 / 128;
    const clock = started(5, 128, 4.9);
    const flipped = (t: number): Analysis => seen(t, 128, 4.9 + p / 2 + Math.floor((t - 4.9) / p) * p, { beatShare: 0.52 });
    for (let k = 1; k <= 4; k++) clock.update(flipped(5 + k * ANCHOR_PEAKS * p + 0.01));
    expect(clock.anchors).toBe(4);
    const off = (((clock.beat! - 4.9) / p) % 1 + 1) % 1;
    expect(Math.min(off, 1 - off)).toBeLessThan(0.01);
  });

  it('takes a new tempo only after 2 s of precise fits that agree, and an imprecise one starts the count again', () => {
    const clock = started(5, 128, 4.9);
    feed(clock, 10, 11.75, (t) => seen(t, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(128, 6);
    clock.update(seen(12, 135, 9.8, { sd: CHANGE_SD * 2 }));
    feed(clock, 12.25, 14, (t) => seen(t, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(128, 6);
    clock.update(seen(14.25, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(135, 6);
    expect(clock.changes).toBe(1);
  });

  it('takes a new tempo when the beat comes and goes between the precise fits', () => {
    const clock = started(3, 121, 2.9);
    // quiet music: every other analysis hears no beat, with the grid still at the true tempo
    feed(clock, 10, 12, (t) => (t % 0.5 === 0 ? seen(t, 135, 9.8) : { ...seen(t, 135, 9.8), beat: false }));
    expect(clock.bpm).toBeCloseTo(135, 6);
    expect(clock.changes).toBe(1);
  });

  it('does not take a new tempo from a few lone fits, nor from fits far apart', () => {
    const clock = started(3, 128, 2.9);
    const lone = (every: number) => (t: number): Analysis => (t % every === 0 ? seen(t, 135, 9.8) : { ...seen(t, 135, 9.8), beat: false });
    // three precise fits a second apart span 2 s, but are too few
    feed(clock, 10, 12, lone(1));
    expect(clock.bpm).toBeCloseTo(128, 6);
    // one every 3 s for 21 s: many, but never a run
    feed(clock, 15, 36, lone(3));
    expect(clock.bpm).toBeCloseTo(128, 6);
    expect(clock.changes).toBe(0);
  });

  it('does not take a new tempo from two lone fits 20 s apart, a breakdown between them', () => {
    const clock = started(3, 128, 2.9);
    clock.update(seen(10, 135, 9.8));
    feed(clock, 10.25, 29.75, silent);
    clock.update(seen(30, 135, 9.8));
    expect(clock.bpm).toBeCloseTo(128, 6);
    expect(clock.changes).toBe(0);
  });

  it('takes the new tempo on the beat flicker of Burial "Archangel" through a quiet room', () => {
    // the analyses that heard a beat, from the trace of the mic take at speaker volume 0.3: the clock started on a
    // first reading of 121.07, the fits then read 135.15; every other analysis heard no beat
    const heard = [8.77, 8.98, 10.01, 10.26, 10.52, 11.24, 11.5, 11.76, 12.99, 13.24, 14.74, 14.99, 15.25, 16.75, 17, 17.98];
    const clock = started(2.75, 121.07, 2.5);
    for (const t of heard) {
      clock.update({ ...seen(t - 0.13, 135.15, 8.5), beat: false });
      clock.update(seen(t, 135.15, 8.5, { sd: 0.04 }));
    }
    expect(clock.bpm).toBeCloseTo(135.15, 6);
    expect(clock.changes).toBe(1);
  });

  it('takes a new tempo on hits far weaker than the old ones within 8 s', () => {
    const clock = new BeatClock();
    feed(clock, 5, 15, (t) => seen(t, 128, 4.9));
    // a sparse section: the same fits, each hit a fifth as strong as the old beat's
    feed(clock, 15.25, 23, (t) => {
      const a = seen(t, 135, 15.1);
      return { ...a, peaks: a.peaks.map((p) => ({ ...p, strength: p.t > 15 ? 0.2 : 0 })) };
    });
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

  // a beatless stretch of pad and off-grid claps: the grid wanders at low confidence and must not move the clock
  it.each([61, 65, 68, 81, 82])('holds 128 through 30 s of pad and wandering claps between two beat sections (seed %i)', (seed) => {
    const s = scoreClock({ bpm: 128, seconds: 50, pattern: PATTERNS.fourFloorFull, pad: true, breakdown: [10, 40], babble: seed > 80 ? 1 : 2, velocityDb: 3, seed, offset: 0.37 });
    expect(s.changes).toBe(0);
    expect(s.maxErr).toBeLessThan(0.5);
  }, 60000);

  it('keeps the beat of breakA on the beat, within 5 ms', () => {
    const s = on('breakA 130');
    expect(s.half).toBe(0);
    expect(s.maxPhaseMs).toBeLessThan(5);
  });
});
