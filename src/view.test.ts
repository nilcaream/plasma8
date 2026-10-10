import { describe, expect, it } from 'vitest';
import { viewScale } from './view';

describe('viewScale', () => {
  it('is 1 where the one-row panel fits, whatever the shape of the screen', () => {
    expect(viewScale(1920, 1080, false)).toBe(1);
    expect(viewScale(1080, 1920, false)).toBe(1);
  });

  it('is height over width on a compact screen taller than wide, so the shorter side sets the scale', () => {
    expect(viewScale(390, 844, true)).toBeCloseTo(844 / 390);
    expect(viewScale(820, 1180, true)).toBeCloseTo(1180 / 820);
  });

  it('is 1 on a compact screen as wide as tall or wider', () => {
    expect(viewScale(844, 390, true)).toBe(1);
    expect(viewScale(800, 800, true)).toBe(1);
  });
});
