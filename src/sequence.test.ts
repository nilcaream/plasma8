import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from './rng';
import { CUT_SHARE_HARD, CUT_SHARE_SOFT, Sequencer, cutShare, drawChange } from './sequence';
import type { LengthRange } from './visualLength';

/** An rng that hands out the given values in turn, over and over. */
function scripted(...values: number[]): Rng {
  let i = 0;
  const next = (): number => values[i++ % values.length]!;
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
}

interface Seen {
  prepare: number[];
  change: number[];
  fades: [number, number][];
}

/** Steps the sequencer through beats `from`..`to` in small steps and notes what it said. */
function drive(seq: Sequencer, from: number, to: number, run = 0, intensity = 0.5): Seen {
  const seen: Seen = { prepare: [], change: [], fades: [] };
  for (let b = from; b < to + 1e-9; b = Math.round((b + 0.05) * 100) / 100) {
    const s = seq.update(b, run, intensity);
    if (s.prepare) seen.prepare.push(b);
    if (s.change) seen.change.push(b);
    if (s.fade > 0) seen.fades.push([b, s.fade]);
  }
  return seen;
}

/** Lengths 4, 8 and 16: the range the tests below were written for. */
const PHRASES = { min: 4, max: 16 } as const;

describe('visual length', () => {
  const lengths = (rng: Rng, range?: LengthRange): number[] => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) seen.add(new Sequencer(rng, 0, range).segment.bars);
    return [...seen].sort((a, b) => a - b);
  };

  it('is drawn from 2 and 4 bars until the range is changed', () => {
    expect(lengths(createRng(3))).toEqual([2, 4]);
  });

  it('is drawn from every length between min and max, and nothing else', () => {
    expect(lengths(createRng(3), { min: 1, max: 16 })).toEqual([1, 2, 4, 8, 16]);
    expect(lengths(createRng(3), PHRASES)).toEqual([4, 8, 16]);
    expect(lengths(createRng(3), { min: 8, max: 8 })).toEqual([8]);
  });

  it('draws each length of the range equally often', () => {
    const rng = createRng(9);
    const count = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const bars = new Sequencer(rng, 0, { min: 2, max: 16 }).segment.bars;
      count.set(bars, (count.get(bars) ?? 0) + 1);
    }
    expect([...count.keys()].sort((a, b) => a - b)).toEqual([2, 4, 8, 16]);
    for (const n of count.values()) expect(n / 6000).toBeCloseTo(0.25, 1);
  });

  it('takes a new range from the next change, and the visual that runs keeps its length', () => {
    const seq = new Sequencer(scripted(0.0, 0.0), 0, { min: 4, max: 4 });
    seq.setRange({ min: 1, max: 1 });
    expect(seq.segment.bars).toBe(4);
    const seen = drive(seq, 0, 24);
    expect(seen.change).toEqual([16, 20, 24]);
  });
});

describe('Sequencer change', () => {
  it('prepares one bar ahead and changes exactly on beat 1 after the phrase', () => {
    // 8 bars; then a cut
    const seq = new Sequencer(scripted(0.4, 0.0), 0, PHRASES);
    const seen = drive(seq, 0, 40);
    expect(seen.prepare).toEqual([28]);
    expect(seen.change).toEqual([32]);
    expect(seen.fades).toEqual([]);
  });

  it('fades over the last two beats at intensity 1 and lands at 1 on beat 1', () => {
    // 4 bars; then a fade (0.99 is not a cut) of two beats (0.9)
    const seq = new Sequencer(scripted(0.0, 0.99, 0.9), 0, PHRASES);
    const seen = drive(seq, 0, 17, 0, 1);
    expect(seen.change).toEqual([16]);
    const fades = seen.fades;
    expect(fades[0]![0]).toBeCloseTo(14.05);
    expect(fades.find(([b]) => b === 15)![1]).toBeCloseTo(0.5);
    expect(fades[fades.length - 1]![0]).toBeCloseTo(15.95);
    expect(fades[fades.length - 1]![1]).toBeCloseTo(0.975);
    for (let i = 1; i < fades.length; i++) expect(fades[i]![1]).toBeGreaterThan(fades[i - 1]![1]);
  });

  it('fades over the last beat only when it draws one beat at intensity 1', () => {
    const seq = new Sequencer(scripted(0.0, 0.99, 0.1), 0, PHRASES);
    const seen = drive(seq, 0, 17, 0, 1);
    expect(seen.fades[0]![0]).toBeCloseTo(15.05);
    expect(seen.change).toEqual([16]);
  });

  it('fades over the whole last bar at intensity 0 and lands on beat 1, whatever it draws', () => {
    for (const draw of [0.1, 0.9]) {
      const seq = new Sequencer(scripted(0.0, 0.99, draw), 0, PHRASES);
      const seen = drive(seq, 0, 17, 0, 0);
      expect(seq.change).toBeUndefined(); // landed
      expect(seen.change).toEqual([16]);
      expect(seen.fades[0]![0]).toBeCloseTo(12.05);
      expect(seen.fades.find(([b]) => b === 14)![1]).toBeCloseTo(0.5);
      expect(seen.fades[seen.fades.length - 1]![0]).toBeCloseTo(15.95);
    }
  });

  it('starts the next phrase on the bar of the change', () => {
    const seq = new Sequencer(scripted(0.0, 0.0), 0, PHRASES);
    drive(seq, 0, 16);
    expect(seq.segment.startBar).toBe(4);
    expect(seq.barsLeft(16)).toBe(4);
    expect(seq.barsLeft(31.9)).toBe(1);
  });

  it('prepares and changes in the same frame when the clock jumps past the change', () => {
    const seq = new Sequencer(scripted(0.0, 0.0), 0, PHRASES);
    seq.update(1, 0, 0.5);
    expect(seq.update(20, 0, 0.5)).toEqual({ prepare: true, change: true, fade: 0 });
  });
});

describe('Sequencer fresh count (a press that is beat 1 of bar 1)', () => {
  it('starts the next visual at once, made in that frame, and counts its length from the new bar 1', () => {
    // 4 bars; a fresh count in bar 3 changes then, and the next change is 4 bars after the press
    const seq = new Sequencer(scripted(0.0, 0.0), 0, PHRASES);
    drive(seq, 0, 9);
    expect(seq.update(0, 1, 0.5)).toEqual({ prepare: true, change: true, fade: 0 });
    expect(seq.segment).toEqual({ startBar: 0, bars: 4 });
    const seen = drive(seq, 0.05, 20, 1);
    expect(seen.change).toEqual([16]);
  });

  it('does not make a second visual when one was prepared already', () => {
    // a cut prepared one bar ahead, then the press
    const seq = new Sequencer(scripted(0.0, 0.0), 0, PHRASES);
    drive(seq, 0, 13);
    expect(seq.change).toBeDefined();
    expect(seq.update(0, 1, 0.5)).toEqual({ prepare: false, change: true, fade: 0 });
  });

  it('lands a fade under way at once', () => {
    const seq = new Sequencer(scripted(0.0, 0.99, 0.9), 0, PHRASES);
    drive(seq, 0, 15);
    expect(seq.update(0, 1, 0.5)).toEqual({ prepare: false, change: true, fade: 0 });
  });
});

describe('cuts and fades', () => {
  it('cuts more often the higher the intensity', () => {
    expect(cutShare(0)).toBe(CUT_SHARE_SOFT);
    expect(cutShare(1)).toBe(CUT_SHARE_HARD);
    expect(cutShare(0.5)).toBeGreaterThan(cutShare(0.2));
    const rng = createRng(11);
    const cuts = (intensity: number): number => {
      let n = 0;
      for (let i = 0; i < 2000; i++) if (drawChange(rng, intensity).kind === 'cut') n++;
      return n / 2000;
    };
    expect(cuts(0)).toBe(0); // never a cut at intensity 0
    expect(cuts(1)).toBeCloseTo(CUT_SHARE_HARD, 1);
  });

  it('shortens the fades steadily from a bar at intensity 0 to 1 or 2 beats at 1', () => {
    const fade = (draw: number, intensity: number): number => drawChange(scripted(0.99, draw), intensity).beats;
    expect(fade(0.1, 0)).toBe(4);
    expect(fade(0.9, 0)).toBe(4);
    expect(fade(0.1, 1)).toBe(1);
    expect(fade(0.9, 1)).toBe(2);
    expect(fade(0.9, 0.5)).toBeCloseTo(3, 12);
  });
});

describe('a released Sequencer (the algorithm on screen switched off)', () => {
  it('drops a change already prepared and starts a whole new phrase from the bar it is released in', () => {
    const seq = new Sequencer(scripted(0), 0, PHRASES);
    expect(drive(seq, 0, 12.5).prepare).toEqual([12]);
    expect(seq.change).toBeDefined();
    seq.release(53.5);
    expect(seq.change).toBeUndefined();
    expect(seq.segment).toEqual({ startBar: 13, bars: 4 });
    expect(seq.barsLeft(53.5)).toBe(4);
    const seen = drive(seq, 53.5, 70);
    expect(seen.prepare).toEqual([64]);
    expect(seen.change).toEqual([68]);
  });
});
