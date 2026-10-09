import { describe, expect, it } from 'vitest';
import { DEFAULT_BPM, RESET_GAP_MS } from './clock';
import { DetectClock } from './detectClock';
import type { Wall } from './micTempo';

/** A detected beat clock: a beat at `at` ms, one every `ms`. */
const wall = (at: number, ms: number, epoch = 1): Wall => ({ at, ms, epoch });

describe('DetectClock before any detected beat', () => {
  it('free-runs at the default tempo from the press that is beat 1 of bar 1', () => {
    const clock = new DetectClock(0);
    expect(clock.press(1000)).toBe(true);
    const r = clock.read(1000 + 60000 / DEFAULT_BPM * 5);
    expect(r.bpm).toBe(DEFAULT_BPM);
    expect(r.beats).toBeCloseTo(5, 9);
    expect(r.bar).toBe(1);
    expect(r.beatInBar).toBe(1);
    expect(r.synced).toBe(true);
  });

  it('is not synced before the first press', () => {
    expect(new DetectClock(0).read(500).synced).toBe(false);
  });
});

describe('DetectClock presses', () => {
  it('counts a press a second or more after the last as a fresh count, and ignores a follow-up within a second', () => {
    const clock = new DetectClock(0);
    expect(clock.press(1000)).toBe(true);
    expect(clock.press(1400)).toBe(false);
    expect(clock.press(1400 + RESET_GAP_MS)).toBe(false); // each press, ignored or not, starts the second again
    expect(clock.press(1400 + 2 * RESET_GAP_MS + 1)).toBe(true);
    expect(clock.read(5000).run).toBe(2);
  });

  it('takes the beat nearest the press as beat 1 of bar 1, whichever side it is on', () => {
    const clock = new DetectClock(0);
    clock.setWall(wall(1000, 500), 1000);
    // the beat at 1500 is nearest to 1730: it is 0.46 of a beat ago
    expect(clock.press(1730)).toBe(true);
    expect(clock.read(1730).beats).toBeCloseTo(0.46, 9);
    expect(clock.read(1730).beatInBar).toBe(0);
    // bar 2 starts 4 detected beats after it
    expect(clock.read(1500 + 4 * 500 - 1).bar).toBe(0);
    expect(clock.read(1500 + 4 * 500).bar).toBe(1);
  });

  it('puts beat 1 on the coming beat when the press is early, and holds the count at 0 until it arrives', () => {
    const clock = new DetectClock(0);
    clock.setWall(wall(1000, 500), 1000);
    expect(clock.press(1900)).toBe(true);
    expect(clock.read(1900).beats).toBe(0);
    expect(clock.read(2000).beats).toBe(0);
    expect(clock.read(2250).beats).toBeCloseTo(0.5, 9);
  });

  it('never moves the tempo or where the beats fall: a press is only where bar 1 is', () => {
    const clock = new DetectClock(0);
    clock.setWall(wall(1000, 500), 1000);
    const before = clock.read(3000);
    clock.press(1730);
    const after = clock.read(3000);
    expect(after.bpm).toBe(before.bpm);
    expect(after.beatPhase).toBeCloseTo(before.beatPhase, 9);
    clock.press(4000);
    expect(clock.read(3000).beatPhase).toBeCloseTo(before.beatPhase, 9);
    expect(clock.read(5300).beatPhase).toBeCloseTo(0.6, 9); // 8.6 detected beats since 1000: the detector's phase
  });
});

describe('DetectClock with the detector', () => {
  it('reads the detector tempo and keeps the beat of the bar it was on when it first arrives', () => {
    const clock = new DetectClock(0);
    clock.press(0);
    // free-running at 120: 4.6 beats at 2300 ms, the 5th beat of the bar-and-a-bit, whole beat 4
    clock.setWall(wall(100, 500), 2300);
    const r = clock.read(2300);
    expect(r.bpm).toBeCloseTo(120, 9);
    expect(Math.floor(r.beats)).toBe(4);
    expect(r.beats).toBeCloseTo(4.4, 9); // the detector's phase: its beat at 2100, 0.4 of a beat ago
  });

  it('follows a retuned clock of the same count without a step', () => {
    const clock = new DetectClock(0);
    clock.setWall(wall(1000, 500, 1), 1000);
    clock.press(1000);
    const before = clock.read(3200).beats;
    clock.setWall(wall(988, 500, 1), 3200); // the same epoch: a retune 12 ms earlier, the count carries on
    expect(Math.abs(clock.read(3200).beats - before)).toBeLessThan(0.05);
  });

  it('keeps the whole beat across a new epoch (a new listening) and takes its phase', () => {
    const clock = new DetectClock(0);
    clock.setWall(wall(1000, 500, 1), 1000);
    clock.press(1000);
    const whole = Math.floor(clock.read(6300).beats);
    clock.setWall(wall(77, 480, 2), 6300);
    const r = clock.read(6300);
    expect(Math.floor(r.beats)).toBe(whole);
    expect(r.bpm).toBeCloseTo(125, 9);
  });

  it('goes on at the last tempo when the microphone is closed, and keeps its wall when given none', () => {
    const clock = new DetectClock(0);
    clock.setWall(wall(1000, 500), 1000);
    clock.press(1000);
    clock.setWall(null, 20_000);
    const r = clock.read(21_000);
    expect(r.bpm).toBeCloseTo(120, 9);
    expect(r.beats).toBeCloseTo(40, 9);
  });

  it('can start at the beat another clock was at, so a switch of source does not jump', () => {
    const clock = new DetectClock(10_000 - (6.5 * 60000) / 128, 128);
    const r = clock.read(10_000);
    expect(r.bpm).toBe(128);
    expect(r.beats).toBeCloseTo(6.5, 9);
  });
});
