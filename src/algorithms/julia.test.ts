import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { JULIA_KNOBS, JULIA_MOVING_COUNT, JULIA_MOVING_GROUPS, drawJuliaMoving } from './julia';

describe('the julia\'s moving values', () => {
  const NEVER = ['spin', 'wanderSpeed', 'segments', 'palC.0', 'palC.1', 'palC.2', 'centreAngle', 'flashGain', 'glow', 'A.kick', 'A.snare', 'A.crash'];

  it('name four groups of 3, 2, 6 and 4 values, all range knobs of julia, and never a time multiplier, a whole number or the centre\'s angle', () => {
    expect(JULIA_MOVING_GROUPS.map((g) => g.length)).toEqual([3, 2, 6, 4]);
    const keys = JULIA_KNOBS.map((k) => k.key);
    for (const key of JULIA_MOVING_GROUPS.flat()) {
      expect(keys).toContain(key);
      expect(NEVER).not.toContain(key);
      expect(JULIA_KNOBS.find((k) => k.key === key)!.draw.kind).toBe('range');
    }
    expect(new Set(JULIA_MOVING_GROUPS.flat()).size).toBe(15);
  });

  it('move one value from each of 2 to 4 different groups, and reach every value', () => {
    expect(JULIA_MOVING_COUNT).toEqual([2, 4]);
    const rng = createRng(12);
    const counts = new Set<number>();
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const keys = drawJuliaMoving(rng).map((m) => m.key);
      keys.forEach((k) => seen.add(k));
      const groups = JULIA_MOVING_GROUPS.filter((g) => g.some((k) => keys.includes(k)));
      counts.add(groups.length);
      for (const g of groups) expect(g.filter((k) => keys.includes(k)).length).toBe(1);
      expect(keys.length).toBe(groups.length);
    }
    expect([...counts].sort()).toEqual([2, 3, 4]);
    expect([...seen].sort()).toEqual([...JULIA_MOVING_GROUPS.flat()].sort());
  });

  it('move a value inside the bounds julia draws it from, with a voice', () => {
    const rng = createRng(13);
    for (let i = 0; i < 100; i++) {
      for (const m of drawJuliaMoving(rng)) {
        const draw = JULIA_KNOBS.find((k) => k.key === m.key)!.draw;
        if (draw.kind !== 'range') throw new Error('not a range');
        expect([m.lo, m.hi]).toEqual([draw.min, draw.max]);
        expect(['kick', 'snare', 'crash']).toContain(m.voice);
      }
    }
  });
});
