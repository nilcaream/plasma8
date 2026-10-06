import { describe, expect, it } from 'vitest';
import { TapClock } from './clock';
import { GREEN_BELOW_BPM, HOLD_MS, STRIP_RANGE_MS, widgetView } from './tapWidget';

/** A clock tapped at the given times, and the widget's view of it at `now`. */
function view(taps: readonly number[], now: number) {
  const clock = new TapClock(0);
  taps.forEach((t) => clock.tap(t));
  return widgetView(clock.read(now), clock.tapMarks(), now);
}

const steady = (count: number, from = 1000, step = 500) => Array.from({ length: count }, (_, i) => from + i * step);

describe('the tapping widget', () => {
  it('is hidden before the first tap', () => {
    expect(view([], 5000).visible).toBe(false);
  });

  it('counts in with a dot per tap until the 4th tap, and shows the strip from then on', () => {
    expect(view(steady(1), 1000).dots).toBe(1);
    expect(view(steady(3), 2000).dots).toBe(3);
    expect(view(steady(4), 2500).dots).toBeUndefined();
    expect(view(steady(3), 2000).marks).toEqual([]);
  });

  it('writes the tempo alone while counting in, and with its error once set', () => {
    expect(view(steady(2), 1500).text).toBe('120.00');
    // a new run after a pause: the earlier run's error does not belong to the count-in
    const again = [...steady(8), ...steady(2, 9000)];
    expect(view(again, 9500).text).toBe('120.00');
    const jitter = [0, 12, -8, 5, -15, 9];
    expect(view(steady(6).map((t, i) => t + jitter[i]!), 3500).text).toMatch(/^\d+\.\d\d \+\/- \d+\.\d\d$/);
  });

  it('stays for HOLD_MS after the last tap and then goes', () => {
    const taps = steady(5);
    const last = taps.at(-1)!;
    expect(view(taps, last + HOLD_MS - 1).visible).toBe(true);
    expect(view(taps, last + HOLD_MS).visible).toBe(false);
  });

  it('turns the tempo green when the error is small, not when the hand is rough', () => {
    expect(view(steady(12), 6500).green).toBe(true);
    const rough = steady(12).map((t, i) => t + (i % 2 ? 60 : -60));
    const v = view(rough, 6500);
    expect(v.green).toBe(false);
    expect(Number(v.text.split('+/-')[1])).toBeGreaterThan(GREEN_BELOW_BPM);
  });

  it('puts an early tap left of the beat mark and a late one right, to the strip range, and clamps beyond', () => {
    const next = 1000 + 10 * 500; // where the 11th tap of a steady run is expected
    const lastX = (tap: number) => view([...steady(10), tap], tap).marks.at(-1)!.x;
    expect(lastX(next)).toBeCloseTo(0, 6);
    expect(lastX(next + 40)).toBeCloseTo(40 / STRIP_RANGE_MS, 6);
    expect(lastX(next - 40)).toBeCloseTo(-40 / STRIP_RANGE_MS, 6);
    expect(lastX(next + 300)).toBe(1);
    expect(lastX(next - 300)).toBe(-1);
  });

  it('draws the taps still in the fit bright and the older ones faint', () => {
    const v = view(steady(16), 8500);
    expect(v.marks.every((m, i) => (m.bright ? i >= v.marks.length - 12 : true))).toBe(true);
    const bright = v.marks.filter((m) => m.bright);
    const faint = v.marks.filter((m) => !m.bright);
    expect(bright.length).toBeGreaterThan(0);
    expect(faint.length).toBeGreaterThan(0);
    expect(Math.max(...faint.map((m) => m.opacity))).toBeLessThan(Math.min(...bright.map((m) => m.opacity)));
    expect(v.marks.at(-1)!.opacity).toBe(1);
  });
});
