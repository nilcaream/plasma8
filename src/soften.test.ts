import { describe, expect, it } from 'vitest';
import { FULL_SOFTENING_BELOW, softening } from './soften';

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
