import { describe, expect, it } from 'vitest';
import { VOICE_NAMES } from './beatVoices';
import { REACH_POWER, hitTime } from './crossfader';
import {
  drawLists, getReachPower, getStepAt1, listLabels, movingAt, movingValues, setReachPower, setStepAt1,
  type MovingList, type MovingValue,
} from './moving';
import { STEP_AT_1, STEP_EXTRA } from './randomWalk';
import { createRng, type Rng } from './rng';

const bounds = (key: string): [number, number] => [key.charCodeAt(0), key.charCodeAt(0) + 10];
const ALL_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
/** An instance that moves 3 of 9 values. */
const drawSome = (rng: Rng): MovingValue[] => drawLists([{ pick: 3, entries: ALL_KEYS }], ALL_KEYS, bounds, rng);

describe('a moving value', () => {
  it('walks the whole of the min and max it is given for its knob, not a slice of it', () => {
    const rng = createRng(4);
    for (let i = 0; i < 300; i++) {
      for (const m of drawSome(rng)) expect([m.min, m.max]).toEqual(bounds(m.key));
    }
  });

  it('keeps every value inside its min and max at any intensity and any moment', () => {
    const rng = createRng(5);
    for (const m of drawSome(rng)) {
      const { min, max } = m;
      for (const intensity of [0, 0.4, 1]) {
        for (let beats = 0; beats < 40; beats += 0.37) {
          const v = movingAt(m, intensity, beats);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('gives each moving value a voice at random, kick, snare and crash alike, drawn once', () => {
    const rng = createRng(8);
    const count: Record<string, number> = { kick: 0, snare: 0, crash: 0 };
    for (let i = 0; i < 600; i++) for (const m of drawSome(rng)) count[m.voice]!++;
    const total = count.kick! + count.snare! + count.crash!;
    for (const name of VOICE_NAMES) expect(count[name]! / total).toBeGreaterThan(0.28);
    expect(VOICE_NAMES).toContain(drawSome(createRng(9))[0]!.voice);
  });

  /** Each step the value takes on 40 hits of its voice at an intensity, as a share of its sub-range. */
  const stepsOf = (m: MovingValue, intensity: number): number[] => {
    const at = (n: number): number => (movingAt(m, intensity, hitTime(m.voice, n)) - m.min) / (m.max - m.min);
    let before = at(0);
    const out: number[] = [];
    for (let n = 1; n <= 40; n++) {
      const now = at(n);
      out.push(Math.abs(now - before));
      before = now;
    }
    return out;
  };

  it('steps a random walk on every hit of its voice: a whole step of stepAt1 · I^power of the sub-range, up to a tenth longer', () => {
    expect(getStepAt1()).toBe(STEP_AT_1);
    const rng = createRng(10);
    for (let i = 0; i < 20; i++) {
      for (const m of drawSome(rng)) {
        const base = STEP_AT_1 * 0.5 ** REACH_POWER;
        for (const step of stepsOf(m, 0.5)) {
          expect(step).toBeGreaterThanOrEqual(base - 1e-9);
          expect(step).toBeLessThan(base * (1 + STEP_EXTRA) + 1e-9);
        }
      }
    }
  });

  it('sits still at intensity 0, at a random point of its sub-range rather than the middle', () => {
    const rng = createRng(11);
    const places = new Set<number>();
    for (let i = 0; i < 40; i++) {
      for (const m of drawSome(rng)) {
        expect(new Set(stepsOf(m, 0))).toEqual(new Set([0]));
        const u = (movingAt(m, 0, 99) - m.min) / (m.max - m.min);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        places.add(Math.round(u * 1e6));
      }
    }
    expect(places.size).toBeGreaterThan(100);
    // the start is anywhere in the whole range, both ends included
    expect(Math.min(...places)).toBeLessThan(5e4);
    expect(Math.max(...places)).toBeGreaterThan(95e4);
    expect([...places].filter((u) => Math.abs(u - 5e5) < 1e4).length).toBeLessThan(places.size / 10);
  });

  it('steps by the one global reach power and step, which setReachPower and setStepAt1 change for every value at once', () => {
    expect(getReachPower()).toBe(REACH_POWER);
    const m = drawSome(createRng(12))[0]!;
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    try {
      setReachPower(1);
      expect(Math.min(...stepsOf(m, 0.2))).toBeGreaterThanOrEqual(STEP_AT_1 * 0.2 - 1e-9);
      const linear = mean(stepsOf(m, 0.2));
      setReachPower(2);
      expect(mean(stepsOf(m, 0.2))).toBeLessThan(linear);
      expect(Math.min(...stepsOf(m, 0.2))).toBeGreaterThanOrEqual(STEP_AT_1 * 0.04 - 1e-9);
      setStepAt1(0.4);
      expect(getStepAt1()).toBe(0.4);
      expect(Math.min(...stepsOf(m, 1))).toBeGreaterThanOrEqual(0.4 - 1e-9);
    } finally {
      setReachPower(REACH_POWER);
      setStepAt1(STEP_AT_1);
    }
  });

  it('gives every moving value a walk of its own, drawn from the instance generator: the same seed the same path, another seed another', () => {
    const a = drawSome(createRng(13));
    expect(new Set(a.map((m) => m.walk)).size).toBe(a.length);
    const path = (seed: number): number[] => {
      const m = drawSome(createRng(seed))[0]!;
      return Array.from({ length: 30 }, (_, n) => movingAt(m, 1, hitTime(m.voice, n)));
    };
    expect(path(14)).toEqual(path(14));
    expect(path(14)).not.toEqual(path(15));
  });

  it('draws nothing from the instance generator while it runs', () => {
    const rng = createRng(16);
    const moving = drawSome(rng);
    const after = createRng(16);
    drawSome(after);
    for (const m of moving) for (let n = 0; n < 50; n++) movingAt(m, 1, hitTime(m.voice, n));
    expect(rng.next()).toBe(after.next());
  });

  it('reads every moving value by its key', () => {
    const moving = drawSome(createRng(6));
    expect(Object.keys(movingValues(moving, 0.5, 3)).sort()).toEqual(moving.map((m) => m.key).sort());
  });
});

describe('drawLists', () => {
  const KEYS = ['a', 'b', 'c', 'd', 'e.0', 'e.1', 'e.2', 'f', 'g'];
  const LISTS: MovingList[] = [{ pick: 2, entries: ['a', 'b', 'c', 'e'] }, { pick: 1, entries: ['f', 'g'] }];

  it('picks exactly N different entries of every list, each list on its own, and moves nothing outside the lists', () => {
    const rng = createRng(21);
    for (let i = 0; i < 300; i++) {
      const keys = drawLists(LISTS, KEYS, bounds, rng).map((m) => m.key);
      expect(keys.filter((k) => ['a', 'b', 'c'].includes(k) || k.startsWith('e.')).length).toBeGreaterThanOrEqual(2);
      expect(keys.filter((k) => k === 'f' || k === 'g')).toHaveLength(1);
      expect(keys).not.toContain('d');
      expect(new Set(keys).size).toBe(keys.length);
      const entries = new Set(keys.filter((k) => !['f', 'g'].includes(k)).map((k) => k.split('.')[0]));
      expect(entries.size).toBe(2);
    }
  });

  it('draws every entry equally often', () => {
    const rng = createRng(22);
    const count: Record<string, number> = {};
    const runs = 4000;
    for (let i = 0; i < runs; i++) {
      const entries = new Set(drawLists(LISTS, KEYS, bounds, rng).map((m) => m.key.split('.')[0]!));
      for (const entry of entries) count[entry] = (count[entry] ?? 0) + 1;
    }
    // 2 of 4 entries: each in half the runs; 1 of 2: each in half the runs
    for (const entry of ['a', 'b', 'c', 'e', 'f', 'g']) {
      expect(count[entry]! / runs, entry).toBeGreaterThan(0.45);
      expect(count[entry]! / runs, entry).toBeLessThan(0.55);
    }
  });

  it('moves every sub-value of a picked name, each with a walk of its own and a voice drawn for it', () => {
    const rng = createRng(23);
    const voices = new Set<string>();
    let walks = 0;
    for (let i = 0; i < 200; i++) {
      const moving = drawLists([{ pick: 1, entries: ['e'] }], KEYS, bounds, rng);
      expect(moving.map((m) => m.key)).toEqual(['e.0', 'e.1', 'e.2']);
      expect(new Set(moving.map((m) => m.walk)).size).toBe(3);
      walks += new Set(moving.map((m) => m.voice)).size;
      moving.forEach((m) => voices.add(m.voice));
    }
    expect(voices.size).toBe(3);
    // three independent voices: on average well above one distinct voice per instance
    expect(walks / 200).toBeGreaterThan(1.8);
  });

  it('walks the whole min..max it is given for each knob', () => {
    for (const m of drawLists(LISTS, KEYS, bounds, createRng(24))) expect([m.min, m.max]).toEqual(bounds(m.key));
  });

  it('refuses a name that is no knob and a pick larger than the list', () => {
    expect(() => drawLists([{ pick: 1, entries: ['zz'] }], KEYS, bounds, createRng(1))).toThrow();
    expect(() => drawLists([{ pick: 3, entries: ['a', 'b'] }], KEYS, bounds, createRng(1))).toThrow();
  });

  it('is the same for the same seed', () => {
    const run = (seed: number): string[] => drawLists(LISTS, KEYS, bounds, createRng(seed)).map((m) => `${m.key} ${m.voice}`);
    expect(run(25)).toEqual(run(25));
  });
});

describe('listLabels', () => {
  it('marks every knob of every entry with its list and what the list picks', () => {
    const labels = listLabels([{ pick: 2, entries: ['a', 'e'] }, { pick: 1, entries: ['f'] }], ['a', 'd', 'e.0', 'e.1', 'e.2', 'f']);
    expect(labels).toEqual({
      a: 'list 1: pick 2 of 2', 'e.0': 'list 1: pick 2 of 2', 'e.1': 'list 1: pick 2 of 2', 'e.2': 'list 1: pick 2 of 2', f: 'list 2: pick 1 of 1',
    });
  });
});
