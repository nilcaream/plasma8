/**
 * The real-music bench, on demand: recordings of music through a room and a microphone, with the
 * tempo the web lists for each, kept outside the repository (they are copyrighted music and room
 * audio). BPM_REAL names a directory with index.json ([{ file, artist, title, webBpm }]) and the
 * 16-bit PCM WAVs it lists; the table goes to the file BPM_REAL_OUT names, and the last analysis of
 * each recording to <BPM_REAL_OUT>.json:
 * `env BPM_REAL=/dir BPM_REAL_OUT=/path/table.md npx vitest run src/tempoReal.test.ts`.
 */

import { describe, it } from 'vitest';
import { combBpm, METHODS, type Method, TempoDetector, wideBpm, type Analysis } from './tempoDetect';

// the project has no node types; the bench needs only these
declare const process: { env: Record<string, string | undefined> };
const FS = 'node:fs';

interface Recording { file: string; artist: string; title: string; webBpm: number }

/** Mono samples of a 16-bit PCM WAV (the first channel when there are more). */
function decode(bytes: Uint8Array): { fs: number; samples: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  let at = 12, fs = 48000, channels = 1;
  while (at + 8 <= bytes.length) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') { channels = view.getUint16(at + 10, true); fs = view.getUint32(at + 12, true); }
    if (tag(at) === 'data') {
      const n = Math.floor(Math.min(size, bytes.length - at - 8) / (2 * channels));
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = view.getInt16(at + 8 + i * 2 * channels, true) / 32768;
      return { fs, samples };
    }
    at += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

/** The ratio of a reading to the truth, named when it is a simple one. */
function relation(reading: number | null, truth: number): string {
  if (reading === null) return 'none';
  for (const [q, name] of [[1, 'right'], [2, '2:1'], [0.5, '1:2'], [1.5, '3:2'], [2 / 3, '2:3'], [4 / 3, '4:3'], [3 / 4, '3:4']] as const) {
    if (Math.abs(reading / (truth * q) - 1) < 0.015) return name;
  }
  return 'other';
}

/** The n highest local maxima of y, as [x, y]. */
function tops(y: Float64Array, x: (i: number) => number, n: number): string {
  const found: [number, number][] = [];
  for (let i = 1; i < y.length - 1; i++) if (y[i]! > y[i - 1]! && y[i]! >= y[i + 1]!) found.push([x(i), y[i]!]);
  return found.sort((a, b) => b[1] - a[1]).slice(0, n).map(([b, v]) => `${b.toFixed(1)} (${v.toFixed(2)})`).join(', ');
}

const fmt = (v: number | null): string => (v === null ? '—' : v.toFixed(2));
const median = (v: number[]): number => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]!; };

describe.skipIf(!process.env.BPM_REAL)('real-music bench', () => {
  it('prints the table', async () => {
    const { readFileSync, writeFileSync } = await import(/* @vite-ignore */ FS);
    const dir = process.env.BPM_REAL!;
    const list: Recording[] = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8'));
    const rows = ['| recording | web | ' + METHODS.map((m) => `${m} last 10 s (share right)`).join(' | ') + ' | confidence | comb tops | wide tops |'];
    rows.push('|---|---|' + METHODS.map(() => '---').join('|') + '|---|---|---|');
    const detail: Record<string, unknown> = {};
    for (const r of list) {
      const { fs, samples } = decode(readFileSync(`${dir}/${r.file}`));
      const det = new TempoDetector(fs);
      const seen: { t: number; readings: Record<Method, number | null>; confidence: number }[] = [];
      let last: Analysis | null = null;
      let next = 0.25;
      for (let i = 0; i < samples.length; i += 2048) {
        det.push(samples.subarray(i, Math.min(samples.length, i + 2048)));
        if ((i + 2048) / fs >= next) {
          next += 0.25;
          const a = det.analyse();
          if (a) { seen.push({ t: a.time, readings: a.readings, confidence: a.confidence }); last = a; }
        }
      }
      const end = seen[seen.length - 1]?.t ?? 0;
      const tail = seen.filter((s) => s.t > end - 10);
      const cells = METHODS.map((m) => {
        const v = tail.map((s) => s.readings[m]).filter((x): x is number => x !== null);
        const right = seen.filter((s) => s.t > 10 && relation(s.readings[m], r.webBpm) === 'right').length / Math.max(1, seen.filter((s) => s.t > 10).length);
        const mid = v.length ? median(v) : null;
        return `${fmt(mid)} ${relation(mid, r.webBpm)} (${Math.round(right * 100)} %)`;
      });
      const conf = median(tail.map((s) => s.confidence));
      rows.push(`| ${r.file} | ${r.webBpm} | ${cells.join(' | ')} | ${conf.toFixed(2)} | ${last ? tops(last.combScore, combBpm, 4) : ''} | ${last ? tops(last.wide, wideBpm, 6) : ''} |`);
      detail[r.file] = last && {
        trace: seen.map((s) => [+s.t.toFixed(2), ...METHODS.map((m) => s.readings[m] && +s.readings[m]!.toFixed(2)), +s.confidence.toFixed(2)]),
        grid: last.grid, rate: last.rate, odfStart: last.odfStart, odf: Array.from(last.odf, (v) => +v.toFixed(3)),
        peaks: last.peaks, comb: Array.from(last.combScore, (v, i) => [+combBpm(i).toFixed(2), +v.toFixed(4)]),
        wide: Array.from(last.wide, (v, i) => [+wideBpm(i).toFixed(1), +v.toFixed(4)]),
      };
    }
    writeFileSync(process.env.BPM_REAL_OUT!, rows.join('\n') + '\n');
    writeFileSync(`${process.env.BPM_REAL_OUT!}.json`, JSON.stringify(detail));
  }, 600_000);
});
