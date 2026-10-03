import { describe, expect, it } from 'vitest';
import { FULL_SOFTENING_BELOW, MotionClock, SOFT_SLOWDOWN, softening } from './soften';

describe('softening', () => {
  it('is nothing at or above home', () => {
    expect(softening(0.6, 0.6)).toBe(0);
    expect(softening(0.6, 0.9)).toBe(0);
  });

  it('grows smoothly the further the slider sits below home', () => {
    let prev = 0;
    for (let i = 0.58; i >= 0; i -= 0.02) {
      const s = softening(0.6, i);
      expect(s).toBeGreaterThan(prev);
      expect(s - prev).toBeLessThan(0.06);
      prev = s;
    }
  });

  it('is full far below home', () => {
    expect(softening(0.9, 0.9 - FULL_SOFTENING_BELOW)).toBe(1);
    expect(softening(0.9, 0)).toBe(1);
  });
});

describe('MotionClock', () => {
  it('runs at real speed unsoftened and slower softened', () => {
    const plain = new MotionClock();
    const soft = new MotionClock();
    for (let i = 0; i < 60; i++) {
      plain.update(1 / 60, 0);
      soft.update(1 / 60, 1);
    }
    expect(plain.update(0, 0)).toBeCloseTo(1, 10);
    expect(soft.update(0, 1)).toBeCloseTo(1 - SOFT_SLOWDOWN, 10);
  });

  it('never jumps or goes back when the softening changes', () => {
    const clock = new MotionClock();
    const before = clock.update(10, 0);
    expect(clock.update(0, 1)).toBe(before);
    expect(clock.update(-1, 0)).toBe(before); // a clock hiccup holds it
    expect(clock.update(0.1, 0.5)).toBeCloseTo(before + 0.1 * (1 - 0.5 * SOFT_SLOWDOWN), 10);
  });
});
