import { describe, expect, it } from 'vitest';
import { DETECT_DOTS, NO_BEAT_SECONDS, detectView, type DetectInputs } from './detectView';

const listening: DetectInputs = { listening: true, sure: false, agreeing: 4, confidence: 0.62, sinceBeat: 0.25, bpm: 128.04 };

describe('detectView', () => {
  it('listening: a dim tempo with "listening", the bar at the confidence, a dot per agreeing fit', () => {
    expect(detectView(listening)).toEqual({ tempo: '128.04', label: 'listening', dim: true, fill: 0.62, dots: 4 });
  });

  it('listening before a first reading: no tempo yet, nothing filled', () => {
    const v = detectView({ ...listening, bpm: null, agreeing: 0, confidence: 0, sinceBeat: null });
    expect(v).toEqual({ tempo: '', label: 'listening', dim: true, fill: 0, dots: 0 });
  });

  it('no beat heard for a while: the bar empty and the dots dark, the tempo kept', () => {
    const v = detectView({ ...listening, sinceBeat: NO_BEAT_SECONDS + 0.1 });
    expect(v).toMatchObject({ tempo: '128.04', label: 'listening', dim: true, fill: 0, dots: 0 });
    expect(detectView({ ...listening, sinceBeat: NO_BEAT_SECONDS }).dots).toBe(4);
  });

  it('never fills the last dot before the tempo is sure', () => {
    expect(detectView({ ...listening, agreeing: DETECT_DOTS + 3 }).dots).toBe(DETECT_DOTS - 1);
  });

  it('sure: a bright tempo, no label, all dots, the last confidence, with the microphone closed or open', () => {
    for (const open of [false, true]) {
      const v = detectView({ ...listening, listening: open, sure: true, agreeing: DETECT_DOTS, sinceBeat: 30 });
      expect(v).toEqual({ tempo: '128.04', label: '', dim: false, fill: 0.62, dots: DETECT_DOTS });
    }
  });

  it('not listening and not sure (waiting for a press): the tempo as it is, bar and dots empty', () => {
    expect(detectView({ ...listening, listening: false })).toEqual({ tempo: '128.04', label: '', dim: false, fill: 0, dots: 0 });
  });

  it('keeps the fill within 0..1', () => {
    expect(detectView({ ...listening, confidence: 1.4 }).fill).toBe(1);
    expect(detectView({ ...listening, confidence: -1 }).fill).toBe(0);
  });
});
