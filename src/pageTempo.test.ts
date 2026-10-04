import { describe, expect, it } from 'vitest';
import { PageTempo } from './pageTempo';

describe('PageTempo', () => {
  it('runs at the BPM it was given until a tap', () => {
    const t = new PageTempo(1000, 120);
    expect(t.beats(1000)).toBe(0);
    expect(t.beats(3000)).toBeCloseTo(4, 12);
    expect(t.tempo(3000).label).toBe('120.00');
  });

  it('keeps the phase when the BPM is set by hand', () => {
    const t = new PageTempo(0, 120);
    t.setBpm(60, 1500); // 3 beats in
    expect(t.beats(1500)).toBeCloseTo(3, 12);
    expect(t.beats(2500)).toBeCloseTo(4, 12);
  });

  it('follows the tap clock: the first tap is beat 1 at the tempo it had, more taps fit the tempo', () => {
    const t = new PageTempo(0, 100);
    t.tap(5000);
    expect(t.beats(5000)).toBe(0);
    expect(t.beats(5600)).toBeCloseTo(1, 12); // 100 BPM: 600 ms a beat
    for (let i = 1; i <= 8; i++) t.tap(5000 + i * 500);
    expect(t.tempo(9000).bpm).toBeCloseTo(120, 6);
    expect(t.beats(9000)).toBeCloseTo(8, 6);
    expect(t.tempo(9000).label).toMatch(/^120\.00 \+\/- /);
  });

  it('marks beat 1 again on a tap after a pause, at the tempo it has', () => {
    const t = new PageTempo(0, 100);
    for (let i = 0; i <= 8; i++) t.tap(i * 500);
    t.tap(20000);
    expect(t.beats(20000)).toBe(0);
    expect(t.beats(20500)).toBeCloseTo(1, 6);
  });

  it('starts the next tap from a hand-set tempo', () => {
    const t = new PageTempo(0, 120);
    for (let i = 0; i <= 8; i++) t.tap(i * 500);
    t.setBpm(90, 5000);
    t.tap(6000);
    expect(t.beats(6000)).toBe(0);
    expect(t.tempo(6000).bpm).toBe(90);
  });

  it('restarts at beat 1 at the current tempo', () => {
    const t = new PageTempo(0, 120);
    t.restart(7000);
    expect(t.beats(7000)).toBe(0);
    expect(t.beats(7500)).toBeCloseTo(1, 12);
  });
});
