import { describe, expect, it } from 'vitest';
import { drawBounds } from '../knobs';
import { createRng } from '../rng';
import { PLASMA_KNOBS, PLASMA_MOVING, drawPlasmaMoving, plasma } from './plasma';

/** The min and max of every random knob, and the value of each fixed one, as the debug panel's Copy gives them. */
const FILE: Record<string, [number, number] | number> = {
  scale: [0.825, 1.158], swirl: [-0.792, 0.726], 'freq.2': [0.5, 9.304], 'orbit.0': [0, 1.5], 'orbit.1': [0, 1.5],
  dir1: [0, 6.277], dir2: [0, 6.283], 'freq.0': [0.5, 12], 'freq.1': [0.5, 12],
  'palA.0': [0.089, 0.868], 'palA.1': [0.211, 0.8], 'palA.2': [0.226, 0.758],
  'palB.0': [0.395, 1], 'palB.1': [0.405, 1], 'palB.2': [0.411, 1],
  'palC.0': [0.6, 1.4], 'palC.1': [0.6, 1.4], 'palC.2': [0.6, 1.4], 'palD.0': [0, 1], 'palD.1': [0, 1], 'palD.2': [0, 1],
  cycles: [0.544, 2.359], 'speed.0': [0.08, 0.29], 'speed.1': [0.092, 0.302], 'speed.2': [0.078, 0.378], 'speed.3': [0.052, 0.33], mode: [0, 2],
  'A.kick': [0, 1], 'A.snare': [0, 1], 'A.crash': [0, 1],
  flashGain: 1, swirlSpin: 0.011, orbitSpeed: 0.02, colourDrift: 0.021,
};

describe('plasma\'s knobs', () => {
  it('are exactly the ones set on the debug panel, with their min and max', () => {
    expect(PLASMA_KNOBS.map((k) => k.key).sort()).toEqual(Object.keys(FILE).sort());
    for (const k of PLASMA_KNOBS) expect(drawBounds(k.draw), k.key).toEqual(Array.isArray(FILE[k.key]) ? FILE[k.key] : [FILE[k.key], FILE[k.key]]);
  });

  it('keep every range inside the span the panel tries values in', () => {
    for (const k of PLASMA_KNOBS) {
      const [lo, hi] = drawBounds(k.draw);
      expect(lo, k.key).toBeGreaterThanOrEqual(k.wide[0]);
      expect(hi, k.key).toBeLessThanOrEqual(k.wide[1]);
    }
  });
});

describe('plasma\'s moving values', () => {
  it('are two lists: the cycles, and 3 of freq.2, orbit.0, orbit.1, freq.0 and freq.1', () => {
    expect(PLASMA_MOVING).toEqual([
      { pick: 1, entries: ['cycles'] },
      { pick: 3, entries: ['freq.2', 'orbit.0', 'orbit.1', 'freq.0', 'freq.1'] },
    ]);
  });

  it('move the cycles every time and exactly 3 different ones of the five others, each in 3 of 5 draws, and nothing else', () => {
    const rng = createRng(31);
    const count: Record<string, number> = {};
    const runs = 3000;
    for (let i = 0; i < runs; i++) {
      const keys = drawPlasmaMoving(rng).map((m) => m.key);
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(4);
      expect(keys).toContain('cycles');
      for (const k of keys) count[k] = (count[k] ?? 0) + 1;
    }
    expect(Object.keys(count).sort()).toEqual(['cycles', 'freq.0', 'freq.1', 'freq.2', 'orbit.0', 'orbit.1']);
    expect(count.cycles).toBe(runs);
    for (const k of ['freq.0', 'freq.1', 'freq.2', 'orbit.0', 'orbit.1']) {
      expect(count[k]! / runs, k).toBeGreaterThan(0.55);
      expect(count[k]! / runs, k).toBeLessThan(0.65);
    }
  });

  it('walk each knob\'s whole min..max, with a voice', () => {
    const rng = createRng(32);
    for (let i = 0; i < 100; i++) {
      for (const m of drawPlasmaMoving(rng)) {
        expect([m.min, m.max]).toEqual(drawBounds(PLASMA_KNOBS.find((k) => k.key === m.key)!.draw));
        expect(['kick', 'snare', 'crash']).toContain(m.voice);
      }
    }
  });

  it('are marked on the panel by list: the six say so, the rest do not', () => {
    expect(Object.keys(plasma.movable!).sort()).toEqual(['cycles', 'freq.0', 'freq.1', 'freq.2', 'orbit.0', 'orbit.1']);
    expect(plasma.movable!.cycles).toBe('list 1: pick 1 of 1');
    expect(plasma.movable!['orbit.1']).toBe('list 2: pick 3 of 5');
  });
});
