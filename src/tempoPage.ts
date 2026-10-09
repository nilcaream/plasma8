/**
 * The /tempo/ page: arms the microphone (src/micTempo.ts), analyses every quarter second of audio, and draws what the
 * detector sees: the onset envelope with its peaks and fitted beat grid, the comb over the candidates, the periodicity
 * over a wide range, and the detection and the beat clock's tempo over time.
 */

import { DEFAULT_SHAPE, flash, type Amounts } from './beatVoices';
import { FlashLimiter } from './flashLimit';
import { EVERY, MicTempo } from './micTempo';
import { colors, dot, el, frame, setup, type Tick } from './pageGraphs';
import { historyAxis } from './tempoHistory';
import {
  COMB_POINTS, MAX_BPM, MIN_BPM, SEARCH_HI, SEARCH_LO, WIDE_HI, WIDE_LO, combBpm, wideBpm,
  type Analysis,
} from './tempoDetect';

/** The reading counts as settled when it moved less than this over SETTLE_SECONDS. */
const SETTLE_BPM = 0.05;
const SETTLE_SECONDS = 4;
/** The reading over time shows the last this many seconds. */
const HISTORY_VIEW = 15;
/** The beat strobe: the main page's flash at strobe 1, the kick voice alone, so one flash on every beat. */
const STROBE = 1;
const STROBE_AMOUNTS: Amounts = { kick: 1, snare: 0, crash: 0 };
const ONSET_VIEW = 8;

/** One analysis: the detection (what Listen shows) and the tempo the beat clock runs at, null until it has one. */
interface Point { t: number; detection: number | null; beat: number | null }

const mic = new MicTempo();
let last: Analysis | null = null;
let history: Point[] = [];
let drawQueued = false;
let limiter = new FlashLimiter();
const strobeLight = el('strobeLight');

const armButton = el<HTMLButtonElement>('arm');
const facts = el('facts');

mic.onAnalysis = (a) => {
  if (a) {
    last = a;
    history.push({ t: a.time, detection: a.readings.grid, beat: mic.clock.beat === null ? null : mic.clock.bpm });
    while (history.length && history[0]!.t < a.time - HISTORY_VIEW - EVERY) history.shift();
  }
  update();
};

armButton.addEventListener('click', () => { if (mic.listening) disarm(); else void arm(); });
el<HTMLButtonElement>('reset').addEventListener('click', () => {
  mic.reset();
  limiter = new FlashLimiter();
  last = null;
  history = [];
  update();
});

async function arm(): Promise<void> {
  if (mic.arming) return;
  // the context is made inside the click, so Safari lets it run
  const ctx = new AudioContext();
  const opening = mic.arm(ctx);
  update();
  if (await opening) {
    limiter = new FlashLimiter();
    last = null;
    history = [];
    requestAnimationFrame(strobe);
    facts.textContent = mic.facts;
  }
  update();
}

/** Releases the microphone; the graphs keep what they showed. Arming again starts from scratch. */
function disarm(): void {
  if (!mic.listening) return;
  mic.disarm();
  facts.textContent = mic.facts;
  update();
}

/** The strobe, once a frame while armed: the beat clock carried forward to the sound reaching the microphone now. */
function strobe(): void {
  if (!mic.listening) { strobeLight.style.opacity = '0'; return; }
  const now = performance.now();
  let f = 0;
  const b = mic.beatsAt(now);
  // a flash the limiter holds dark stays dark, as on the main page (src/flashLimit.ts)
  if (b && limiter.allow(b.beats, b.bpm, now)) f = flash(limiter.flashBeats, STROBE, STROBE_AMOUNTS, DEFAULT_SHAPE).total;
  strobeLight.style.opacity = f.toFixed(3);
  requestAnimationFrame(strobe);
}

/** The detection, and whether it has settled. */
function reading(): { bpm: number | null; settled: boolean } {
  const bpm = last?.readings.grid ?? null;
  if (bpm === null || !last) return { bpm, settled: false };
  const since = history.filter((p) => p.t >= last!.time - SETTLE_SECONDS);
  const vs = since.map((p) => p.detection).filter((v): v is number => v !== null);
  const settled = last.time >= SETTLE_SECONDS + 2.5 && vs.length > 0 && Math.max(...vs) - Math.min(...vs) < SETTLE_BPM;
  return { bpm, settled };
}

function update(): void {
  const { bpm, settled } = reading();
  const big = el('bpm');
  big.textContent = bpm === null ? '–––.––' : bpm.toFixed(2);
  big.className = bpm === null ? 'none' : last && !last.beat ? 'held' : '';
  const sd = last?.grid?.sd;
  el('plusminus').textContent = bpm !== null && sd !== undefined && last?.beat ? `± ${Math.max(0.01, sd).toFixed(2)} BPM (standard error of the fit)` : '';
  el('status').textContent = statusText(bpm, settled);
  const listening = mic.listening;
  armButton.setAttribute('aria-pressed', String(listening));
  armButton.textContent = listening ? 'Disarm' : mic.arming ? 'Arming…' : 'Arm';
  const conf = last?.confidence ?? 0;
  el('confidence').style.width = `${Math.round(conf * 100)}%`;
  el('confidenceText').textContent = last ? `${Math.round(conf * 100)}%` : '';
  const { level, clock } = mic;
  const db = Math.max(-60, Math.min(0, level));
  el('level').style.width = listening ? `${((db + 60) / 60) * 100}%` : '0';
  el('levelText').textContent = listening && Number.isFinite(level) ? `${level.toFixed(0)} dB` : '';
  (window as unknown as { __tempo: unknown }).__tempo = {
    armed: listening, error: mic.error, seconds: mic.det?.seconds ?? 0, bpm, settled, beat: last?.beat ?? false,
    readings: last?.readings ?? null, sd: last?.grid?.sd ?? null, confidence: conf,
    floor: mic.floor, inputLatency: mic.inputLatency, gridBeat: last?.grid?.beat ?? null, gridPeriod: last?.grid?.period ?? null, beatShare: last?.grid?.beatShare ?? null,
    clockBeat: clock.beat, clockPeriod: clock.period, clockChanges: clock.changes, clockAnchors: clock.anchors,
  };
  el('strobeText').textContent = clock.beat === null ? 'Waiting for a first reading.' : `Beat clock at ${clock.bpm.toFixed(2)} BPM.`;
  if (!drawQueued) {
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; draw(); });
  }
}

function statusText(bpm: number | null, settled: boolean): string {
  if (mic.error) return `The microphone could not be opened (${mic.error}).`;
  if (mic.arming) return 'Opening the microphone…';
  if (!mic.listening) return last ? 'Off. The graphs show the last listening; arming again starts from scratch.' : 'Off. Arm to open the microphone.';
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
  if (s.w < 600) for (const b of [MIN_BPM, 110, 130, MAX_BPM]) xTicks.push({ x: b, label: String(b), strong: b === MIN_BPM || b === MAX_BPM });
  else for (let b = MIN_BPM; b <= MAX_BPM; b += 5) xTicks.push({ x: b, label: String(b), strong: b === MIN_BPM || b === MAX_BPM });
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
  const r = a.readings.grid;
  if (r !== null) vline(s, X(r), Y(hi * 1.05), Y(lo), colors.play);
}

function drawWide(): void {
  const s = setup(el<HTMLCanvasElement>('wideCanvas'));
  const a = last;
  const L = Math.log2;
  let lo = 0, hi = 0.5;
  if (a) for (const v of a.wide) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const labels = s.w < 600 ? [55, 75, 95, 150, 220, 300] : [55, 65, 75, 95, 110, 130, 150, 180, 220, 260, 300];
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
  const r = a.readings.grid;
  if (r !== null) {
    vline(s, X(L(r)), Y(hi * 1.05), Y(lo), colors.play);
    s.ctx.setLineDash([4, 4]);
    for (const q of [0.5, 2]) if (r * q >= WIDE_LO && r * q <= WIDE_HI) vline(s, X(L(r * q)), Y(hi * 1.05), Y(lo), colors.play, 1);
    s.ctx.setLineDash([]);
  }
}

/** The detection (a thin line) over the beat clock's tempo (a wide soft band), the last HISTORY_VIEW seconds. */
function drawHistory(): void {
  const s = setup(el<HTMLCanvasElement>('historyCanvas'));
  const now = last?.time ?? 0;
  const axis = historyAxis(history.map((p) => p.detection), history.map((p) => p.beat));
  const xTicks: Tick[] = [];
  for (let x = -HISTORY_VIEW; x <= 0; x += 5) xTicks.push({ x, label: x === 0 ? 'now' : `${x} s` });
  const { X: Xago, Y } = frame(s, -HISTORY_VIEW, 0, axis?.lo ?? 0, axis?.hi ?? 1, xTicks, axis?.ticks ?? [], 0);
  if (!axis) return;
  // a reading's time against the newest one
  const X = (t: number): number => Xago(t - now);
  const { ctx } = s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(Xago(-HISTORY_VIEW), Y(axis.hi), Xago(0) - Xago(-HISTORY_VIEW), Y(axis.lo) - Y(axis.hi));
  ctx.clip();
  ctx.lineJoin = 'round';
  for (const [key, color, width, alpha] of [['beat', colors.play, 9, 0.35], ['detection', colors.total, 1.5, 1]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let pen = false;
    for (const p of history) {
      const v = p[key];
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
