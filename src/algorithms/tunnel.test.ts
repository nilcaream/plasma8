import { describe, expect, it } from 'vitest';
import type { FrameInputs } from '../algorithm';
import { drawKnobs } from '../knobs';
import { MotionClock, steadyRate } from '../motion';
import { drawMoving, movingAt, movingRange } from '../moving';
import { createRng } from '../rng';
import { TUNNEL_KNOBS, TUNNEL_MOVING_GROUPS, divePhases, drawTunnelMoving, tunnelParams } from './tunnel';
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
  it('is drawn from -0.5 to 0.5 and moves through zero when its sub-range does', () => {
    const rng = createRng(11);
    const draws = Array.from({ length: 2000 }, () => drawKnobs(TUNNEL_KNOBS, rng).twist!);
    expect(Math.min(...draws)).toBeLessThan(-0.48);
    expect(Math.max(...draws)).toBeGreaterThan(0.48);
    let crossed = 0;
    for (let i = 0; i < 100; i++) {
      const m = drawMoving([['twist']], (key) => (key === 'twist' ? [-0.5, 0.5] : [0, 1]), rng, [1, 1])[0]!;
      const { min, max } = movingRange(m);
      if (!(min < -0.15 && max > 0.15)) continue;
      const seen = Array.from({ length: 1600 }, (_, j) => movingAt(m, 0.8, j * 0.25));
      expect(Math.min(...seen)).toBeLessThan(0);
      expect(Math.max(...seen)).toBeGreaterThan(0);
      crossed++;
    }
    expect(crossed).toBeGreaterThan(10);
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
  const NEVER = ['ringGap', 'speed', 'sides', 'ribs', 'flashGain', 'A.kick', 'A.snare', 'A.crash'];

  it('name four groups, all values of the tunnel\'s own knobs, and never the ones that read as speed or count', () => {
    expect(TUNNEL_MOVING_GROUPS).toHaveLength(4);
    const keys = TUNNEL_KNOBS.map((k) => k.key);
    for (const key of TUNNEL_MOVING_GROUPS.flat(2)) {
      expect(keys).toContain(key);
      expect(NEVER).not.toContain(key);
    }
  });

  it('move one entry from each of 2 to 4 different groups, the far end as a pair', () => {
    const rng = createRng(9);
    const counts = new Set<number>();
    const keysSeen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const moving = drawTunnelMoving(rng);
      const keys = moving.map((m) => m.key);
      keys.forEach((k) => keysSeen.add(k));
      const far = keys.filter((k) => k.startsWith('farEnd'));
      expect(far.length === 0 || (far.length === 2 && far.includes('farEnd.x') && far.includes('farEnd.y'))).toBe(true);
      const groups = TUNNEL_MOVING_GROUPS.filter((g) => g.flat().some((k) => keys.includes(k)));
      counts.add(groups.length);
      expect(groups.length).toBeGreaterThanOrEqual(2);
      expect(groups.length).toBeLessThanOrEqual(4);
      for (const g of groups) expect(g.flat().filter((k) => keys.includes(k)).length).toBe(g.length === 1 && Array.isArray(g[0]) ? 2 : 1);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect([...counts].sort()).toEqual([2, 3, 4]);
    expect([...keysSeen].sort()).toEqual(TUNNEL_MOVING_GROUPS.flat(2).sort());
  });

  it('gives the two far-end values a sub-range and a voice each', () => {
    const rng = createRng(10);
    let pairs = 0;
    let otherRange = 0;
    let otherVoice = 0;
    for (let i = 0; i < 400; i++) {
      const moving = drawTunnelMoving(rng);
      const x = moving.find((m) => m.key === 'farEnd.x');
      const y = moving.find((m) => m.key === 'farEnd.y');
      if (!x || !y) continue;
      pairs++;
      if (x.min !== y.min) otherRange++;
      if (x.voice !== y.voice) otherVoice++;
    }
    expect(pairs).toBeGreaterThan(20);
    expect(otherRange).toBe(pairs);
    expect(otherVoice).toBeGreaterThan(0);
    expect(otherVoice).toBeLessThan(pairs);
  });
});
