import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms';
import { julia, JULIA_MOVING } from './algorithms/julia';
import { plasma, PLASMA_MOVING } from './algorithms/plasma';
import { warpNoise, WARP_NOISE_MOVING } from './algorithms/warpNoise';
import { formatRanges, isFixed, range, startRange } from './knobs';
import { knobSections, resizeMoving, rowTitle } from './knobPanel';
import { drawMoving, entryKeys, groupNames, movingAt } from './moving';
import { hitTime } from './crossfader';
import { STEP_AT_1 } from './randomWalk';
import { createRng } from './rng';

describe('knobSections', () => {
  const ALL = [
    { def: julia, lists: JULIA_MOVING },
    { def: plasma, lists: PLASMA_MOVING },
    { def: warpNoise, lists: WARP_NOISE_MOVING },
  ];

  it('lists each can-move list together in the order of the lists, then the values that never move, then the beat voices, and splits no list', () => {
    for (const { def, lists } of ALL) {
      const keys = def.knobs.map((k) => k.key);
      const sections = knobSections(def.knobs.filter((k) => !isFixed(k)), def.movable);
      const labels = sections.map((s) => def.movable![s[0]!.key] ?? (/^A\./.test(s[0]!.key) ? 'voices' : 'still'));
      // one section per list, none twice: a list split in two would show up as a repeated label
      expect(labels, def.name).toEqual([...lists.map((_, i) => def.movable![entryKeys(lists[i]!.entries[0]!, keys)[0]!]), 'still', 'voices']);
      lists.forEach((list, i) => {
        expect(sections[i]!.map((k) => k.key).sort(), `${def.name} list ${i + 1}`).toEqual(list.entries.flatMap((e) => entryKeys(e, keys)).sort());
      });
      expect(sections[sections.length - 1]!.map((k) => k.key)).toEqual(['A.kick', 'A.snare', 'A.crash']);
      // nothing lost or added: every drawn knob is in exactly one section
      expect(sections.flat().map((k) => k.key).sort()).toEqual(def.knobs.filter((k) => !isFixed(k)).map((k) => k.key).sort());
    }
  });

  it('is the order Copy prints', () => {
    for (const { def } of ALL) {
      const ranges = Object.fromEntries(def.knobs.map((k) => [k.key, startRange(k, 0)]));
      const lines = formatRanges(def.name, def.knobs, ranges).split('\n').slice(1);
      const drawn = def.knobs.filter((k) => !isFixed(k)).map((k) => k.key);
      expect(lines.slice(0, drawn.length).map((l) => l.split(/\s+/)[0])).toEqual(knobSections(def.knobs.filter((k) => !isFixed(k)), def.movable).flat().map((k) => k.key));
    }
  });
});

describe('resizeMoving', () => {
  const knob = range('a', 10, 20, [0, 30]);
  const mover = (): ReturnType<typeof drawMoving>[number] => drawMoving([['a']], () => [10, 20], createRng(4))[0]!;
  const live = (m: { min: number; max: number }): { min: number; max: number; value: number } => ({ min: m.min, max: m.max, value: (m.min + m.max) / 2 });

  it('moves the sub-range of a moving value and keeps the walk at the same place in it, so the value does not jump', () => {
    const m = mover();
    for (let n = 0; n < 12; n++) movingAt(m, 1, hitTime(m.voice, n));
    const t = hitTime(m.voice, 11);
    const unit = (movingAt(m, 1, t) - m.min) / (m.max - m.min);
    const next = resizeMoving(knob, live(m), m, 'max', m.max + 4);
    expect(m.max).toBeCloseTo(next.max, 12);
    expect(next.max - next.min).toBeGreaterThan(0);
    expect((movingAt(m, 1, t) - m.min) / (m.max - m.min)).toBeCloseTo(unit, 12);
    expect(movingAt(m, 1, t)).toBeLessThanOrEqual(m.max);
    expect(movingAt(m, 1, t)).toBeGreaterThanOrEqual(m.min);
  });

  it('keeps min below max and inside the knob\'s span, as on any knob', () => {
    const m = mover();
    const width = m.max - m.min;
    expect(resizeMoving(knob, live(m), m, 'min', m.max + 5).min).toBeLessThan(m.max);
    expect(m.min).toBeLessThan(m.max);
    resizeMoving(knob, live(m), m, 'max', -5);
    expect(m.max).toBeGreaterThan(m.min);
    resizeMoving(knob, live(m), m, 'min', -5);
    expect(m.min).toBe(0);
    resizeMoving(knob, live(m), m, 'max', 99);
    expect(m.max).toBe(30);
    expect(width).toBeGreaterThan(0);
  });

  it('makes the step a share of the new range', () => {
    const m = mover();
    const at = (n: number): number => movingAt(m, 1, hitTime(m.voice, n));
    at(0);
    resizeMoving(knob, live(m), m, 'min', 0);
    resizeMoving(knob, live(m), m, 'max', 30);
    let before = at(1);
    for (let n = 2; n < 20; n++) {
      const now = at(n);
      expect(Math.abs(now - before) / 30).toBeGreaterThanOrEqual(STEP_AT_1 - 1e-9);
      before = now;
    }
  });
});

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
    expect(plasma['freq.2']).toBe('list 1: pick 3 of 6');
    expect(plasma.scale).toBeUndefined();
    expect(plasma['palD.1']).toBeUndefined();
  });
});
