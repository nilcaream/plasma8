import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { ALGORITHMS, chooseAlgorithm } from './index';

describe('chooseAlgorithm', () => {
  it('returns the algorithm asked for by name', () => {
    const name = ALGORITHMS[0]!.name;
    expect(chooseAlgorithm(name, createRng(1))).toEqual({ def: ALGORITHMS[0], unknown: false });
  });

  it('falls back to a random one and says so when the name is unknown', () => {
    const r = chooseAlgorithm('no-such-algorithm', createRng(1));
    expect(ALGORITHMS).toContain(r.def);
    expect(r.unknown).toBe(true);
  });

  it('picks at random when nothing is asked for', () => {
    const r = chooseAlgorithm(undefined, createRng(1));
    expect(ALGORITHMS).toContain(r.def);
    expect(r.unknown).toBe(false);
  });
});
