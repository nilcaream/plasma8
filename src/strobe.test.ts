import { describe, expect, it } from 'vitest';
import { MAX_BPM, MIN_BPM } from './clock';
import { createRng } from './rng';
import { FLASH_END_S, FlashGate, flashLevel, flashStep, onFlashGrid, type StrobeBeat } from './strobe';

/**
 * Flash times over `seconds` of steady beats at `bpm`, as a frame loop sees
 * them: each beat is noticed on the first frame after it, up to a frame late.
 */
function flashTimes(beat: StrobeBeat, bpm: number, seconds: number, seed = 1): number[] {
  const rng = createRng(seed);
  const gate = new FlashGate();
  const out: number[] = [];
  for (let i = 0; i * (60 / bpm) < seconds; i++) {
    const t = i * (60 / bpm) + rng.range(0, 1 / 60);
    if (gate.onBeat(beat, i, bpm, t)) out.push(t);
  }
  return out;
}

describe('the flash grid', () => {
  it('flashes on every kick at 100 BPM', () => {
    expect([0, 1, 2, 3].filter((i) => onFlashGrid('kick', i, 100))).toEqual([0, 1, 2, 3]);
  });

  it('flashes on beats 2 and 4 for the snare', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].filter((i) => onFlashGrid('snare', i, 128))).toEqual([1, 3, 5, 7]);
  });

  it('skips every other kick when the kicks come too fast, keeping beats 1 and 3', () => {
    expect(flashStep('kick', 128)).toBe(2);
    expect([0, 1, 2, 3, 4].filter((i) => onFlashGrid('kick', i, 128))).toEqual([0, 2, 4]);
  });

  it('keeps one snare in a bar only at the fastest tempos', () => {
    expect(flashStep('snare', 200)).toBe(2);
    expect(flashStep('snare', 240)).toBe(4);
  });
});

describe('FlashGate', () => {
  it('never lets 3 flashes into one second, at any tempo, kick or snare', () => {
    for (const beat of ['kick', 'snare'] as const) {
      for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.5) {
        const times = flashTimes(beat, bpm, 12, bpm);
        expect(times.length).toBeGreaterThan(0);
        for (let i = 2; i < times.length; i++) expect(times[i]! - times[i - 2]!).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps every grid beat when the tempo leaves room, frame timing or not', () => {
    expect(flashTimes('kick', 110, 12).length).toBe(22);
  });

  it('holds back a flash that would be the third inside one second', () => {
    const gate = new FlashGate();
    expect(gate.onBeat('kick', 0, 60, 0)).toBe(true);
    expect(gate.onBeat('kick', 1, 60, 0.5)).toBe(true);
    expect(gate.onBeat('kick', 2, 60, 0.9)).toBe(false);
    expect(gate.onBeat('kick', 3, 60, 1.05)).toBe(true);
  });

  it('never fires two flashes close together, as when a tap moves the beat back', () => {
    const gate = new FlashGate();
    expect(gate.onBeat('kick', 4, 60, 10)).toBe(true);
    expect(gate.onBeat('kick', 4, 60, 10.1)).toBe(false);
  });
});

describe('flashLevel', () => {
  it('is the slider strength at first, then falls away to nothing', () => {
    expect(flashLevel(0, 0.7)).toBe(0.7);
    expect(flashLevel(0.1, 0.7)).toBeLessThan(0.7);
    expect(flashLevel(0.1, 0.7)).toBeGreaterThan(0);
    expect(flashLevel(FLASH_END_S, 0.7)).toBe(0);
  });

  it('is nothing with the strobe off', () => {
    expect(flashLevel(0, 0)).toBe(0);
  });
});
