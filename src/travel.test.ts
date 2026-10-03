import { describe, expect, it } from 'vitest';
import { BeatTravel, easedBeats } from './travel';

describe('easedBeats', () => {
  it('is the whole beat count on the beat and comes mostly right after it', () => {
    expect(easedBeats(0)).toBe(0);
    expect(easedBeats(3)).toBe(3);
    expect(easedBeats(3.25)).toBeGreaterThan(3.5);
    expect(easedBeats(3.999)).toBeCloseTo(4, 3);
  });
});

describe('BeatTravel', () => {
  it('follows the beats while the count goes on', () => {
    const t = new BeatTravel();
    let v = 0;
    for (let b = 0; b <= 8; b += 0.1) v = t.update(b);
    expect(v).toBeCloseTo(easedBeats(8), 6);
  });

  it('holds where it was when a tap starts a fresh count, then grows from there', () => {
    const t = new BeatTravel();
    t.update(0);
    const before = t.update(10.5);
    expect(t.update(0)).toBe(before); // the clock went back to 0; travel did not
    expect(t.update(1)).toBeCloseTo(before + 1, 6);
  });

  it('never goes back when a tap pulls the beat back a little', () => {
    const t = new BeatTravel();
    t.update(5);
    const at = t.update(5.3);
    expect(t.update(5.2)).toBe(at);
    expect(t.update(5.4)).toBeGreaterThan(at);
  });
});
