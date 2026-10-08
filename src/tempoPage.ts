/**
 * The /tempo/ page: arms the microphone (no echo cancellation, noise
 * suppression or gain control), feeds it to the tempo detector through an
 * AudioWorklet, analyses every quarter second of audio, and draws what the
 * detector sees: the onset envelope with its peaks and fitted beat grid, the
 * comb over the candidates, the periodicity over a wide range, and every
 * method's reading over time.
 */

import { colors, dot, el, frame, setup, type Tick } from './pageGraphs';
import {
  COMB_POINTS, MAX_BPM, METHODS, MIN_BPM, SEARCH_HI, SEARCH_LO, TempoDetector, WIDE_HI, WIDE_LO, combBpm, wideBpm,
  type Analysis, type Method,
} from './tempoDetect';

/** Seconds of audio between analyses. */
const EVERY = 0.25;
/** The reading counts as settled when it moved less than this over SETTLE_SECONDS. */
const SETTLE_BPM = 0.05;
const SETTLE_SECONDS = 4;
const ONSET_VIEW = 8;
/** The input level meter falls this many dB a second. */
const LEVEL_FALL = 20;

// The worklet only gathers the microphone's samples into blocks and posts them.
const WORKLET = `
class TempoTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const chans = inputs[0];
    if (chans && chans.length) {
      const len = chans[0].length, k = chans.length;
      for (let i = 0; i < len; i++) {
        let v = 0;
        for (let c = 0; c < k; c++) v += chans[c][i];
        this.buf[this.n++] = v / k;
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(2048);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('tempo-tap', TempoTap);
`;

interface Mic { ctx: AudioContext; stream: MediaStream; node: AudioWorkletNode }
interface Point { t: number; readings: Record<Method, number | null>; beat: boolean }

let mic: Mic | null = null;
let arming = false;
let det: TempoDetector | null = null;
let last: Analysis | null = null;
let history: Point[] = [];
let nextAt = EVERY;
let level = -Infinity;
let method: Method = 'grid';
let drawQueued = false;
let error = '';

const armButton = el<HTMLButtonElement>('arm');
const facts = el('facts');

armButton.addEventListener('click', () => { if (mic) disarm(); else void arm(); });
el<HTMLButtonElement>('reset').addEventListener('click', () => {
  det?.reset();
  last = null;
  history = [];
  nextAt = EVERY;
  update();
});
for (const input of el('methods').querySelectorAll<HTMLInputElement>('input[name=method]')) {
  input.addEventListener('change', () => { if (input.checked) { method = input.value as Method; update(); } });
}

async function arm(): Promise<void> {
  if (arming) return;
  arming = true;
  error = '';
  // made inside the click, so Safari lets it run
  const ctx = new AudioContext();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'tempo-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    // silent, but connected, so every browser keeps pulling the worklet
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(ctx.destination);
    det = new TempoDetector(ctx.sampleRate);
    last = null;
    history = [];
    nextAt = EVERY;
    node.port.onmessage = (e: MessageEvent<Float32Array>) => hear(e.data);
    mic = { ctx, stream, node };
    const track = stream.getAudioTracks()[0];
    const s = track?.getSettings() ?? {};
    const onOff = (v: unknown): string => (v === undefined ? 'not reported' : v ? 'on' : 'off');
    facts.textContent = `${track?.label || 'microphone'}\nsample rate ${ctx.sampleRate} Hz\n`
      + `echo cancellation ${onOff(s.echoCancellation)}, noise suppression ${onOff(s.noiseSuppression)}, auto gain ${onOff(s.autoGainControl)}`;
  } catch (e) {
    void ctx.close();
    error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  } finally {
    arming = false;
    update();
  }
}

/** Releases the microphone; the graphs keep what they showed. Arming again starts from scratch. */
function disarm(): void {
  if (!mic) return;
  mic.node.port.onmessage = null;
  for (const t of mic.stream.getTracks()) t.stop();
  void mic.ctx.close();
  mic = null;
  level = -Infinity;
  facts.textContent = 'Not open.';
  update();
}

function hear(block: Float32Array): void {
  if (!det) return;
  let sq = 0;
  for (let i = 0; i < block.length; i++) sq += block[i]! * block[i]!;
  // a peak meter: it jumps up to a loud block and falls LEVEL_FALL dB a second, so the gaps between hits do not empty it
  const db = 10 * Math.log10(sq / block.length + 1e-12);
  level = Math.max(db, level - (LEVEL_FALL * block.length) / det.env.fs);
  det.push(block);
  if (det.seconds >= nextAt) {
    nextAt = det.seconds + EVERY;
    const a = det.analyse();
    if (a) {
      last = a;
      history.push({ t: a.time, readings: { ...a.readings }, beat: a.beat });
    }
    update();
  }
}

/** The reading of the chosen method, and whether it has settled. */
function reading(): { bpm: number | null; settled: boolean } {
  const bpm = last?.readings[method] ?? null;
  if (bpm === null || !last) return { bpm, settled: false };
  const since = history.filter((p) => p.t >= last!.time - SETTLE_SECONDS);
  const vs = since.map((p) => p.readings[method]).filter((v): v is number => v !== null);
  const settled = last.time >= SETTLE_SECONDS + 2.5 && vs.length > 0 && Math.max(...vs) - Math.min(...vs) < SETTLE_BPM;
  return { bpm, settled };
}

function update(): void {
  const { bpm, settled } = reading();
  const big = el('bpm');
  big.textContent = bpm === null ? '–––.––' : bpm.toFixed(2);
  big.className = bpm === null ? 'none' : last && !last.beat ? 'held' : '';
  const sd = method === 'grid' ? last?.grid?.sd : undefined;
  el('plusminus').textContent = bpm !== null && sd !== undefined && last?.beat ? `± ${Math.max(0.01, sd).toFixed(2)} BPM (standard error of the fit)` : '';
  el('status').textContent = statusText(bpm, settled);
  armButton.setAttribute('aria-pressed', String(!!mic));
  armButton.textContent = mic ? 'Disarm' : arming ? 'Arming…' : 'Arm';
  const conf = last?.confidence ?? 0;
  el('confidence').style.width = `${Math.round(conf * 100)}%`;
  el('confidenceText').textContent = last ? `${Math.round(conf * 100)}%` : '';
  const db = Math.max(-60, Math.min(0, level));
  el('level').style.width = mic ? `${((db + 60) / 60) * 100}%` : '0';
  el('levelText').textContent = mic && Number.isFinite(level) ? `${level.toFixed(0)} dB` : '';
  (window as unknown as { __tempo: unknown }).__tempo = {
    armed: !!mic, error, seconds: det?.seconds ?? 0, method, bpm, settled, beat: last?.beat ?? false,
    readings: last?.readings ?? null, sd: last?.grid?.sd ?? null, confidence: conf,
  };
  if (!drawQueued) {
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }
}

function statusText(bpm: number | null, settled: boolean): string {
  if (error) return `The microphone could not be opened (${error}).`;
  if (arming) return 'Opening the microphone…';
  if (!mic) return last ? 'Off. The graphs show the last listening; arming again starts from scratch.' : 'Off. Arm to open the microphone.';
  if (!last) return `Listening… the first reading comes after about 2.5 s of sound.`;
  if (!last.beat) return bpm === null ? 'Listening… no beat heard yet.' : 'No beat in the last 6 s: holding the last reading.';
  return settled ? `Settled: the reading moved less than ${SETTLE_BPM} BPM over the last ${SETTLE_SECONDS} s.` : 'Settling…';
}

// --- graphs ---------------------------------------------------------------

function draw(): void {
  drawOnsets();
  drawComb();
  drawWide();
  drawHistory();
}

function drawOnsets(): void {
  const s = setup(el<HTMLCanvasElement>('onsetCanvas'));
  const a = last;
  const xTicks: Tick[] = [];
  for (let x = -ONSET_VIEW; x <= 0; x++) xTicks.push({ x, label: x === 0 ? 'now' : `${x} s` });
  let top = 1;
  const from = a ? Math.max(0, Math.floor((a.time - ONSET_VIEW - a.odfStart) * a.rate)) : 0;
  if (a) for (let i = from; i < a.odf.length; i++) top = Math.max(top, a.odf[i]!);
  top *= 1.1;
  const { X, Y } = frame(s, -ONSET_VIEW, 0, 0, top, xTicks, [0, top / 2, top], 1);
  if (!a) return;
  const { ctx } = s;
  const rel = (t: number): number => t - a.time;
  if (a.grid) {
    // the fitted half-beat grid; the half with more strength on it is drawn as the beat
    const g = a.grid;
    const half = g.period / 2;
    let even = 0, odd = 0;
    for (const p of a.peaks) {
      if (!p.onGrid) continue;
      if (Math.round((p.t - g.phase) / half) % 2 === 0) even += p.strength; else odd += p.strength;
    }
    const first = Math.ceil((a.time - ONSET_VIEW - g.phase) / half);
    for (let m = first; g.phase + m * half <= a.time; m++) {
      const beat = (Math.abs(m) % 2 === 0) === even >= odd;
      ctx.strokeStyle = colors.beat;
      ctx.lineWidth = beat ? 2 : 1;
      ctx.setLineDash(beat ? [] : [3, 4]);
      const x = X(rel(g.phase + m * half + (Math.abs(m) % 2) * g.offOdd));
      ctx.beginPath(); ctx.moveTo(x, Y(top)); ctx.lineTo(x, Y(0)); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = colors.total;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (let i = from; i < a.odf.length; i++) {
    const x = X(rel(a.odfStart + i / a.rate)), y = Y(a.odf[i]!);
    if (i === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (const p of a.peaks) {
    if (p.t < a.time - ONSET_VIEW) continue;
    const i = Math.round((p.t - a.odfStart) * a.rate);
    dot(ctx, X(rel(p.t)), Y(a.odf[Math.min(a.odf.length - 1, Math.max(0, i))]!), p.onGrid ? colors.kick : colors.muted, 3.5);
  }
}

function vline(s: ReturnType<typeof setup>, x: number, y0: number, y1: number, color: string, width = 2): void {
  s.ctx.strokeStyle = color;
  s.ctx.lineWidth = width;
  s.ctx.beginPath(); s.ctx.moveTo(x, y0); s.ctx.lineTo(x, y1); s.ctx.stroke();
}

function shadeOutside(s: ReturnType<typeof setup>, X: (v: number) => number, Y: (v: number) => number, lo: number, hi: number, y0: number, y1: number, x0: number, x1: number): void {
  s.ctx.fillStyle = colors.grid;
  s.ctx.globalAlpha = 0.5;
  if (lo > x0) s.ctx.fillRect(X(x0), Y(y1), X(lo) - X(x0), Y(y0) - Y(y1));
  if (hi < x1) s.ctx.fillRect(X(hi), Y(y1), X(x1) - X(hi), Y(y0) - Y(y1));
  s.ctx.globalAlpha = 1;
}

function drawComb(): void {
  const s = setup(el<HTMLCanvasElement>('combCanvas'));
  const a = last;
  let lo = 0, hi = 0.5;
  if (a) for (const v of a.combScore) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const xTicks: Tick[] = [];
  for (let b = 110; b <= 150; b += s.w < 600 ? 10 : 5) xTicks.push({ x: b, label: String(b), strong: b === MIN_BPM || b === MAX_BPM });
  const { X, Y } = frame(s, SEARCH_LO, SEARCH_HI, lo, hi * 1.05, xTicks, [lo, 0, hi].filter((v, i, xs) => xs.indexOf(v) === i), 2);
  shadeOutside(s, X, Y, MIN_BPM, MAX_BPM, lo, hi * 1.05, SEARCH_LO, SEARCH_HI);
  if (!a) return;
  s.ctx.strokeStyle = colors.snare;
  s.ctx.lineWidth = 2;
  s.ctx.beginPath();
  for (let c = 0; c < COMB_POINTS; c++) {
    if (c === 0) s.ctx.moveTo(X(combBpm(c)), Y(a.combScore[c]!)); else s.ctx.lineTo(X(combBpm(c)), Y(a.combScore[c]!));
  }
  s.ctx.stroke();
  const r = a.readings[method];
  if (r !== null) vline(s, X(r), Y(hi * 1.05), Y(lo), colors.play);
}

function drawWide(): void {
  const s = setup(el<HTMLCanvasElement>('wideCanvas'));
  const a = last;
  const L = Math.log2;
  let lo = 0, hi = 0.5;
  if (a) for (const v of a.wide) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const labels = s.w < 600 ? [55, 75, 110, 150, 220, 300] : [55, 65, 75, 90, 110, 130, 150, 180, 220, 260, 300];
  const xTicks: Tick[] = labels.map((b) => ({ x: L(b), label: String(b), strong: b === MIN_BPM || b === MAX_BPM }));
  const { X, Y } = frame(s, L(WIDE_LO), L(WIDE_HI), lo, hi * 1.05, xTicks, [lo, 0, hi].filter((v, i, xs) => xs.indexOf(v) === i), 2);
  shadeOutside(s, X, Y, L(MIN_BPM), L(MAX_BPM), lo, hi * 1.05, L(WIDE_LO), L(WIDE_HI));
  if (!a) return;
  s.ctx.strokeStyle = colors.light;
  s.ctx.lineWidth = 2;
  s.ctx.beginPath();
  for (let i = 0; i < a.wide.length; i++) {
    const x = X(L(wideBpm(i))), y = Y(a.wide[i]!);
    if (i === 0) s.ctx.moveTo(x, y); else s.ctx.lineTo(x, y);
  }
  s.ctx.stroke();
  const r = a.readings[method];
  if (r !== null) {
    vline(s, X(L(r)), Y(hi * 1.05), Y(lo), colors.play);
    s.ctx.setLineDash([4, 4]);
    for (const q of [0.5, 2]) if (r * q >= WIDE_LO && r * q <= WIDE_HI) vline(s, X(L(r * q)), Y(hi * 1.05), Y(lo), colors.play, 1);
    s.ctx.setLineDash([]);
  }
}

const METHOD_COLOR: Record<Method, () => string> = { grid: () => colors.kick, comb: () => colors.snare, ioi: () => colors.crash };

function drawHistory(): void {
  const s = setup(el<HTMLCanvasElement>('historyCanvas'));
  const end = Math.max(30, last?.time ?? 0);
  const { bpm } = reading();
  const mid = bpm ?? 130;
  const half = bpm === null ? 20 : 2;
  const y0 = Math.max(SEARCH_LO, mid - half), y1 = Math.min(SEARCH_HI, mid + half);
  const xTicks: Tick[] = [];
  const stepX = end > 120 ? 30 : end > 60 ? 10 : 5;
  for (let x = 0; x <= end; x += stepX) xTicks.push({ x, label: `${x} s` });
  const span = y1 - y0;
  const yStep = span > 10 ? 10 : span > 2 ? 1 : 0.5;
  const yTicks: number[] = [];
  for (let y = Math.ceil(y0 / yStep) * yStep; y <= y1 + 1e-9; y += yStep) yTicks.push(y);
  const { X, Y } = frame(s, 0, end, y0, y1, xTicks, yTicks, yStep < 1 ? 1 : 0);
  const { ctx } = s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(0), Y(y1), X(end) - X(0), Y(y0) - Y(y1));
  ctx.clip();
  // the order puts the chosen method on top
  for (const m of [...METHODS.filter((m) => m !== method), method]) {
    ctx.strokeStyle = METHOD_COLOR[m]();
    ctx.lineWidth = m === method ? 2.5 : 1.25;
    ctx.globalAlpha = m === method ? 1 : 0.7;
    ctx.beginPath();
    let pen = false;
    for (const p of history) {
      const v = p.readings[m];
      if (v === null) { pen = false; continue; }
      if (pen) ctx.lineTo(X(p.t), Y(v)); else ctx.moveTo(X(p.t), Y(v));
      pen = true;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => draw());
addEventListener('resize', () => draw());
update();
