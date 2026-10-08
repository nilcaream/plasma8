/**
 * The tempo detector's bench: synthetic tracks with known tempo, fed through
 * the detector as the page feeds it (blocks of samples, an analysis every
 * quarter second), scored per method. Used by src/tempoBench.test.ts (the
 * table, on demand) and src/tempoDetect.test.ts (the floor every change keeps).
 */

import { METHODS, type Method, TempoDetector } from './tempoDetect';
import { PATTERNS, render, tempoAt, type TrackSpec } from './tempoSynth';

export interface BenchCase { name: string; spec: TrackSpec }

const S = 30;
export const CASES: BenchCase[] = [
  { name: '4floor 128', spec: { bpm: 128, seconds: S, pattern: PATTERNS.fourFloor, seed: 1 } },
  { name: '4floor full 128 +pad', spec: { bpm: 128, seconds: S, pattern: PATTERNS.fourFloorFull, pad: true, seed: 2 } },
  { name: 'breakA 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.breakA, seed: 3 } },
  { name: 'breakB 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.breakB, seed: 4 } },
  { name: 'snare only 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.snareOnly, seed: 5 } },
  { name: 'kick half 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.kickHalf, seed: 6 } },
  { name: 'synco kick 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.syncoKick, seed: 7 } },
  { name: 'synco kick+snare 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.syncoKickSnare, seed: 8 } },
  { name: 'hats 8ths 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.hats8, seed: 9 } },
  { name: 'hats 16ths 130', spec: { bpm: 130, seconds: S, pattern: PATTERNS.hats16, seed: 10 } },
  { name: '4floor 127.4', spec: { bpm: 127.4, seconds: S, pattern: PATTERNS.fourFloor, seed: 11 } },
  { name: 'breakA 141.7', spec: { bpm: 141.7, seconds: S, pattern: PATTERNS.breakA, seed: 12 } },
  { name: '4floor 110', spec: { bpm: 110, seconds: S, pattern: PATTERNS.fourFloor, seed: 13 } },
  { name: '4floor 150', spec: { bpm: 150, seconds: S, pattern: PATTERNS.fourFloor, seed: 14 } },
  { name: 'breakB 110', spec: { bpm: 110, seconds: S, pattern: PATTERNS.breakB, seed: 15 } },
  { name: 'snare only 150', spec: { bpm: 150, seconds: S, pattern: PATTERNS.snareOnly, seed: 16 } },
  { name: 'swing 124 (16th hats)', spec: { bpm: 124, seconds: S, pattern: PATTERNS.fourFloorFull, swing: 0.25, seed: 17 } },
  { name: 'breakA 136 swing+jitter', spec: { bpm: 136, seconds: S, pattern: PATTERNS.breakA, swing: 0.2, jitterMs: 4, seed: 18 } },
  { name: '4floor 128 noise 0dB', spec: { bpm: 128, seconds: S, pattern: PATTERNS.fourFloor, noise: 1, seed: 19 } },
  { name: 'breakB 133 noise -6dB', spec: { bpm: 133, seconds: S, pattern: PATTERNS.breakB, noise: 2, seed: 20 } },
  { name: '4floor 128 room', spec: { bpm: 128, seconds: S, pattern: PATTERNS.fourFloorFull, reverb: 0.8, reverbTime: 1.2, seed: 21 } },
  { name: 'breakA 130 room', spec: { bpm: 130, seconds: S, pattern: PATTERNS.breakA, reverb: 0.8, reverbTime: 1.0, seed: 22 } },
  { name: '4floor 125 levels', spec: { bpm: 125, seconds: S, pattern: PATTERNS.fourFloor, gain: [[0, -30], [6, -30], [8, 0], [15, 0], [16, -24], [22, -24], [23, 0]], seed: 23 } },
  { name: '4floor 128 breakdown', spec: { bpm: 128, seconds: S, pattern: PATTERNS.fourFloorFull, pad: true, breakdown: [10, 18], seed: 24 } },
  { name: 'breakA 137.5 all', spec: { bpm: 137.5, seconds: S, pattern: PATTERNS.breakA, pad: true, noise: 1, reverb: 0.6, jitterMs: 2, gain: [[0, -12], [10, 0]], seed: 25 } },
  { name: '4floor 145.3 44.1k', spec: { bpm: 145.3, seconds: S, fs: 44100, pattern: PATTERNS.fourFloorFull, seed: 26 } },
  // hard: a phone's microphone, crowds, melodic parts that pull to 4:3, half time
  { name: 'H phone 4floor 128', spec: { bpm: 128, seconds: S, pattern: PATTERNS.fourFloorFull, phoneMic: true, velocityDb: 3, seed: 31 } },
  { name: 'H phone breakB 130 babble', spec: { bpm: 130, seconds: S, pattern: PATTERNS.breakB, phoneMic: true, babble: 2, velocityDb: 3, seed: 32 } },
  { name: 'H dotted arp 110 weak drums', spec: { bpm: 110, seconds: S, pattern: PATTERNS.fourFloor, dottedArpDb: 0, drumsDb: -12, velocityDb: 3, seed: 33 } },
  { name: 'H dotted arp 140 breakA', spec: { bpm: 140, seconds: S, pattern: PATTERNS.breakA, dottedArpDb: 0, drumsDb: -6, velocityDb: 3, seed: 34 } },
  { name: 'H stabs 128 hats+bass', spec: { bpm: 128, seconds: S, pattern: PATTERNS.hatsBass, stabsDb: 0, velocityDb: 3, seed: 35 } },
  { name: 'H half-time 140', spec: { bpm: 140, seconds: S, pattern: PATTERNS.halfTime, velocityDb: 3, seed: 36 } },
  { name: 'H babble 2/s 4floor 126', spec: { bpm: 126, seconds: S, pattern: PATTERNS.fourFloor, babble: 2, velocityDb: 3, seed: 37 } },
  { name: 'H snare only 130 phone noise', spec: { bpm: 130, seconds: S, pattern: PATTERNS.snareOnly, phoneMic: true, noise: 1, velocityDb: 3, seed: 38 } },
  { name: 'H synco kick 117 phone room', spec: { bpm: 117, seconds: S, pattern: PATTERNS.syncoKick, phoneMic: true, reverb: 0.8, reverbTime: 1.2, velocityDb: 3, seed: 39 } },
  { name: 'H everything breakA 133', spec: { bpm: 133, seconds: S, pattern: PATTERNS.breakA, phoneMic: true, reverb: 0.7, noise: 1.5, babble: 1.5, dottedArpDb: -3, pad: true, jitterMs: 3, velocityDb: 4, seed: 40 } },
  { name: 'H everything 4floor 112.6', spec: { bpm: 112.6, seconds: S, pattern: PATTERNS.fourFloorFull, phoneMic: true, reverb: 0.7, noise: 1.5, babble: 1.5, stabsDb: -3, pad: true, velocityDb: 4, seed: 41 } },
  // the music changes under the detector
  { name: 'C long breakdown 128 (8-22 s)', spec: { bpm: 128, seconds: 40, pattern: PATTERNS.fourFloorFull, pad: true, breakdown: [8, 22], velocityDb: 3, seed: 51 } },
  { name: 'C jump 128 to 135 at 15 s', spec: { bpm: 128, seconds: 40, pattern: PATTERNS.fourFloor, change: { at: 15, bpm: 135, over: 0 }, velocityDb: 3, seed: 52 } },
  { name: 'C jump 140 to 124 breakA', spec: { bpm: 140, seconds: 40, pattern: PATTERNS.breakA, change: { at: 15, bpm: 124, over: 0 }, velocityDb: 3, seed: 53 } },
  { name: 'C ramp 126 to 128 in 10 s', spec: { bpm: 126, seconds: 40, pattern: PATTERNS.fourFloorFull, change: { at: 10, bpm: 128, over: 10 }, velocityDb: 3, seed: 54 } },
  { name: 'C dropouts snare only 130', spec: { bpm: 130, seconds: 40, pattern: PATTERNS.snareOnly, dropouts: [[12, 10], [21, 21.3], [29, 10]], seed: 55 } },
  { name: 'C dropouts 4floor 128', spec: { bpm: 128, seconds: 40, pattern: PATTERNS.fourFloorFull, dropouts: [[12, 10], [21, 21.3], [29, 10]], velocityDb: 3, seed: 56 } },
  { name: 'H everything halftime 147.2', spec: { bpm: 147.2, seconds: S, pattern: PATTERNS.halfTime, phoneMic: true, reverb: 0.7, noise: 1.5, babble: 1.5, dottedArpDb: -6, velocityDb: 4, seed: 42 } },
];

export interface Trace { t: number[]; readings: Record<Method, (number | null)[]> }

/** Feeds a track in blocks and analyses every `every` seconds. */
export function run(spec: TrackSpec, every = 0.25): Trace {
  const fs = spec.fs ?? 48000;
  const audio = render(spec);
  const det = new TempoDetector(fs);
  const block = 2048;
  const trace: Trace = { t: [], readings: { grid: [], comb: [], ioi: [] } };
  let next = every;
  for (let i = 0; i < audio.length; i += block) {
    det.push(audio.subarray(i, Math.min(audio.length, i + block)));
    if ((i + block) / fs >= next) {
      next += every;
      const a = det.analyse();
      trace.t.push((i + block) / fs);
      for (const m of METHODS) trace.readings[m].push(a ? a.readings[m] : null);
    }
  }
  return trace;
}

export interface Score {
  /** Median signed error over the last 5 s, BPM. */
  err: number;
  /** Largest error over the last 10 s, BPM. */
  maxErr: number;
  /** Seconds after which every reading stays within 0.5 / 0.1 BPM (Infinity: never). */
  settle05: number;
  settle01: number;
  /** The final reading is a 2:1, 3:2 or 4:3 relative of the truth. */
  octave: boolean;
}

export function score(trace: Trace, method: Method, spec: TrackSpec): Score {
  const r = trace.readings[method];
  const end = trace.t[trace.t.length - 1]!;
  const bpm = tempoAt(spec, end);
  const errs = r.map((v, i) => (v === null ? Infinity : v - tempoAt(spec, trace.t[i]!)));
  const tail = errs.filter((_, i) => trace.t[i]! > end - 5).sort((a, b) => a - b);
  const err = tail[tail.length >> 1]!;
  const maxErr = Math.max(...errs.filter((_, i) => trace.t[i]! > end - 10).map(Math.abs));
  const settle = (tol: number): number => {
    let s = 0;
    for (let i = 0; i < errs.length; i++) if (!(Math.abs(errs[i]!) < tol)) s = i + 1 < trace.t.length ? trace.t[i + 1]! : Infinity;
    return s;
  };
  const final = bpm + err;
  const octave = Math.abs(err) > 1 && [2, 0.5, 1.5, 2 / 3, 4 / 3, 3 / 4].some((q) => Math.abs(final / (bpm * q) - 1) < 0.02);
  return { err, maxErr, settle05: settle(0.5), settle01: settle(0.1), octave };
}
