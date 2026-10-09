import { describe, expect, it } from 'vitest';
import { historyAxis } from './tempoHistory';

describe('historyAxis', () => {
  it('holds the current detection in the middle with one BPM either way when steady', () => {
    const a = historyAxis([120, 120, 120], [120, 120, 120])!;
    expect(a.centre).toBe(120);
    expect(a.lo).toBe(119);
    expect(a.hi).toBe(121);
    expect(a.ticks).toEqual([119, 120, 121]);
  });

  it('keeps the whole BPM at the edges when the reading is a hair off a whole number', () => {
    expect(historyAxis([127.9999, 127.9999], [127.9999, 128.0001])!.ticks).toEqual([127, 128, 129]);
  });

  it('widens on both sides so that every value of both lines is in view, the current detection staying in the middle', () => {
    const detection = [120, 122.5, 121, 120];
    const beat = [118, 118, 119, 120];
    const a = historyAxis(detection, beat)!;
    expect(a.centre).toBe(120);
    for (const v of [...detection, ...beat]) {
      expect(v).toBeGreaterThanOrEqual(a.lo);
      expect(v).toBeLessThanOrEqual(a.hi);
    }
    expect(a.hi - a.centre).toBeCloseTo(a.centre - a.lo, 9);
    expect(a.hi - a.centre).toBeGreaterThan(2.5);
    expect(a.ticks).toEqual([118, 119, 120, 121, 122]);
  });

  it('narrows again when the far values have left the window', () => {
    expect(historyAxis([140, 130, 120, 120], [120, 120, 120, 120])!.hi).toBeGreaterThan(130);
    expect(historyAxis([120, 120], [120, 120])!.hi).toBe(121);
  });

  it('puts only whole BPM on the axis, at most nine of them', () => {
    const a = historyAxis([100, 100, 150, 150], [100, 100, 150, 150])!;
    expect(a.ticks.length).toBeLessThanOrEqual(9);
    expect(a.ticks.length).toBeGreaterThan(2);
    for (const t of a.ticks) {
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(a.lo);
      expect(t).toBeLessThanOrEqual(a.hi);
    }
  });

  it('skips a gap in a line and centres on the latest reading', () => {
    expect(historyAxis([120, null, null, 124.4, null], [null, null, null, null, null])!.centre).toBe(124.4);
  });

  it('centres on the beat when there is no detection yet, and is empty with neither', () => {
    expect(historyAxis([null, null], [null, 128])!.centre).toBe(128);
    expect(historyAxis([null, null], [null, null])).toBeNull();
    expect(historyAxis([], [])).toBeNull();
  });
});
