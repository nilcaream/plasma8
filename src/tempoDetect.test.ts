import { describe, expect, it } from 'vitest';
import { CASES, run, score } from './tempoBench';
import { Fft } from './tempoFft';

describe('Fft', () => {
  it('puts a sine on its bin', () => {
    const n = 1024, fft = new Fft(n);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 8 * i) / n);
    fft.transform(re, im);
    const mag = (k: number) => Math.hypot(re[k]!, im[k]!);
    expect(mag(8)).toBeCloseTo(n / 2, 6);
    expect(mag(n - 8)).toBeCloseTo(n / 2, 6);
    expect(mag(7) + mag(9) + mag(0)).toBeLessThan(1e-6);
  });
});

// The floor of the bench (src/tempoBench.ts): the cases that carry the octave rules, the range's
// edges, a fractional tempo, the 4:3 trap and the hold through a breakdown, 20 s each.
const FLOOR = [
  'snare only 130', 'kick half 130', 'synco kick 130', 'hats 8ths 130', 'hats 16ths 130', 'H half-time 140',
  'breakA 141.7', '4floor 110', '4floor 150', 'snare only 150', 'H dotted arp 110 weak drums', 'H phone breakB 130 babble',
];

describe('TempoDetector', () => {
  for (const name of FLOOR) {
    it(`reads ${name}`, () => {
      const spec = { ...CASES.find((c) => c.name === name)!.spec, seconds: 20 };
      const trace = run(spec);
      const grid = score(trace, 'grid', spec);
      expect(Math.abs(grid.err)).toBeLessThan(0.02);
      expect(grid.maxErr).toBeLessThan(0.1);
      expect(grid.settle05).toBeLessThan(5);
      for (const m of ['comb', 'ioi'] as const) expect(Math.abs(score(trace, m, spec).err)).toBeLessThan(0.2);
    });
  }

  it('holds the reading through a breakdown', () => {
    const spec = CASES.find((c) => c.name === 'C long breakdown 128 (8-22 s)')!.spec;
    const trace = run(spec);
    const s = score(trace, 'grid', spec);
    // within 0.5 BPM from the first reading on, the 14 s without drums included
    expect(s.settle05).toBeLessThan(3);
  });

  it('follows a tempo jump within 8 s', () => {
    const spec = CASES.find((c) => c.name === 'C jump 128 to 135 at 15 s')!.spec;
    expect(score(run(spec), 'grid', spec).settle05).toBeLessThan(15 + 8);
  });
});
