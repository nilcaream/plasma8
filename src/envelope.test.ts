import { describe, expect, it } from 'vitest';
import { pulse } from './envelope';

/** How far the envelope drops from the beat to just before the next one: the edge the eye sees. */
const edge = (intensity: number): number => pulse(0, intensity) - pulse(0.999, intensity);

describe('pulse', () => {
  it('is full on the beat at every intensity', () => {
    for (const i of [0, 0.3, 0.7, 1]) expect(pulse(0, i)).toBeCloseTo(1, 10);
  });

  it('swells with no edge at low intensity', () => {
    expect(edge(0)).toBeLessThan(0.001);
    expect(pulse(0.05, 0)).toBeGreaterThan(0.97); // flat over the beat, no attack
    expect(pulse(0.5, 0)).toBeCloseTo(0, 10);
  });

  it('hits sharply at high intensity, and is mostly gone a third of a beat later', () => {
    expect(edge(1)).toBeGreaterThan(0.999);
    expect(pulse(0.33, 1)).toBeLessThan(0.21);
  });

  it('sharpens steadily with the intensity, and stays within 0..1', () => {
    let prev = -1;
    for (let i = 0; i <= 1.0001; i += 0.1) {
      expect(edge(i)).toBeGreaterThan(prev);
      prev = edge(i);
      for (let p = 0; p < 1; p += 0.05) {
        expect(pulse(p, i)).toBeGreaterThanOrEqual(0);
        expect(pulse(p, i)).toBeLessThanOrEqual(1);
      }
    }
  });
});
