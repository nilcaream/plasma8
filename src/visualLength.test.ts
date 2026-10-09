import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { BAR_LENGTHS, DEFAULT_RANGE, drawLength, isBarLength, lengthsIn, pushRange } from './visualLength';

describe('visual length range', () => {
  it('offers 1, 2, 4, 8 and 16 bars, from 2 to 4 by default', () => {
    expect(BAR_LENGTHS).toEqual([1, 2, 4, 8, 16]);
    expect(DEFAULT_RANGE).toEqual({ min: 2, max: 4 });
    expect(isBarLength(8)).toBe(true);
    expect(isBarLength(3)).toBe(false);
    expect(isBarLength('4')).toBe(false);
  });

  it('lists every offered length from min to max, ends included', () => {
    expect(lengthsIn({ min: 2, max: 4 })).toEqual([2, 4]);
    expect(lengthsIn({ min: 1, max: 16 })).toEqual([1, 2, 4, 8, 16]);
    expect(lengthsIn({ min: 8, max: 8 })).toEqual([8]);
  });

  it('draws only from the range, every length equally likely', () => {
    const rng = createRng(5);
    const count = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const bars = drawLength(rng, { min: 2, max: 8 });
      count.set(bars, (count.get(bars) ?? 0) + 1);
    }
    expect([...count.keys()].sort((a, b) => a - b)).toEqual([2, 4, 8]);
    for (const n of count.values()) expect(n / 6000).toBeCloseTo(1 / 3, 1);
  });

  it('pushes max up when min is pressed above it', () => {
    expect(pushRange({ min: 2, max: 4 }, 'min', 8)).toEqual({ min: 8, max: 8 });
    expect(pushRange({ min: 2, max: 4 }, 'min', 16)).toEqual({ min: 16, max: 16 });
  });

  it('pushes min down when max is pressed below it', () => {
    expect(pushRange({ min: 2, max: 4 }, 'max', 1)).toEqual({ min: 1, max: 1 });
    expect(pushRange({ min: 8, max: 16 }, 'max', 4)).toEqual({ min: 4, max: 4 });
  });

  it('leaves the other end alone when the press does not cross it, or lands on it', () => {
    expect(pushRange({ min: 2, max: 8 }, 'min', 4)).toEqual({ min: 4, max: 8 });
    expect(pushRange({ min: 2, max: 8 }, 'max', 4)).toEqual({ min: 2, max: 4 });
    expect(pushRange({ min: 2, max: 4 }, 'min', 4)).toEqual({ min: 4, max: 4 });
    expect(pushRange({ min: 2, max: 4 }, 'max', 2)).toEqual({ min: 2, max: 2 });
  });
});
