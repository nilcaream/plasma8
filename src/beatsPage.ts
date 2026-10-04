/**
 * The /beats/ page: graphs of the beat flash voices over one bar, drawn from
 * the same functions the visuals use, with sliders and a square that pulses
 * in time so the sharpness can be felt.
 */
import {
  DEFAULT_SHAPE, VOICES, VOICE_NAMES, fallPower, flash, light, rise, windowEnvelope,
  type Amounts, type Shape, type VoiceName,
} from './beatVoices';

interface Param {
  key: 'I' | 'kick' | 'snare' | 'crash' | 'G' | keyof Shape;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  digits: number;
  group?: boolean;
}

const PARAMS: Param[] = [
  { key: 'I', label: 'I', min: 0, max: 1, step: 0.01, value: 0.5, digits: 2 },
  { key: 'kick', label: 'A_kick', min: 0, max: 1, step: 0.01, value: 0.3, digits: 2, group: true },
  { key: 'snare', label: 'A_snare', min: 0, max: 1, step: 0.01, value: 0.1, digits: 2 },
  { key: 'crash', label: 'A_crash', min: 0, max: 1, step: 0.01, value: 0.8, digits: 2 },
  { key: 'G', label: 'G', min: 0, max: 2, step: 0.01, value: 1, digits: 2, group: true },
  { key: 'a0', label: 'a0', min: 0, max: 1, step: 0.005, value: DEFAULT_SHAPE.a0, digits: 3, group: true },
  { key: 'a1', label: 'a1', min: 0, max: 1, step: 0.005, value: DEFAULT_SHAPE.a1, digits: 3 },
  { key: 'p0', label: 'p0', min: 0, max: 8, step: 0.1, value: DEFAULT_SHAPE.p0, digits: 1, group: true },
  { key: 'p1', label: 'p1', min: 0, max: 8, step: 0.1, value: DEFAULT_SHAPE.p1, digits: 1 },
];

const P = Object.fromEntries(PARAMS.map((p) => [p.key, p.value])) as Record<Param['key'], number>;
const shape = (): Shape => ({ a0: P.a0, a1: P.a1, p0: P.p0, p1: P.p1 });
const amounts = (): Amounts => ({ kick: P.kick, snare: P.snare, crash: P.crash });

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} is missing`);
  return e as T;
}

function at(beats: number) {
  const f = flash(beats, P.I, amounts(), shape());
  return { ...f, light: light(f.total, P.G) };
}

// --- controls -------------------------------------------------------------

const controls = el('controls');
for (const prm of PARAMS) {
  const row = document.createElement('div');
  row.className = 'ctl' + (prm.group ? ' group' : '');
  const id = 'in-' + prm.key;
  row.innerHTML = `<label for="${id}">${prm.label}</label>
    <input id="${id}" type="range" min="${prm.min}" max="${prm.max}" step="${prm.step}" value="${prm.value}">
    <output for="${id}">${prm.value.toFixed(prm.digits)}</output>`;
  const input = row.querySelector('input')!;
  const out = row.querySelector('output')!;
  input.addEventListener('input', () => {
    P[prm.key] = Number(input.value);
    out.textContent = P[prm.key].toFixed(prm.digits);
    writeFormulas();
  });
  controls.appendChild(row);
}

// --- drawing --------------------------------------------------------------

const COLOR_KEYS = ['fg', 'muted', 'grid', 'beat', 'kick', 'snare', 'crash', 'total', 'light', 'play', 'panel'] as const;
const colors = {} as Record<(typeof COLOR_KEYS)[number], string>;
function readColors(): void {
  const cs = getComputedStyle(document.documentElement);
  for (const k of COLOR_KEYS) colors[k] = cs.getPropertyValue('--' + k).trim();
}
readColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

interface Surface { ctx: CanvasRenderingContext2D; w: number; h: number }

function setup(canvas: HTMLCanvasElement): Surface {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px system-ui, sans-serif';
  return { ctx, w, h };
}

const PAD = { l: 44, r: 24, t: 10, b: 26 };

interface Tick { x: number; label: string; strong?: boolean }
type Map1 = (v: number) => number;

/** A frame with x and y ticks; returns the mappings from data to pixels. */
function frame(s: Surface, x0: number, x1: number, y0: number, y1: number, xTicks: Tick[], yTicks: number[], yDigits: number) {
  const { ctx, w, h } = s;
  const X: Map1 = (x) => PAD.l + (x - x0) / (x1 - x0) * (w - PAD.l - PAD.r);
  const Y: Map1 = (y) => h - PAD.b - (y - y0) / (y1 - y0) * (h - PAD.t - PAD.b);
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const y of yTicks) {
    ctx.strokeStyle = colors.grid;
    ctx.beginPath(); ctx.moveTo(PAD.l, Y(y) + 0.5); ctx.lineTo(w - PAD.r, Y(y) + 0.5); ctx.stroke();
    ctx.fillText(y.toFixed(yDigits), PAD.l - 6, Y(y));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xTicks) {
    ctx.strokeStyle = t.strong ? colors.beat : colors.grid;
    ctx.lineWidth = t.strong ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(Math.round(X(t.x)) + 0.5, PAD.t); ctx.lineTo(Math.round(X(t.x)) + 0.5, h - PAD.b); ctx.stroke();
    ctx.fillText(t.label, X(t.x), h - PAD.b + 6);
  }
  ctx.lineWidth = 1;
  return { X, Y };
}

function plot(ctx: CanvasRenderingContext2D, X: Map1, Y: Map1, x0: number, x1: number, n: number, f: Map1, color: string, width: number, dash: number[] = []): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n;
    const y = f(x);
    if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = colors.panel;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
}

const BEAT_TICKS: Tick[] = [0, 1, 2, 3, 4].map((x): Tick => ({ x, label: x < 4 ? 'beat ' + (x + 1) : 'next 1', strong: true }))
  .concat([0.5, 1.5, 2.5, 3.5].map((x): Tick => ({ x, label: '' })));

/** Samples per curve: two per pixel, and every onset lands on a sample. */
const samples = (w: number): number => Math.max(512, Math.ceil(w / 256) * 512);

function playhead(s: Surface, X: Map1, pos: number): void {
  s.ctx.strokeStyle = colors.play;
  s.ctx.lineWidth = 2;
  s.ctx.beginPath(); s.ctx.moveTo(X(pos), PAD.t); s.ctx.lineTo(X(pos), s.h - PAD.b); s.ctx.stroke();
}

function onsetsInBar(name: VoiceName): number[] {
  const v = VOICES[name];
  const out: number[] = [];
  for (let b = v.onset; b <= 4; b += v.period) out.push(b);
  return out;
}

function drawBar(pos: number): void {
  const s = setup(el<HTMLCanvasElement>('barCanvas'));
  const { X, Y } = frame(s, 0, 4, 0, 1, BEAT_TICKS, [0, 0.25, 0.5, 0.75, 1], 2);
  const n = samples(s.w);
  for (const name of ['crash', 'snare', 'kick'] as const) {
    plot(s.ctx, X, Y, 0, 4, n, (x) => at(x).voices[name], colors[name], 1.5);
  }
  plot(s.ctx, X, Y, 0, 4, n, (x) => at(x).total, colors.total, 3);
  // the peak rule: each voice's peak sits on its onset beat line
  for (const name of VOICE_NAMES) {
    for (const b of onsetsInBar(name)) {
      const v = at(b).voices[name];
      if (v > 0) dot(s.ctx, X(b), Y(v), colors[name]);
    }
  }
  playhead(s, X, pos);
}

function drawLight(pos: number): void {
  const s = setup(el<HTMLCanvasElement>('lightCanvas'));
  const { X, Y } = frame(s, 0, 4, 1, 3, BEAT_TICKS, [1, 1.5, 2, 2.5, 3], 1);
  plot(s.ctx, X, Y, 0, 4, samples(s.w), (x) => at(x).light, colors.light, 2.5);
  playhead(s, X, pos);
}

function drawShape(): void {
  const s = setup(el<HTMLCanvasElement>('shapeCanvas'));
  const ticks: Tick[] = [];
  for (let i = -4; i <= 4; i++) ticks.push({ x: i / 4, label: i === 0 ? 'onset' : (i / 4).toFixed(2), strong: i === 0 });
  const { X, Y } = frame(s, -1, 1, 0, 1, ticks, [0, 0.25, 0.5, 0.75, 1], 2);
  const n = samples(s.w);
  const L = VOICES.kick.length;
  for (const I of [0, 1]) {
    const r = rise(I, shape()), p = fallPower(I, shape());
    plot(s.ctx, X, Y, -1, 1, n, (t) => windowEnvelope(t, L, r, p), colors.muted, 1, [4, 3]);
  }
  const r = rise(P.I, shape()), p = fallPower(P.I, shape());
  plot(s.ctx, X, Y, -1, 1, n, (t) => windowEnvelope(t, L, r, p), colors.total, 3);
  dot(s.ctx, X(0), Y(1), colors.total);
}

// --- formulas -------------------------------------------------------------

const f2 = (v: number): string => v.toFixed(2);
const f3 = (v: number): string => v.toFixed(3);

function writeFormulas(): void {
  const I = P.I, r = rise(I, shape()), p = fallPower(I, shape());
  let peak = 0;
  for (let i = 0; i < 4096; i++) peak = Math.max(peak, at(i / 1024).total);
  const lines = [
    'onsets; every voice has a window of L = 1 beat:',
    '  kick   every beat',
    '  snare  beats 2 and 4',
    '  crash  beat 1',
    '',
    'x0 is the value at intensity 0, x1 the value at intensity 1',
    `r = a0 + (a1 − a0)·I       = ${f3(P.a0)} + (${f3(P.a1)} − ${f3(P.a0)})·${f2(I)} = ${f3(r)} beats`,
    `p = p0 + (p1 − p0)·I       = ${P.p0.toFixed(1)} + (${P.p1.toFixed(1)} − ${P.p0.toFixed(1)})·${f2(I)} = ${f3(p)}`,
    '',
    't = beats from the onset (negative before it)',
    'e(t) = smoothstep(−r, 0, t)     for −r ≤ t < 0      rise, before the onset',
    '       (1 − t / (L − r))^p      for 0 ≤ t ≤ L − r   fall, from 1 on the onset',
    '       0                        otherwise',
    `     = smoothstep(−${f3(r)}, 0, t)  then  (1 − t / ${f3(1 - r)})^${f3(p)}`,
    'the peak, e = 1, is on the onset beat; a fall ends where the next onset\'s rise begins',
    '',
    'F = min(1, I·(A_kick·e_kick + A_snare·e_snare + A_crash·e_crash))',
    `  = min(1, ${f2(I)}·(${f2(P.kick)}·e_kick + ${f2(P.snare)}·e_snare + ${f2(P.crash)}·e_crash))`,
    `light = 1 + G·F = 1 + ${f2(P.G)}·F`,
    '',
    `peak in this bar: F = ${f3(peak)}, light = ${f3(light(peak, P.G))}`,
    'square: grey = min(1, 0.5·light), so light 1 is mid grey and light ≥ 2 is white',
  ];
  el('formulas').textContent = lines.join('\n');
}

// --- real time ------------------------------------------------------------

const bpmInput = el<HTMLInputElement>('bpm');
const square = el('square');
const beatDots = document.querySelectorAll('.beats i');
const nowF = el('nowF');
const nowLight = el('nowLight');
let t0 = performance.now(), bpm = 120, beatsAtT0 = 0;

const beatsNow = (now: number): number => beatsAtT0 + (now - t0) / 60000 * bpm;
bpmInput.addEventListener('input', () => {
  const v = Number(bpmInput.value);
  if (!(v >= 30 && v <= 300)) return;
  const now = performance.now();
  beatsAtT0 = beatsNow(now); t0 = now; bpm = v; // keep the phase when the tempo changes
});
el('restart').addEventListener('click', () => { t0 = performance.now(); beatsAtT0 = 0; });

function frameLoop(now: number): void {
  const pos = beatsNow(now) % 4;
  const v = at(pos);
  const g = Math.round(Math.min(1, 0.5 * v.light) * 255);
  square.style.background = `rgb(${g},${g},${g})`;
  beatDots.forEach((d, i) => d.classList.toggle('on', i === Math.floor(pos)));
  nowF.textContent = v.total.toFixed(3);
  nowLight.textContent = v.light.toFixed(3);
  drawBar(pos);
  drawLight(pos);
  drawShape();
  requestAnimationFrame(frameLoop);
}

writeFormulas();
requestAnimationFrame(frameLoop);
