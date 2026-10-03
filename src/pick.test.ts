import { describe, expect, it } from 'vitest';
import { RUNNING_WEIGHT, WEIGHT_FLOOR, pickByIntensity, pickWeight } from './pick';
import { createRng } from './rng';

describe('pickWeight', () => {
  it('is 1 at home', () => {
    expect(pickWeight(0.4, 0.4)).toBeCloseTo(1);
  });

  it('falls smoothly with the distance, the same on both sides', () => {
    let prev = pickWeight(0.5, 0.5);
    for (let d = 0.01; d <= 0.5; d += 0.01) {
      const w = pickWeight(0.5, 0.5 + d);
      expect(w).toBeLessThan(prev);
      expect(prev - w).toBeLessThan(0.06); // no step
      expect(pickWeight(0.5, 0.5 - d)).toBeCloseTo(w);
      prev = w;
    }
  });

  it('never reaches zero, however far the slider is from home', () => {
    expect(pickWeight(1, 0)).toBeGreaterThanOrEqual(WEIGHT_FLOOR);
    expect(pickWeight(0, 1)).toBeGreaterThanOrEqual(WEIGHT_FLOOR);
  });
});

describe('pickByIntensity', () => {
  const items = [
    { name: 'soft', home: 0.1 },
    { name: 'middle', home: 0.5 },
    { name: 'hard', home: 0.9 },
  ];

  function counts(intensity: number): Record<string, number> {
    const rng = createRng(7);
    const out: Record<string, number> = { soft: 0, middle: 0, hard: 0 };
    for (let i = 0; i < 4000; i++) out[pickByIntensity(items, intensity, rng).name]! += 1;
    return out;
  }

  it('favours the algorithm whose home is nearest the slider', () => {
    const low = counts(0);
    expect(low.soft).toBeGreaterThan(low.middle!);
    expect(low.middle).toBeGreaterThan(low.hard!);
    const high = counts(1);
    expect(high.hard).toBeGreaterThan(high.middle!);
    expect(high.middle).toBeGreaterThan(high.soft!);
  });

  it('still picks the farthest one now and then', () => {
    expect(counts(0).hard).toBeGreaterThan(0);
    expect(counts(1).soft).toBeGreaterThan(0);
  });

  it('picks the running one a quarter as often, but still picks it', () => {
    const rng = createRng(9);
    let free = 0;
    let damped = 0;
    for (let i = 0; i < 8000; i++) {
      if (pickByIntensity(items, 0.1, rng).name === 'soft') free++;
      if (pickByIntensity(items, 0.1, rng, items[0]).name === 'soft') damped++;
    }
    const w = items.map((i) => pickWeight(i.home, 0.1));
    const expected = (RUNNING_WEIGHT * w[0]!) / (RUNNING_WEIGHT * w[0]! + w[1]! + w[2]!);
    expect(damped / 8000).toBeCloseTo(expected, 1);
    expect(damped).toBeGreaterThan(0);
    expect(damped).toBeLessThan(free);
  });

  it('follows the weights in proportion', () => {
    const c = counts(0.5);
    const share = c.middle! / 4000;
    const w = items.map((i) => pickWeight(i.home, 0.5));
    expect(share).toBeCloseTo(w[1]! / (w[0]! + w[1]! + w[2]!), 1);
  });
});
