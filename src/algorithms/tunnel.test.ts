import { describe, expect, it } from 'vitest';
import type { FrameInputs } from '../algorithm';
import { drawBounds, drawKnobs } from '../knobs';
import { MotionClock, steadyRate } from '../motion';
import { drawLists, movingAt } from '../moving';
import { createRng } from '../rng';
import { TUNNEL_KNOBS, TUNNEL_MOVING, divePhases, drawTunnelMoving, tunnel, tunnelParams } from './tunnel';
import tunnelSource from './tunnel.frag?raw';

const at = (time: number): FrameInputs => ({
  time, beatPhase: 0, barPhase: 0, beatPulse: 0, barPulse: 0, beats: 0, intensity: 0.5, strobe: 0, bpm: 120, width: 64, height: 36,
});

describe('divePhases', () => {
  const values = { speed: 2, twist: 0.1, hueDrift: 0.03 };

  it('sums speed · time step · value: with fixed values, the speed times the time times the value', () => {
    const phases = divePhases();
    let p = phases(values, at(10));
    let last = 10;
    for (let i = 1; i <= 99; i++) {
      last = 10 + i * 0.1;
      p = phases(values, at(last));
    }
    expect(p.u_twistPhase as number).toBeCloseTo(2 * 0.1 * (last - 10), 9);
    expect(p.u_huePhase as number).toBeCloseTo(2 * 0.03 * (last - 10), 9);
  });

  it('starts at 0 whenever the clock already runs, and runs backwards while the twist is negative', () => {
    expect(divePhases()(values, at(500))).toEqual({ u_twistPhase: 0, u_huePhase: 0 });
    const phases = divePhases();
    phases({ ...values, twist: -0.1 }, at(1));
    expect(phases({ ...values, twist: -0.1 }, at(2)).u_twistPhase as number).toBeCloseTo(-2 * 0.1, 12);
  });

  it('crosses zero smoothly: a twist going through 0 turns the phase round without a jump', () => {
    const phases = divePhases();
    phases({ ...values, twist: 0.2 }, at(0));
    const rising = phases({ ...values, twist: 0.2 }, at(1)).u_twistPhase as number;
    const atZero = phases({ ...values, twist: 0 }, at(2)).u_twistPhase as number;
    const back = phases({ ...values, twist: -0.2 }, at(3)).u_twistPhase as number;
    expect(rising).toBeCloseTo(2 * 0.2, 12);
    expect(atZero).toBeCloseTo(rising, 12);
    expect(back).toBeCloseTo(rising - 2 * 0.2, 12);
  });

  it('never jumps when a value moves: the phase keeps what was summed, and only later steps use the new value', () => {
    const phases = divePhases();
    phases(values, at(0));
    const before = phases(values, at(100));
    expect(before.u_twistPhase as number).toBeCloseTo(2 * 0.1 * 100, 9);
    const same = phases({ ...values, twist: 0.3, hueDrift: 0.05 }, at(100));
    expect(same).toEqual(before);
    const after = phases({ ...values, twist: 0.3, hueDrift: 0.05 }, at(101));
    expect(after.u_twistPhase as number).toBeCloseTo(2 * 0.1 * 100 + 2 * 0.3, 9);
    expect(after.u_huePhase as number).toBeCloseTo(2 * 0.03 * 100 + 2 * 0.05, 9);
  });

  it('follows the steady clock: ×1.75 at intensity 1 against 0, in a straight line, with no jump when the slider moves', () => {
    const clock = new MotionClock();
    const phases = divePhases();
    const run = (intensity: number, seconds: number): number => {
      const before = phases(values, at(clock.update(0, 1))).u_twistPhase as number;
      let now = before;
      for (let i = 0; i < seconds * 60; i++) now = phases(values, at(clock.update(1 / 60, steadyRate(intensity)))).u_twistPhase as number;
      return now - before;
    };
    const slow = run(0, 10);
    const half = run(0.5, 10);
    const fast = run(1, 10);
    expect(fast / slow).toBeCloseTo(1.75, 6);
    expect(half / slow).toBeCloseTo(1.375, 6);
    expect(slow).toBeCloseTo(2 * 0.1 * 10, 6);
  });

  it('never goes back when the clock does', () => {
    const phases = divePhases();
    phases(values, at(5));
    const a = phases(values, at(6));
    expect(phases(values, at(4)).u_twistPhase).toBe(a.u_twistPhase);
  });
});

describe('the tunnel shader', () => {
  it('takes the spiral and the colour drift from their running sums plus the spatial part, not from the whole dive', () => {
    expect(tunnelSource).toContain('uniform float u_twistPhase;');
    expect(tunnelSource).toContain('uniform float u_huePhase;');
    expect(tunnelSource).toContain('p.z * u_twist + u_twistPhase');
    expect(tunnelSource).toContain('p.z * u_hueDrift + u_huePhase');
    expect(tunnelSource).not.toMatch(/[^.\w]z \* u_(twist|hueDrift)/);
  });

  it('bends the tube to the far end, at rest as drawn', () => {
    expect(tunnelSource).toContain('uniform vec2 u_farEnd;');
    expect(tunnelParams(drawKnobs(TUNNEL_KNOBS, createRng(1))).u_farEnd).toHaveLength(2);
  });
});

describe('the twist', () => {
  it('is drawn from -0.5 to 0.5 and moves through zero, as it walks the whole range', () => {
    const rng = createRng(11);
    const draws = Array.from({ length: 2000 }, () => drawKnobs(TUNNEL_KNOBS, rng).twist!);
    expect(Math.min(...draws)).toBeLessThan(-0.48);
    expect(Math.max(...draws)).toBeGreaterThan(0.48);
    let crossed = 0;
    for (let i = 0; i < 100; i++) {
      const m = drawLists([{ pick: 1, entries: ['twist'] }], ['twist'], () => [-0.5, 0.5], rng)[0]!;
      const seen = Array.from({ length: 1600 }, (_, j) => movingAt(m, 0.8, j * 0.25));
      expect(Math.min(...seen)).toBeLessThan(0);
      expect(Math.max(...seen)).toBeGreaterThan(0);
      crossed++;
    }
    expect(crossed).toBe(100);
  });
});

describe('the far end', () => {
  it('is drawn from -0.271 to 0.271 on each axis, reaching both ends', () => {
    const rng = createRng(8);
    const draws = Array.from({ length: 3000 }, () => drawKnobs(TUNNEL_KNOBS, rng));
    for (const key of ['farEnd.x', 'farEnd.y']) {
      const seen = draws.map((d) => d[key]!);
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(-0.271);
      expect(Math.max(...seen)).toBeLessThan(0.271);
      expect(Math.min(...seen)).toBeLessThan(-0.26);
      expect(Math.max(...seen)).toBeGreaterThan(0.26);
    }
  });
});

describe('the tunnel\'s moving values', () => {
  it('are two lists: palD or the hue drift, and the twist, one each', () => {
    expect(TUNNEL_MOVING).toEqual([{ pick: 1, entries: ['palD', 'hueDrift'] }, { pick: 1, entries: ['twist'] }]);
  });

  it('move the twist every time, and either palD (all three values) or the hue drift, as often as one another; the far end never moves', () => {
    const rng = createRng(9);
    let palD = 0;
    let hue = 0;
    for (let i = 0; i < 600; i++) {
      const keys = drawTunnelMoving(rng).map((m) => m.key);
      expect(keys).toContain('twist');
      expect(keys.some((k) => k.startsWith('farEnd'))).toBe(false);
      if (keys.includes('hueDrift')) {
        hue++;
        expect(keys.sort()).toEqual(['hueDrift', 'twist']);
      } else {
        palD++;
        expect(keys.sort()).toEqual(['palD.0', 'palD.1', 'palD.2', 'twist']);
      }
    }
    expect(palD + hue).toBe(600);
    expect(palD / 600).toBeGreaterThan(0.4);
    expect(palD / 600).toBeLessThan(0.6);
  });

  it('give the three palD values a walk of their own, from another start, and a voice each', () => {
    const rng = createRng(10);
    let triples = 0;
    let otherStart = 0;
    let otherVoice = 0;
    for (let i = 0; i < 400; i++) {
      const palD = drawTunnelMoving(rng).filter((m) => m.key.startsWith('palD'));
      if (palD.length === 0) continue;
      triples++;
      if (new Set(palD.map((m) => movingAt(m, 0, 0))).size === 3) otherStart++;
      if (new Set(palD.map((m) => m.voice)).size > 1) otherVoice++;
    }
    expect(triples).toBeGreaterThan(100);
    expect(otherStart).toBe(triples);
    expect(otherVoice).toBeGreaterThan(triples * 0.6);
    expect(otherVoice).toBeLessThan(triples);
  });

  it('walk the whole range each is drawn from, and the panel marks them by list', () => {
    const rng = createRng(11);
    for (const m of drawTunnelMoving(rng)) expect([m.min, m.max]).toEqual(drawBounds(TUNNEL_KNOBS.find((k) => k.key === m.key)!.draw));
    expect(Object.keys(tunnel.movable!).sort()).toEqual(['hueDrift', 'palD.0', 'palD.1', 'palD.2', 'twist']);
    expect(tunnel.movable!.hueDrift).toBe('list 1: pick 1 of 2');
    expect(tunnel.movable!.twist).toBe('list 2: pick 1 of 1');
  });
});

describe('the tunnel\'s knobs', () => {
  /** The min and max of every random knob, and the value of the fixed one, as the debug panel's Copy gives them. */
  const FILE: Record<string, [number, number] | number> = {
    'farEnd.x': [-0.271, 0.271], 'farEnd.y': [-0.271, 0.271], twist: [-0.5, 0.5],
    'palA.0': [0.45, 0.6], 'palA.1': [0.45, 0.6], 'palA.2': [0.45, 0.6],
    'palB.0': [0.35, 0.5], 'palB.1': [0.35, 0.5], 'palB.2': [0.35, 0.5],
    'palC.0': [0.6, 1.2], 'palC.1': [0.6, 1.2], 'palC.2': [0.6, 1.2],
    'palD.0': [0, 1], 'palD.1': [0, 1], 'palD.2': [0, 1], hueDrift: [0.024, 0.079],
    sides: [2, 9], speed: [1.136, 1.896], ringGap: [0.481, 2.058], ribs: [1, 14],
    'A.kick': [0, 1], 'A.snare': [0, 1], 'A.crash': [0, 1], flashGain: 1,
  };

  it('are exactly the ones set on the debug panel, with their min and max', () => {
    expect(TUNNEL_KNOBS.map((k) => k.key).sort()).toEqual(Object.keys(FILE).sort());
    for (const k of TUNNEL_KNOBS) expect(drawBounds(k.draw), k.key).toEqual(Array.isArray(FILE[k.key]) ? FILE[k.key] : [FILE[k.key], FILE[k.key]]);
  });
});
