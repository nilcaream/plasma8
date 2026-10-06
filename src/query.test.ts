import { describe, expect, it } from 'vitest';
import { parseDebugParams } from './query';

describe('parseDebugParams', () => {
  it('reads nothing from an empty query', () => {
    expect(parseDebugParams('')).toEqual({ debug: false });
  });

  it('reads the pinned values', () => {
    expect(parseDebugParams('?algo=domain-warped-noise&intensity=0.8&strobe=0.25&bpm=140&debug')).toEqual({
      algo: 'domain-warped-noise',
      intensity: 0.8,
      strobe: 0.25,
      bpm: 140,
      debug: true,
    });
  });

  it('clamps the sliders to 0..1, halves a tempo above 180 once and limits it to 60..180', () => {
    expect(parseDebugParams('?intensity=5&strobe=-3&bpm=1000')).toMatchObject({ intensity: 1, strobe: 0, bpm: 180 });
    expect(parseDebugParams('?bpm=3')).toMatchObject({ bpm: 60 });
    expect(parseDebugParams('?bpm=200')).toMatchObject({ bpm: 100 });
    expect(parseDebugParams('?bpm=180')).toMatchObject({ bpm: 180 });
    expect(parseDebugParams('?bpm=170')).toMatchObject({ bpm: 170 });
  });

  it('ignores values that are not numbers', () => {
    const p = parseDebugParams('?intensity=loud&strobe=&bpm=fast&algo=');
    expect(p).toEqual({ debug: false });
  });

  it('switches debug off with 0 or false', () => {
    expect(parseDebugParams('?debug=0').debug).toBe(false);
    expect(parseDebugParams('?debug=false').debug).toBe(false);
    expect(parseDebugParams('?debug=1').debug).toBe(true);
  });

  it('has no seed parameter', () => {
    expect(parseDebugParams('?seed=5')).toEqual({ debug: false });
  });
});
