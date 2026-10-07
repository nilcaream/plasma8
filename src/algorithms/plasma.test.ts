import { describe, expect, it } from 'vitest';
import { drawBounds } from '../knobs';
import { createRng } from '../rng';
import { PLASMA_KNOBS, PLASMA_MOVING, drawPlasmaMoving, plasma } from './plasma';

/** The min and max of every random knob, and the value of each fixed one, as the debug panel's Copy gives them. */
const FILE: Record<string, [number, number] | number> = {
  scale: [1.099, 2.209], swirl: [-0.792, 0.726], 'freq.2': [4.979, 6.777], 'orbit.0': [0.467, 0.883], 'orbit.1': [0.892, 1.287],
  dir1: [0, 6.277], dir2: [0, 6.283], 'freq.0': [1.891, 5.226], 'freq.1': [1.466, 6.25],
  'palA.0': [0.089, 0.868], 'palA.1': [0.211, 0.8], 'palA.2': [0.226, 0.758],
  'palB.0': [0.395, 1], 'palB.1': [0.405, 1], 'palB.2': [0.411, 1],
  'palC.0': [0.6, 1.4], 'palC.1': [0.6, 1.4], 'palC.2': [0.6, 1.4], 'palD.0': [0, 1], 'palD.1': [0, 1], 'palD.2': [0, 1],
  cycles: [0.6, 1.3], 'speed.0': [0.3, 0.843], 'speed.1': [0.3, 0.882], 'speed.2': [0.4, 1.1], 'speed.3': [0.2, 0.8], mode: [0, 2],
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
  it('are one list: freq.2, orbit.0, orbit.1, freq.0, freq.1 and cycles, picking 3', () => {
    expect(PLASMA_MOVING).toEqual([{ pick: 3, entries: ['freq.2', 'orbit.0', 'orbit.1', 'freq.0', 'freq.1', 'cycles'] }]);
  });

  it('move exactly 3 different ones of the list, every one as often as another, and nothing else', () => {
    const rng = createRng(31);
    const count: Record<string, number> = {};
    const runs = 3000;
    for (let i = 0; i < runs; i++) {
      const keys = drawPlasmaMoving(rng).map((m) => m.key);
      expect(new Set(keys).size).toBe(3);
      for (const k of keys) count[k] = (count[k] ?? 0) + 1;
    }
    expect(Object.keys(count).sort()).toEqual(['cycles', 'freq.0', 'freq.1', 'freq.2', 'orbit.0', 'orbit.1']);
    for (const k of Object.keys(count)) {
      expect(count[k]! / runs, k).toBeGreaterThan(0.45);
      expect(count[k]! / runs, k).toBeLessThan(0.55);
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

  it('are marked on the panel: the six of the list say so, the rest do not', () => {
    expect(Object.keys(plasma.movable!).sort()).toEqual(['cycles', 'freq.0', 'freq.1', 'freq.2', 'orbit.0', 'orbit.1']);
    expect(plasma.movable!.cycles).toBe('list 1: pick 3 of 6');
  });
});
