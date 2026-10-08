/**
 * The bench table, on demand, written to the file BPM_BENCH names:
 * `env BPM_BENCH=/path/table.md npx vitest run src/tempoBench.test.ts`.
 * Skipped in the normal run (it takes about 20 s).
 */

import { describe, it } from 'vitest';
import { CASES, run, score } from './tempoBench';
import { METHODS } from './tempoDetect';

// the project has no node types; the bench needs only these two
declare const process: { env: Record<string, string | undefined> };
const FS = 'node:fs';

const fmt = (v: number, d: number): string => (Number.isFinite(v) ? v.toFixed(d) : '—');

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
