import { describe, expect, it } from 'vitest';
import { drawBounds } from '../knobs';
import { createRng } from '../rng';
import { JULIA_KNOBS, JULIA_MOVING, drawJuliaMoving, julia } from './julia';

/** The min and max of every random knob, and the value of each fixed one, as the debug panel's Copy gives them. */
const FILE: Record<string, [number, number] | number> = {
  edge: [0.994, 1.15], wander: [0.034, 0.166], centreOff: [0, 0.347],
  'palD.0': [0, 1], 'palD.1': [0, 1], 'palD.2': [0, 1], bands: [1.5, 5.101],
  'palA.0': [0.45, 0.6], 'palA.1': [0.45, 0.6], 'palA.2': [0.45, 0.6],
  'palB.0': [0.35, 0.5], 'palB.1': [0.35, 0.5], 'palB.2': [0.35, 0.5],
  'palC.0': [0.7, 1.3], 'palC.1': [0.7, 1.3], 'palC.2': [0.7, 1.3],
  centreAngle: [1.784, 3.902], segments: [3, 9], theta: [1.093, 5.391], zoom: [1.311, 1.8], spin: [-0.05, 0.05],
  'A.kick': [0, 1], 'A.snare': [0, 1], 'A.crash': [0, 1],
  flashGain: 0.5, glow: 0.216, wanderSpeed: 0.1,
};

describe('the julia\'s knobs', () => {
  it('are exactly the ones set on the debug panel, with their min and max', () => {
    expect(JULIA_KNOBS.map((k) => k.key).sort()).toEqual(Object.keys(FILE).sort());
    for (const k of JULIA_KNOBS) expect(drawBounds(k.draw), k.key).toEqual(Array.isArray(FILE[k.key]) ? FILE[k.key] : [FILE[k.key], FILE[k.key]]);
  });

  it('keep every range inside the span the panel tries values in', () => {
    for (const k of JULIA_KNOBS) {
      const [lo, hi] = drawBounds(k.draw);
      expect(lo, k.key).toBeGreaterThanOrEqual(k.wide[0]);
      expect(hi, k.key).toBeLessThanOrEqual(k.wide[1]);
    }
  });
});

describe('the julia\'s moving values', () => {
  it('are two lists: palD, and 3 of the centre offset, the centre angle, the wander and the edge', () => {
    expect(JULIA_MOVING).toEqual([
      { pick: 1, entries: ['palD'] },
      { pick: 3, entries: ['centreOff', 'centreAngle', 'wander', 'edge'] },
    ]);
  });

  it('move palD.0, palD.1 and palD.2 every time, each with a walk of its own, and 3 different ones of the second list, each in 3 of 4 draws', () => {
    const rng = createRng(12);
    const count: Record<string, number> = {};
    const runs = 2000;
    for (let i = 0; i < runs; i++) {
      const moving = drawJuliaMoving(rng);
      const keys = moving.map((m) => m.key);
      expect(keys.slice(0, 3)).toEqual(['palD.0', 'palD.1', 'palD.2']);
      expect(new Set(moving.map((m) => m.walk)).size).toBe(6);
      expect(new Set(keys).size).toBe(6);
      for (const k of keys.slice(3)) count[k] = (count[k] ?? 0) + 1;
    }
    expect(Object.keys(count).sort()).toEqual(['centreAngle', 'centreOff', 'edge', 'wander']);
    for (const k of Object.keys(count)) {
      expect(count[k]! / runs, k).toBeGreaterThan(0.7);
      expect(count[k]! / runs, k).toBeLessThan(0.8);
    }
  });

  it('give the three palD values voices of their own', () => {
    const rng = createRng(14);
    let different = 0;
    for (let i = 0; i < 200; i++) different += new Set(drawJuliaMoving(rng).slice(0, 3).map((m) => m.voice)).size > 1 ? 1 : 0;
    // three independent draws of 3 voices differ in 7 of 9 cases
    expect(different / 200).toBeGreaterThan(0.6);
  });

  it('move a value inside the bounds julia draws it from, with a voice', () => {
    const rng = createRng(13);
    for (let i = 0; i < 100; i++) {
      for (const m of drawJuliaMoving(rng)) {
        const draw = JULIA_KNOBS.find((k) => k.key === m.key)!.draw;
        if (draw.kind !== 'range') throw new Error('not a range');
        expect([m.min, m.max]).toEqual([draw.min, draw.max]);
        expect(['kick', 'snare', 'crash']).toContain(m.voice);
      }
    }
  });

  it('are marked on the panel by list, and nothing else is', () => {
    expect(Object.keys(julia.movable!).sort()).toEqual(['centreAngle', 'centreOff', 'edge', 'palD.0', 'palD.1', 'palD.2', 'wander']);
    expect(julia.movable!['palD.1']).toBe('list 1: pick 1 of 1');
    expect(julia.movable!.edge).toBe('list 2: pick 3 of 4');
  });
});
