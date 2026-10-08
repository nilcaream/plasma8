import { describe, expect, it } from 'vitest';
import { CASES, run, score } from './tempoBench';
import { TempoDetector } from './tempoDetect';
import { render } from './tempoSynth';
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
// edges, a fractional tempo, the 3:2 and 4:3 traps with the shuffles that could fool the metre test,
// and the hold through a breakdown, 20 s each.
const FLOOR = [
  'snare only 130', 'kick half 130', 'synco kick 130', 'hats 8ths 130', 'hats 16ths 130', 'H half-time 140',
  'breakA 141.7', '4floor 110', '4floor 150', 'snare only 150', 'H dotted arp 110 weak drums', 'H phone breakB 130 babble',
  'S 4floor 95', 'S snare only 95', 'H dotted arp 140 breakA', 'S dotted arp 105 breakA', 'S shuffle 128 (triplet 16ths)', 'S shuffle breakA 100',
  'S 2-step 135 shuffle phone noise',
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

  it('hears the beat of music busy with 16ths off the half-beat grid, and none in a breakdown', () => {
    const beats = (name: string, from: number, to: number): number => {
      const seen: boolean[] = [];
      run(CASES.find((c) => c.name === name)!.spec, 0.25, (a, t) => { if (a && t >= from && t <= to) seen.push(a.beat); });
      return seen.filter(Boolean).length / seen.length;
    };
    // half the onset strength or less on the half beats, almost all on the 16ths
    expect(beats('H everything breakA 133', 8, 30)).toBeGreaterThan(0.9);
    // the drums stop at 8 s: from 15 s the last 6 s hold nothing but the pad
    expect(beats('C long breakdown 128 (8-22 s)', 15, 21)).toBe(0);
  });

  it('holds the reading through a breakdown', () => {
    const spec = CASES.find((c) => c.name === 'C long breakdown 128 (8-22 s)')!.spec;
    const trace = run(spec);
    const s = score(trace, 'grid', spec);
    // within 0.5 BPM from the first reading on, the 14 s without drums included
    expect(s.settle05).toBeLessThan(3);
  });

  // The synth's beats sit at -offset + k·60/bpm: the grid's beat must land on one of them within a few ms.
  // Kicks 3-3-2 alone and 8th hats alone put as much on the off-beats as on the beats: there only the half beat is checked.
  const BEATS: [string, boolean][] = [
    ['4floor 128', true], ['snare only 130', true], ['kick half 130', true], ['breakA 141.7', true], ['H half-time 140', true],
    ['H phone breakB 130 babble', true], ['synco kick 130', false], ['hats 8ths 130', false],
  ];
  for (const [name, parity] of BEATS) {
    it(`puts the beat of ${name} on the synth's ${parity ? 'beat' : 'half beat'}`, () => {
      const spec = { ...CASES.find((c) => c.name === name)!.spec, seconds: 20, offset: 0.37 };
      const det = new TempoDetector(spec.fs ?? 48000);
      const audio = render(spec);
      for (let i = 0; i < audio.length; i += 2048) det.push(audio.subarray(i, Math.min(audio.length, i + 2048)));
      const g = det.analyse()!.grid!;
      const period = 60 / spec.bpm / (parity ? 1 : 2);
      const e = (g.beat + spec.offset) / period;
      expect(Math.abs(e - Math.round(e)) * period).toBeLessThan(0.005);
    });
  }

  it('follows a tempo jump within 8 s', () => {
    const spec = CASES.find((c) => c.name === 'C jump 128 to 135 at 15 s')!.spec;
    expect(score(run(spec), 'grid', spec).settle05).toBeLessThan(15 + 8);
  });
});
