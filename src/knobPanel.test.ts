import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms';
import { rowTitle } from './knobPanel';
import { groupNames } from './moving';

describe('rowTitle', () => {
  it('marks a value that moves with its voice and group, one that may move with "can move" and its group, and leaves the rest alone', () => {
    expect(rowTitle('scale', 'zoom and twist', 'kick')).toBe('scale  (moves) kick  · zoom and twist');
    expect(rowTitle('scale', 'zoom and twist', undefined)).toBe('scale  (can move)  · zoom and twist');
    expect(rowTitle('modeSwitch', undefined, undefined)).toBe('modeSwitch');
  });
});

describe('groupNames', () => {
  it('names every key of a group, a pair that moves together included, and wants one name a group', () => {
    const groups = [['a', 'b'], [['c', 'd']], ['e']] as const;
    expect(groupNames(groups, ['one', 'two', 'three'])).toEqual({ a: 'one', b: 'one', c: 'two', d: 'two', e: 'three' });
    expect(() => groupNames(groups, ['one'])).toThrow();
  });
});

describe('every algorithm\'s movable knobs', () => {
  it('are real knobs, each with a group name, and the groups the panel reads are the ones the draw uses', () => {
    for (const def of ALGORITHMS) {
      const keys = def.knobs.map((k) => k.key);
      const movable = def.movable!;
      expect(Object.keys(movable).length).toBeGreaterThan(0);
      for (const [key, group] of Object.entries(movable)) {
        expect(keys).toContain(key);
        expect(group.length).toBeGreaterThan(0);
      }
    }
    const plasma = ALGORITHMS.find((a) => a.name === 'plasma')!.movable!;
    expect(plasma.scale).toBe('zoom and twist');
    expect(plasma['freq.2']).toBe('ripples');
    expect(plasma['palD.1']).toBe('colour pattern');
    expect(plasma.speed).toBeUndefined();
  });
});
