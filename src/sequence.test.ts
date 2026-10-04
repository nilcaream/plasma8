import { describe, expect, it } from 'vitest';
import { createRng, type Rng } from './rng';
import { CUT_SHARE_HARD, CUT_SHARE_SOFT, Sequencer, cutShare, drawChange, phraseFor } from './sequence';

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

describe('phrases', () => {
  it('runs for 4, 8 or 16 bars and nothing else', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(new Sequencer(rng).segment.bars);
    expect([...seen].sort((a, b) => a - b)).toEqual([4, 8, 16]);
  });

  it('rounds the bars left up to a phrase', () => {
    expect(phraseFor(1)).toBe(4);
    expect(phraseFor(4)).toBe(4);
    expect(phraseFor(5)).toBe(8);
    expect(phraseFor(15)).toBe(16);
  });
});

describe('Sequencer change', () => {
  it('prepares one bar ahead and changes exactly on beat 1 after the phrase', () => {
    // 8 bars; then a cut
    const seq = new Sequencer(scripted(0.4, 0.0));
    const seen = drive(seq, 0, 40);
    expect(seen.prepare).toEqual([28]);
    expect(seen.change).toEqual([32]);
    expect(seen.fades).toEqual([]);
  });

  it('fades over the last two beats at intensity 1 and lands at 1 on beat 1', () => {
    // 4 bars; then a fade (0.99 is not a cut) of two beats (0.9)
    const seq = new Sequencer(scripted(0.0, 0.99, 0.9));
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
    const seq = new Sequencer(scripted(0.0, 0.99, 0.1));
    const seen = drive(seq, 0, 17, 0, 1);
    expect(seen.fades[0]![0]).toBeCloseTo(15.05);
    expect(seen.change).toEqual([16]);
  });

  it('fades over the whole last bar at intensity 0 and lands on beat 1, whatever it draws', () => {
    for (const draw of [0.1, 0.9]) {
      const seq = new Sequencer(scripted(0.0, 0.99, draw));
      const seen = drive(seq, 0, 17, 0, 0);
      expect(seq.change).toBeUndefined(); // landed
      expect(seen.change).toEqual([16]);
      expect(seen.fades[0]![0]).toBeCloseTo(12.05);
      expect(seen.fades.find(([b]) => b === 14)![1]).toBeCloseTo(0.5);
      expect(seen.fades[seen.fades.length - 1]![0]).toBeCloseTo(15.95);
    }
  });

  it('starts the next phrase on the bar of the change', () => {
    const seq = new Sequencer(scripted(0.0, 0.0));
    drive(seq, 0, 16);
    expect(seq.segment.startBar).toBe(4);
    expect(seq.barsLeft(16)).toBe(4);
    expect(seq.barsLeft(31.9)).toBe(1);
  });

  it('prepares and changes in the same frame when the clock jumps past the change', () => {
    const seq = new Sequencer(scripted(0.0, 0.0));
    seq.update(1, 0, 0.5);
    expect(seq.update(20, 0, 0.5)).toEqual({ prepare: true, change: true, fade: 0 });
  });
});

describe('Sequencer fresh count', () => {
  it('re-counts the phrase from the new bar 1 with the bars it had left', () => {
    // 8 bars; a fresh count in bar 6 leaves 3 bars, rounded up to 4
    const seq = new Sequencer(scripted(0.4, 0.0, 0.0));
    drive(seq, 0, 21);
    const seen = drive(seq, 0, 20, 1);
    expect(seq.segment).toEqual({ startBar: 4, bars: 4 }); // the change at 16 started the next phrase
    expect(seen.change).toEqual([16]);
  });

  it('lands a fade under way at once', () => {
    const seq = new Sequencer(scripted(0.0, 0.99, 0.9));
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

describe('a held Sequencer (an algorithm forced by name)', () => {
  it('never prepares, fades or changes, over many bars, fresh tap counts and any intensity', () => {
    const held = new Sequencer(createRng(4), 0, true);
    const free = new Sequencer(createRng(4));
    let changes = 0;
    for (let f = 0; f < 64 * 4 * 30; f++) {
      const beats = f / 30;
      const run = beats < 100 ? 0 : 1;
      const step = held.update(beats, run, (f % 100) / 100);
      expect(step).toEqual({ prepare: false, change: false, fade: 0 });
      if (free.update(beats, run, 0.5).change) changes++;
    }
    expect(changes).toBeGreaterThan(3);
    expect(held.barsLeft(10)).toBe(Infinity);
  });
});
