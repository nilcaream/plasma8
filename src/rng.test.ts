import { describe, expect, it } from 'vitest';
import { createRng, formatSeed } from './rng';

describe('createRng', () => {
  it('draws the same sequence for the same seed and another for another seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(seqA);
    expect([c.next(), c.next(), c.next()]).not.toEqual(seqA);
  });

  it('stays in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range stays inside its bounds and pick returns a member', () => {
    const rng = createRng(99);
    for (let i = 0; i < 200; i++) {
      const v = rng.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
      expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    }
  });
});

describe('formatSeed', () => {
  it('is 8 lowercase hex digits', () => {
    expect(formatSeed(255)).toBe('000000ff');
    expect(formatSeed(0xdeadbeef)).toBe('deadbeef');
  });
});
