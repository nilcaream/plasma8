/**
 * Synthetic drum tracks for the tempo detector's tests and bench: kick,
 * snare, hats and an off-beat bass on a 16-step grid, with swing, timing
 * jitter, a pad, white noise, a crude room (Schroeder reverb), level changes
 * and a breakdown. Deterministic for a seed.
 */

export interface Voices {
  kick?: number[];
  snare?: number[];
  hat?: number[];
  openHat?: number[];
  bass?: number[];
}

export interface TrackSpec {
  bpm: number;
  /** A tempo change: at `at` seconds the tempo starts moving to `bpm` over `over` seconds (0 = a jump). */
  change?: { at: number; bpm: number; over: number };
  seconds: number;
  pattern: Voices;
  fs?: number;
  seed?: number;
  /** Delay of every odd 16th, as a share of a 16th (1/3 is a triplet shuffle). */
  swing?: number;
  /** Standard deviation of each hit's timing, ms. */
  jitterMs?: number;
  /** Noise rms over the music's rms (1 = 0 dB SNR). */
  noise?: number;
  /** Reverb wet level (0 = dry) and its RT60 in seconds. */
  reverb?: number;
  reverbTime?: number;
  /** Level in dB at given seconds, straight lines between. */
  gain?: [number, number][];
  pad?: boolean;
  /** Seconds [from, to) with no drums (the pad goes on). */
  breakdown?: [number, number];
  /** Seconds of the bar grid before the audio starts (the phase the detector meets). */
  offset?: number;
  /** Each hit's level varies by up to ± this many dB. */
  velocityDb?: number;
  /** Level of the drums in dB (the other parts stay). */
  drumsDb?: number;
  /** A phone or laptop microphone: no bass below about 200 Hz, little above 7 kHz, and its own hiss. */
  phoneMic?: boolean;
  /** Off-grid hand claps and shouts: bursts per second at random times. */
  babble?: number;
  /** A plucked arpeggio on every dotted 8th (3 16ths) with a dotted-8th echo, at this level in dB. */
  dottedArpDb?: number;
  /** Chord stabs on the off-beat 16ths 3, 6, 11 and 14, at this level in dB. */
  stabsDb?: number;
}

export const PATTERNS = {
  fourFloor: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14] },
  fourFloorFull: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], openHat: [2, 6, 10, 14], bass: [2, 6, 10, 14] },
  /** An amen-like break: kicks off the beat, ghost snares. */
  breakA: { kick: [0, 2, 10, 11], snare: [4, 7, 9, 12, 15], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  /** Two-step: kick on 1 and the "and" of 3, snare on 2 and 4. */
  breakB: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  /** Only a snare on 2 and 4: half the beat rate. */
  snareOnly: { snare: [4, 12] },
  /** Only a kick on 1 and 3: half the beat rate. */
  kickHalf: { kick: [0, 8] },
  /** Kicks 3-3-2 across the bar, nothing else. */
  syncoKick: { kick: [0, 3, 6, 8, 11, 14] },
  /** Syncopated kicks with a snare on 2 and 4. */
  syncoKickSnare: { kick: [0, 3, 6, 10], snare: [4, 12] },
  /** Hats on every 8th only: twice the beat rate. */
  hats8: { hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  /** Hats on every 16th only. */
  hats16: { hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  /** Half-time (dubstep): kick on 1, snare on 3, hats on 8ths. */
  halfTime: { kick: [0], snare: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  /** Hats on 8ths with a bass on the off-beats, no kick or snare. */
  hatsBass: { hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [2, 6, 10, 14] },
} satisfies Record<string, Voices>;

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}

function kick(fs: number, r: () => number): Float32Array {
  const n = Math.round(0.35 * fs);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    ph += (2 * Math.PI * (50 + 110 * Math.exp(-t / 0.03))) / fs;
    out[i] = 0.9 * Math.sin(ph) * Math.exp(-t / 0.18) + (t < 0.003 ? 0.3 * (r() * 2 - 1) : 0);
  }
  return out;
}

function snare(fs: number, r: () => number): Float32Array {
  const n = Math.round(0.25 * fs);
  const out = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const w = r() * 2 - 1;
    out[i] = 0.35 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.06) + 0.55 * (w - prev) * Math.exp(-t / 0.1);
    prev = w;
  }
  return out;
}

function hat(fs: number, r: () => number, decay: number, length: number, amp: number): Float32Array {
  const n = Math.round(length * fs);
  const out = new Float32Array(n);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n; i++) {
    const w = r() * 2 - 1;
    out[i] = amp * (w - 2 * p1 + p2) * 0.5 * Math.exp(-i / fs / decay);
    p2 = p1; p1 = w;
  }
  return out;
}

function bass(fs: number, length: number, freq: number): Float32Array {
  const n = Math.round(length * fs);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const saw = 2 * ((t * freq) % 1) - 1;
    lp += 0.08 * (saw - lp);
    const env = Math.min(1, t / 0.004) * Math.min(1, (length - t) / 0.01);
    out[i] = 0.35 * lp * env;
  }
  return out;
}

function pluck(fs: number, freq: number, length: number): Float32Array {
  const n = Math.round(length * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const sq = Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(4 * Math.PI * freq * t) + 0.3 * Math.sin(6 * Math.PI * freq * t);
    out[i] = 0.25 * sq * Math.min(1, t / 0.002) * Math.exp(-t / 0.08);
  }
  return out;
}

function stab(fs: number, length: number): Float32Array {
  const n = Math.round(length * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    let v = 0;
    for (const f of [261.6, 311.1, 392, 523.3]) v += 2 * ((t * f) % 1) - 1;
    out[i] = 0.08 * v * Math.min(1, t / 0.003) * Math.min(1, (length - t) / 0.01);
  }
  return out;
}

/** A voiced burst: a buzzy tone with noise, 150-400 ms, rising and falling. */
function shout(fs: number, r: () => number): Float32Array {
  const length = 0.15 + 0.25 * r();
  const f0 = 150 + 200 * r();
  const n = Math.round(length * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / fs;
    const env = Math.sin((Math.PI * t) / length);
    out[i] = 0.3 * env * ((2 * ((t * f0) % 1) - 1) * 0.7 + (r() * 2 - 1) * 0.3);
  }
  return out;
}

/** A phone microphone: two one-pole high-passes at 200 Hz, one low-pass at 7 kHz. */
function phone(x: Float32Array, fs: number): Float32Array {
  const out = new Float32Array(x.length);
  const hp = Math.exp((-2 * Math.PI * 200) / fs);
  const lp = 1 - Math.exp((-2 * Math.PI * 7000) / fs);
  let x1 = 0, y1 = 0, x2 = 0, y2 = 0, l = 0;
  for (let i = 0; i < x.length; i++) {
    const a = hp * (y1 + x[i]! - x1); x1 = x[i]!; y1 = a;
    const b = hp * (y2 + a - x2); x2 = a; y2 = b;
    l += lp * (b - l);
    out[i] = l;
  }
  return out;
}

function addAt(dst: Float32Array, src: Float32Array, at: number, gain = 1): void {
  for (let i = 0; i < src.length; i++) {
    const j = at + i;
    if (j >= 0 && j < dst.length) dst[j]! += gain * src[i]!;
  }
}

/** Four feedback combs and two allpasses: a crude room. */
function schroeder(x: Float32Array, fs: number, rt60: number): Float32Array {
  const wet = new Float32Array(x.length);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.round((ms / 1000) * fs);
    const g = Math.pow(10, (-3 * ms) / 1000 / rt60);
    const buf = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      buf[i] = x[i]! + (i >= d ? g * buf[i - d]! : 0);
      wet[i]! += buf[i]! / 4;
    }
  }
  let y = wet;
  for (const ms of [5, 1.7]) {
    const d = Math.round((ms / 1000) * fs);
    const g = 0.7;
    const out = new Float32Array(y.length);
    for (let i = 0; i < y.length; i++) {
      const xd = i >= d ? y[i - d]! : 0;
      const yd = i >= d ? out[i - d]! : 0;
      out[i] = -g * y[i]! + xd + g * yd;
    }
    y = out;
  }
  return y;
}

/** The tempo at a time of the track. */
export function tempoAt(spec: TrackSpec, t: number): number {
  const c = spec.change;
  if (!c || t < c.at) return spec.bpm;
  if (c.over <= 0 || t >= c.at + c.over) return c.bpm;
  return spec.bpm + ((t - c.at) / c.over) * (c.bpm - spec.bpm);
}

export function render(spec: TrackSpec): Float32Array {
  const fs = spec.fs ?? 48000;
  const r = rng(spec.seed ?? 1);
  const n = Math.round(spec.seconds * fs);
  const music = new Float32Array(n);
  const step = 60 / spec.bpm / 4;
  const offset = spec.offset ?? r() * 2;
  // four takes of every drum, so no two hits in a row are the same samples
  const takes = <T>(make: () => T): T[] => [make(), make(), make(), make()];
  const k = takes(() => kick(fs, r)), s = takes(() => snare(fs, r));
  const h = takes(() => hat(fs, r, 0.025, 0.08, 0.35)), oh = takes(() => hat(fs, r, 0.15, 0.3, 0.25));
  const bassNotes = [55, 55, 65.4, 49].map((f) => bass(fs, step * 1.5, f));
  // the time of every 16th, the tempo integrated step by step
  const grid: number[] = [];
  for (let t = -offset; t < spec.seconds + step; t += 60 / tempoAt(spec, Math.max(0, t)) / 4) grid.push(t);
  const steps = grid.length;
  const drums = Math.pow(10, (spec.drumsDb ?? 0) / 20);
  const vel = (): number => drums * Math.pow(10, ((r() * 2 - 1) * (spec.velocityDb ?? 0)) / 20);
  const pick = <T>(xs: T[]): T => xs[Math.floor(r() * xs.length)]!;
  const arpNotes = [440, 523.3, 659.3, 784, 880, 659.3];
  for (let i = 0; i < steps; i++) {
    const inBar = i % 16;
    const here = 60 / tempoAt(spec, Math.max(0, grid[i]!)) / 4;
    let t = grid[i]! + (inBar % 2 === 1 ? (spec.swing ?? 0) * here : 0);
    if (spec.jitterMs) t += (gauss(r) * spec.jitterMs) / 1000;
    if (t < 0 || t >= spec.seconds) continue;
    const at = Math.round(t * fs);
    if (spec.dottedArpDb !== undefined && i % 3 === 0) {
      const g = Math.pow(10, spec.dottedArpDb / 20);
      const note = pluck(fs, arpNotes[(i / 3) % arpNotes.length]!, 0.25);
      // the echo of a dotted-8th delay, three repeats
      for (let e = 0; e < 4; e++) addAt(music, note, at + Math.round(e * 3 * step * fs), g * Math.pow(0.45, e));
    }
    if (spec.stabsDb !== undefined && [3, 6, 11, 14].includes(inBar)) {
      addAt(music, stab(fs, step * 1.2), at, Math.pow(10, spec.stabsDb / 20));
    }
    if (spec.breakdown && t >= spec.breakdown[0] && t < spec.breakdown[1]) continue;
    const p = spec.pattern;
    if (p.kick?.includes(inBar)) addAt(music, pick(k), at, vel());
    if (p.snare?.includes(inBar)) addAt(music, pick(s), at, vel());
    if (p.hat?.includes(inBar)) addAt(music, pick(h), at, (p.hat.length > 8 ? 0.6 : 1) * vel());
    if (p.openHat?.includes(inBar)) addAt(music, pick(oh), at, vel());
    if (p.bass?.includes(inBar)) addAt(music, bassNotes[Math.floor(i / 16) % 4]!, at);
  }
  if (spec.babble) {
    const count = Math.round(spec.babble * spec.seconds);
    for (let c = 0; c < count; c++) {
      const burst = r() < 0.5 ? snare(fs, r) : shout(fs, r);
      addAt(music, burst, Math.floor(r() * n), 0.3 + 0.7 * r());
    }
  }
  if (spec.pad) {
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      const lfo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.1 * t);
      music[i]! += 0.06 * lfo * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t));
    }
  }
  let peak = 1e-9, sq = 0;
  for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(music[i]!)); sq += music[i]! * music[i]!; }
  for (let i = 0; i < n; i++) music[i]! *= 0.5 / peak;
  const rms = (Math.sqrt(sq / n) * 0.5) / peak;
  let out: Float32Array = music;
  if (spec.reverb) {
    const wet = schroeder(music, fs, spec.reverbTime ?? 0.8);
    out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = music[i]! + spec.reverb * wet[i]!;
  }
  if (spec.noise) {
    for (let i = 0; i < n; i++) out[i]! += spec.noise * rms * gauss(r);
  }
  if (spec.phoneMic) {
    out = phone(out, fs);
    for (let i = 0; i < n; i++) out[i]! += 0.003 * gauss(r);
  }
  if (spec.gain) {
    const g = spec.gain;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      let db = g[0]![1];
      for (let j = 0; j < g.length; j++) {
        const [t0, d0] = g[j]!;
        const next = g[j + 1];
        if (t >= t0) db = next && t < next[0] ? d0 + ((t - t0) / (next[0] - t0)) * (next[1] - d0) : d0;
      }
      out[i]! *= Math.pow(10, db / 20);
    }
  }
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i]!));
  return out;
}

/** 16-bit mono PCM WAV bytes. */
export function wav(samples: Float32Array, fs: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, fs, true); v.setUint32(28, fs * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), true);
  return bytes;
}
