import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ALGORITHMS, chooseAlgorithm } from './index';

describe('chooseAlgorithm', () => {
  it('picks the soft ones most at a soft setting and the hard ones most at a hard one', () => {
    const rng = createRng(2);
    const mostPicked = (intensity: number): string => {
      const n = new Map<string, number>();
      for (let i = 0; i < 2000; i++) {
        const name = chooseAlgorithm(intensity, rng).name;
        n.set(name, (n.get(name) ?? 0) + 1);
      }
      return [...n.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    };
    expect(mostPicked(0)).toBe('domain-warped-noise');
    expect(mostPicked(1)).toBe('tunnel');
  });
});

describe('chooseAlgorithm among the lit ones', () => {
  it('picks the one lit every time, even while it runs', () => {
    const rng = createRng(3);
    const tunnel = ALGORITHMS.find((a) => a.name === 'tunnel')!;
    for (let i = 0; i < 20; i++) expect(chooseAlgorithm(i / 20, rng, tunnel, ['tunnel'])).toBe(tunnel);
  });

  it('picks only lit ones when several are, and each of them in time', () => {
    const rng = createRng(4);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(chooseAlgorithm(0.5, rng, undefined, ['plasma', 'julia-kaleidoscope']).name);
    expect([...seen].sort()).toEqual(['julia-kaleidoscope', 'plasma']);
  });

  it('takes all of them when the lit names are none the page knows', () => {
    const rng = createRng(5);
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) seen.add(chooseAlgorithm(0.5, rng, undefined, ['no-such']).name);
    expect(seen.size).toBe(ALGORITHMS.length);
  });
});

describe('the panel names', () => {
  it('are the algorithms the page has', async () => {
    const { PLAYABLE } = await import('../settings');
    expect([...PLAYABLE].sort()).toEqual(ALGORITHMS.map((a) => a.name).sort());
  });
});

describe('the algorithms', () => {
  it('have distinct names and homes from soft to hard', () => {
    expect(new Set(ALGORITHMS.map((a) => a.name)).size).toBe(ALGORITHMS.length);
    expect(ALGORITHMS.map((a) => a.name)).toEqual(['domain-warped-noise', 'plasma', 'maze', 'julia-kaleidoscope', 'tunnel']);
    const homes = ALGORITHMS.map((a) => a.home);
    expect([...homes].sort((a, b) => a - b)).toEqual(homes);
    for (const h of homes) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(1);
    }
  });
});
