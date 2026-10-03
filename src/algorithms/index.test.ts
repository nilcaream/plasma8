import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ALGORITHMS, chooseAlgorithm } from './index';

describe('chooseAlgorithm', () => {
  it('returns the algorithm asked for by name, every time, even while it runs', () => {
    const rng = createRng(1);
    for (const def of ALGORITHMS) {
      for (let i = 0; i < 5; i++) expect(chooseAlgorithm(def.name, 0.5, rng, def)).toEqual({ def, unknown: false });
    }
  });

  it('falls back to a random one and says so when the name is unknown', () => {
    const r = chooseAlgorithm('no-such-algorithm', 0.5, createRng(1));
    expect(ALGORITHMS).toContain(r.def);
    expect(r.unknown).toBe(true);
  });

  it('picks the soft ones most at a soft setting and the hard ones most at a hard one', () => {
    const rng = createRng(2);
    const mostPicked = (intensity: number): string => {
      const n = new Map<string, number>();
      for (let i = 0; i < 2000; i++) {
        const name = chooseAlgorithm(undefined, intensity, rng).def.name;
        n.set(name, (n.get(name) ?? 0) + 1);
      }
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    };
    expect(mostPicked(0)).toBe('domain-warped-noise');
    expect(mostPicked(1)).toBe('tunnel');
  });
});

describe('the algorithms', () => {
  it('have distinct names and homes from soft to hard', () => {
    expect(new Set(ALGORITHMS.map((a) => a.name)).size).toBe(ALGORITHMS.length);
    expect(ALGORITHMS.map((a) => a.name)).toEqual(['domain-warped-noise', 'plasma', 'julia-kaleidoscope', 'tunnel']);
    const homes = ALGORITHMS.map((a) => a.home);
    expect([...homes].sort((a, b) => a - b)).toEqual(homes);
    for (const h of homes) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });
});
