/**
 * The bench table, on demand, written to the file BPM_BENCH names:
 * `env BPM_BENCH=/path/table.md npx vitest run src/tempoBench.test.ts`.
 * Skipped in the normal run (it takes about 20 s).
 */

import { describe, it } from 'vitest';
import { CASES, run, score, scoreClock } from './tempoBench';
import { METHODS } from './tempoDetect';
import { PATTERNS, render, type TrackSpec, wav } from './tempoSynth';

const WAV_CASES = ['4floor 128', 'snare only 130', 'breakA 141.7', 'H everything breakA 133', 'H half-time 140'];

// the project has no node types; the bench needs only these two
declare const process: { env: Record<string, string | undefined> };
const FS = 'node:fs';

const fmt = (v: number, d: number): string => (Number.isFinite(v) ? v.toFixed(d) : '—');

// WAVs for the page's end-to-end run (Chrome's fake microphone): `env BPM_WAVS=/dir npx vitest run src/tempoBench.test.ts`
describe.skipIf(!process.env.BPM_WAVS)('tempo wavs', () => {
  it('writes the files', async () => {
    const { writeFileSync } = await import(/* @vite-ignore */ FS);
    for (const c of CASES.filter((c) => WAV_CASES.includes(c.name))) {
      const spec = { ...c.spec, seconds: 60, change: undefined, breakdown: undefined };
      const name = c.name.replace(/[^a-z0-9.]+/gi, '-').toLowerCase();
      writeFileSync(`${process.env.BPM_WAVS}/${name}.wav`, wav(render(spec), spec.fs ?? 48000));
    }
    // the beat clock's checks: snare hits leave digital silence between them, which marks the true beats in the capture
    const clockWavs: [string, TrackSpec][] = [
      ['snare-130-breakdown', { bpm: 130, seconds: 60, pattern: PATTERNS.snareOnly, breakdown: [12, 20], seed: 61 }],
      ['snare-130-to-138', { bpm: 130, seconds: 60, pattern: PATTERNS.snareOnly, change: { at: 15, bpm: 138, over: 0 }, seed: 62 }],
    ];
    for (const [name, spec] of clockWavs) writeFileSync(`${process.env.BPM_WAVS}/${name}.wav`, wav(render(spec), 48000));
  }, 600_000);
});

describe.skipIf(!process.env.BPM_BENCH)('tempo bench', () => {
  it('prints the table', async () => {
    const { writeFileSync } = await import(/* @vite-ignore */ FS);
    const rows: string[] = ['| case | ' + METHODS.map((m) => `${m} err | ${m} settle .5/.1 s`).join(' | ') + ' |'];
    rows.push('|---|' + METHODS.map(() => '---|---').join('|') + '|');
    const sum = Object.fromEntries(METHODS.map((m) => [m, { in01: 0, in05: 0, oct: 0, settle: [] as number[], abs: [] as number[] }]));
    for (const c of CASES) {
      const trace = run(c.spec);
      const cells = METHODS.map((m) => {
        const s = score(trace, m, c.spec);
        const t = sum[m]!;
        if (Math.abs(s.err) < 0.1) t.in01++;
        if (Math.abs(s.err) < 0.5) t.in05++;
        if (s.octave) t.oct++;
        t.settle.push(s.settle05);
        if (!s.octave) t.abs.push(Math.abs(s.err));
        return `${fmt(s.err, 3)}${s.octave ? ' OCT' : ''} (max ${fmt(s.maxErr, 2)}) | ${fmt(s.settle05, 1)} / ${fmt(s.settle01, 1)}`;
      });
      rows.push(`| ${c.name} | ${cells.join(' | ')} |`);
    }
    rows.push('');
    for (const m of METHODS) {
      const t = sum[m]!;
      const settled = t.settle.filter(Number.isFinite).sort((a, b) => a - b);
      const meanAbs = t.abs.filter(Number.isFinite).reduce((a, b) => a + b, 0) / Math.max(1, t.abs.length);
      rows.push(`${m}: within 0.1 BPM ${t.in01}/${CASES.length}, within 0.5 ${t.in05}/${CASES.length}, octave errors ${t.oct}, median settle(0.5) ${fmt(settled[settled.length >> 1] ?? Infinity, 1)} s, mean |err| (no octave) ${fmt(meanAbs, 3)}`);
    }
    writeFileSync(process.env.BPM_BENCH!, rows.join('\n') + '\n');
  }, 600_000);
});

// The beat clock's table: `env BPM_CLOCK=/path/table.md npx vitest run src/tempoBench.test.ts`
describe.skipIf(!process.env.BPM_CLOCK)('beat clock bench', () => {
  it('prints the table', async () => {
    const { writeFileSync } = await import(/* @vite-ignore */ FS);
    const rows = ['| case | start s | bpm err / max | phase ms median / max | half | changes | anchors | took s | confidence p10 / p50 | lock s / relock s | off s | steps / false |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
    const locks: number[] = [], phases: number[] = [];
    let steps = 0, falseSteps = 0, off = 0;
    for (const c of CASES) {
      const s = scoreClock({ ...c.spec, offset: 0.37 });
      locks.push(s.lock, ...(Number.isNaN(s.relock) ? [] : [s.relock]));
      phases.push(s.phaseMs);
      steps += s.steps;
      falseSteps += s.falseSteps;
      off += s.off;
      rows.push(`| ${c.name} | ${fmt(s.start, 2)} | ${fmt(s.err, 3)} / ${fmt(s.maxErr, 2)} | ${fmt(s.phaseMs, 1)} / ${fmt(s.maxPhaseMs, 1)} | ${fmt(s.half, 2)} | ${s.changes} | ${s.anchors} | ${c.spec.change ? fmt(s.took, 1) : ''} | ${fmt(s.conf10, 2)} / ${fmt(s.conf50, 2)} | ${fmt(s.lock, 2)}${c.spec.change ? ` / ${fmt(s.relock, 2)}` : ''} | ${fmt(s.off, 2)} | ${s.steps} / ${s.falseSteps} |`);
    }
    const q = (xs: number[], f: number): number => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(f * xs.length))]!;
    const lockSum = locks.reduce((a, l) => a + (Number.isFinite(l) ? l : 0), 0);
    rows.push('', `lock s (first take and relock): median ${fmt(q(locks, 0.5), 2)}, p90 ${fmt(q(locks, 0.9), 2)}, sum of finite ${fmt(lockSum, 1)}, never ${locks.filter((l) => !Number.isFinite(l)).length} of ${locks.length}; off after the lock ${fmt(off, 2)} s; steps ${steps}, false ${falseSteps}; phase median of medians ${fmt(q(phases.filter(Number.isFinite), 0.5), 1)} ms`);
    writeFileSync(process.env.BPM_CLOCK!, rows.join('\n') + '\n');
  }, 600_000);
});
