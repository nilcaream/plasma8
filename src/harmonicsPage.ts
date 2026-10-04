/**
 * The /harmonics/ page: one free parameter's beat-locked layers, their
 * weights, the mix and the value over 4 bars, drawn from the same functions
 * the visuals use, with sliders, a cursor at the tapped or set tempo and a
 * fresh draw.
 */
import {
  DAMPING, LAYERS, PERIODS, drawHarmonic, harmonicRange, harmonicValue, layer, layerPoint, mix, weights,
  type HarmonicDraw,
} from './harmonics';
import {
  button, colors, controlGroup, dot, el, frame, plot, playhead, samples, setup, slider, tempoControls,
  type Map1, type Tick,
} from './pageGraphs';
import { BOUNDS, HARMONICS, LIVE } from './pageRanges';
import { PageTempo } from './pageTempo';
import { createRng, formatSeed, freshSeed } from './rng';

const WINDOW = 16; // beats on screen: 4 bars
const LAYER_KEYS = ['l0', 'l1', 'l2', 'l3'] as const;
const LAYER_NAMES = ['2 bars', '1 bar', '½ bar', '1 beat'];

/** The sliders show 2 decimals, so a draw is rounded to them and the graphs show what the sliders say. */
const round2 = (v: number): number => Math.round(v * 100) / 100;
function roundDraw(d: HarmonicDraw): HarmonicDraw {
  return { ...d, widthShare: round2(d.widthShare), offsetShare: round2(d.offsetShare), factors: d.factors.map(round2) };
}

let draw = roundDraw(drawHarmonic(createRng(freshSeed())));
/** L and H are an example algorithm's outer bounds (zoom 2-8 in the design talk); the damping is the code's. */
const EXAMPLE_BOUNDS = { L: 2, H: 8 };
const P = { I: 0.5, ...EXAMPLE_BOUNDS, damping: DAMPING };

/** The outer bounds; the sliders keep L below H. */
const bounds = (): [number, number] => [P.L, P.H];

// --- controls -------------------------------------------------------------

const controls = el('controls');
const tempo = new PageTempo(performance.now(), 120);

const live = controlGroup(controls, 'Live',
  `Set by the user, with the slider and taps: I ${LIVE.intensity.min}-${LIVE.intensity.max}, BPM ${LIVE.bpm.min}-${LIVE.bpm.max} (the tap clock's limits).`);
slider(live, { label: 'I', ...LIVE.intensity, step: 0.01, value: P.I, digits: 2 }, (v) => { P.I = v; });
const showTempo = tempoControls(live, el<HTMLButtonElement>('tap'), tempo);

const fmt = (r: { min: number; max: number }): string => `U(${r.min}, ${r.max})`;
const random = controlGroup(controls, 'Random per instance',
  `Drawn when an instance starts, and the sliders span exactly that: f_0 from ${fmt(HARMONICS.factors[0]!)}, f_1..f_3 from ${fmt(HARMONICS.factors[1]!)}, `
  + `the width share from ${fmt(HARMONICS.width)}, the offset from ${fmt(HARMONICS.offset)}, and the layer points.`);
const factorSliders = draw.factors.map((f, k) =>
  slider(random, { label: `f_${k}`, ...HARMONICS.factors[k]!, step: 0.01, value: f, digits: 2 }, (v) => { draw.factors[k] = v; }));
const setWidth = slider(random, { label: 'width', ...HARMONICS.width, step: 0.01, value: draw.widthShare, digits: 2 },
  (v) => { draw.widthShare = v; });
const setOffset = slider(random, { label: 'offset', ...HARMONICS.offset, step: 0.01, value: draw.offsetShare, digits: 2 },
  (v) => { draw.offsetShare = v; });
const seedLine = document.createElement('p');
seedLine.className = 'note';
random.appendChild(seedLine);
const showSeed = (): void => { seedLine.textContent = `layer points: seed ${formatSeed(draw.seed)}`; };
showSeed();
button(random, 'Draw again', 'redraw').addEventListener('click', () => {
  draw = roundDraw(drawHarmonic(createRng(freshSeed())));
  draw.factors.forEach((f, k) => factorSliders[k]!(f));
  setWidth(draw.widthShare);
  setOffset(draw.offsetShare);
  showSeed();
});

const fixed = controlGroup(controls, 'Fixed in code',
  `L and H are an algorithm's outer bounds for this parameter; L stays ${BOUNDS.gap} below H. In src/harmonics.ts: periods ${PERIODS.join(', ')} beats, `
  + `and the damping base (${DAMPING}): above 1 the slow layers lead at I = 0, below 1 the fast ones; it stops at ${HARMONICS.damping.min}, above 0, where its powers are defined.`);
const g = BOUNDS.gap;
const setL = slider(fixed, { label: 'L', min: BOUNDS.min, max: BOUNDS.max - g, step: 0.1, value: P.L, digits: 1 }, (v) => {
  P.L = v;
  if (P.H < v + g) { P.H = v + g; setH(P.H); }
});
const setH = slider(fixed, { label: 'H', min: BOUNDS.min + g, max: BOUNDS.max, step: 0.1, value: P.H, digits: 1 }, (v) => {
  P.H = v;
  if (P.L > v - g) { P.L = v - g; setL(P.L); }
});
const setBase = slider(fixed, { label: 'base', ...HARMONICS.damping, step: 0.1, value: P.damping, digits: 1 }, (v) => { P.damping = v; });
button(fixed, 'Reset to code values', 'reset-fixed').addEventListener('click', () => {
  Object.assign(P, EXAMPLE_BOUNDS, { damping: DAMPING });
  setL(P.L);
  setH(P.H);
  setBase(P.damping);
});

// --- lanes ----------------------------------------------------------------

const lanes = el('lanes');
const laneHeads: HTMLElement[] = [];
const laneCanvases: HTMLCanvasElement[] = [];
for (let k = 0; k < LAYERS; k++) {
  const lane = document.createElement('div');
  lane.className = 'lane';
  lane.innerHTML = `<div class="lane-head" style="--c: var(--l${k})"></div><canvas></canvas>`;
  lanes.appendChild(lane);
  laneHeads.push(lane.querySelector('.lane-head')!);
  laneCanvases.push(lane.querySelector('canvas')!);
}

// --- drawing --------------------------------------------------------------

/** Bar lines strong and numbered, beat lines light, for the window starting at x0. */
function windowTicks(x0: number): Tick[] {
  const ticks: Tick[] = [];
  for (let b = 0; b <= WINDOW; b++) {
    const bar = (x0 + b) / 4;
    ticks.push(b % 4 === 0 ? { x: x0 + b, label: 'bar ' + (bar + 1), strong: true } : { x: x0 + b, label: '' });
  }
  return ticks;
}

function drawLane(k: number, x0: number, pos: number, share: number): void {
  const s = setup(laneCanvases[k]!);
  const { X, Y } = frame(s, x0, x0 + WINDOW, -1.25, 1.25, windowTicks(x0), [-1, 0, 1], 0);
  const color = colors[LAYER_KEYS[k]!];
  plot(s.ctx, X, Y, x0, x0 + WINDOW, samples(s.w), (b) => layer(draw.seed, k, b), color, 1.25 + 2.5 * share);
  const T = PERIODS[k]!;
  for (let n = Math.ceil(x0 / T); n * T <= x0 + WINDOW; n++) {
    dot(s.ctx, X(n * T), Y(layerPoint(draw.seed, k, n)), color, 3.5);
  }
  playhead(s, X, pos);
}

function drawWeights(w: number[], total: number): void {
  const s = setup(el<HTMLCanvasElement>('weightsCanvas'));
  const { X, Y } = frame(s, 0, LAYERS, 0, 1.15, [], [0, 0.25, 0.5, 0.75, 1], 2);
  const { ctx } = s;
  const half = (X(1) - X(0)) * 0.3;
  for (let k = 0; k < LAYERS; k++) {
    const cx = X(k + 0.5);
    const wk = w[k] ?? 0;
    const f = draw.factors[k] ?? 0;
    ctx.fillStyle = colors[LAYER_KEYS[k]!];
    ctx.fillRect(cx - half, Y(wk), 2 * half, Y(0) - Y(wk));
    ctx.strokeStyle = colors.muted;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - half - 0.5, Y(f) + 0.5, 2 * half + 1, Y(0) - Y(f));
    ctx.setLineDash([]);
    ctx.fillStyle = colors.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${wk.toFixed(3)} · ${total > 0 ? Math.round((100 * wk) / total) : 0}%`, cx, Math.min(Y(wk), Y(f)) - 3);
    ctx.fillStyle = colors.muted;
    ctx.textBaseline = 'top';
    const T = PERIODS[k]!;
    ctx.fillText(`k=${k}, every ${T} beat${T > 1 ? 's' : ''}`, cx, Y(0) + 6);
  }
}

function drawCurve(id: string, x0: number, pos: number, y0: number, y1: number, yTicks: number[], digits: number, f: Map1, band?: [number, number]): void {
  const s = setup(el<HTMLCanvasElement>(id));
  const { X, Y } = frame(s, x0, x0 + WINDOW, y0, y1, windowTicks(x0), yTicks, digits);
  if (band) {
    s.ctx.fillStyle = colors.band;
    s.ctx.fillRect(X(x0), Y(band[1]), X(x0 + WINDOW) - X(x0), Y(band[0]) - Y(band[1]));
    const mid = (band[0] + band[1]) / 2;
    plot(s.ctx, X, Y, x0, x0 + WINDOW, 1, () => mid, colors.muted, 1, [4, 3]);
  }
  plot(s.ctx, X, Y, x0, x0 + WINDOW, samples(s.w), f, colors.total, 3);
  playhead(s, X, pos);
  dot(s.ctx, X(pos), Y(f(pos)), colors.play);
}

// --- formulas -------------------------------------------------------------

const f2 = (v: number): string => v.toFixed(2);
const f3 = (v: number): string => v.toFixed(3);

function writeFormulas(pos: number, w: number[], total: number): void {
  const [L, H] = bounds();
  const { min, max } = harmonicRange(draw, L, H);
  const s = PERIODS.map((_, k) => layer(draw.seed, k, pos));
  const u = mix(draw.seed, draw.factors, P.I, pos, P.damping);
  const base = f2(P.damping);
  const lines = [
    'T_k = 8, 4, 2, 1 beats (2 bars, 1 bar, ½ bar, 1 beat);  t in beats',
    's_k(t) = Catmull-Rom through a random point P_k(n) ∈ [−1, 1) at each t = n·T_k:',
    '         it passes through each point on its line, with no jump in velocity',
    '',
    `w_k = f_k·${base}^(−k·(1 − I)),  I = ${f2(P.I)}`,
    ...w.map((wk, k) => `  w_${k} = ${f2(draw.factors[k] ?? 0)}·${base}^(−${k}·${f2(1 - P.I)}) = ${f3(wk)}   ${total > 0 ? Math.round((100 * wk) / total) : 0}% of Σw = ${f3(total)}`),
    '',
    `u = Σ w_k s_k / Σ w_k   now: s = [${s.map(f3).join(', ')}]  →  u = ${f3(u)}`,
    '',
    `draw (seed ${formatSeed(draw.seed)}): width share U(0.25, 0.6) = ${f2(draw.widthShare)}, offset U(0, 1) = ${f2(draw.offsetShare)};  f_0 ∈ U(0.5, 1), f_1..f_3 ∈ U(0, 1)`,
    `width = (H − L)·${f2(draw.widthShare)} = (${f2(H)} − ${f2(L)})·${f2(draw.widthShare)} = ${f3(max - min)}`,
    `min = L + ${f2(draw.offsetShare)}·((H − L) − width) = ${f2(L)} + ${f2(draw.offsetShare)}·(${f2(H - L)} − ${f3(max - min)}) = ${f3(min)};  max = min + width = ${f3(max)}`,
    `value = mid + half·u = ${f3((min + max) / 2)} + ${f3((max - min) / 2)}·u, clamped to [${f3(min)}, ${f3(max)}]   now: ${f3(harmonicValue(draw, L, H, P.I, pos, P.damping))}`,
  ];
  el('formulas').textContent = lines.join('\n');
}

// --- real time ------------------------------------------------------------

const beatDots = el('beatDots').querySelectorAll('i');
const nowTempo = el('nowTempo');
let lastFormulas = -Infinity;
el('restart').addEventListener('click', () => tempo.restart(performance.now()));

function frameLoop(now: number): void {
  const pos = tempo.beats(now);
  showTempo(now);
  nowTempo.textContent = tempo.tempo(now).label;
  const x0 = Math.floor(pos / WINDOW) * WINDOW;
  const [L, H] = bounds();
  const { min, max } = harmonicRange(draw, L, H);
  const w = weights(draw.factors, P.I, P.damping);
  const total = w.reduce((a, b) => a + b, 0);
  const value = (b: number): number => harmonicValue(draw, L, H, P.I, b, P.damping);

  for (let k = 0; k < LAYERS; k++) {
    const share = total > 0 ? (w[k] ?? 0) / total : 0;
    laneHeads[k]!.innerHTML = `<b>k=${k} · ${LAYER_NAMES[k]} · T = ${PERIODS[k]} beat${PERIODS[k] === 1 ? '' : 's'}</b><span>f = ${f2(draw.factors[k] ?? 0)}</span><span>w = ${f3(w[k] ?? 0)} (${Math.round(share * 100)}%)</span><span>s now ${f3(layer(draw.seed, k, pos))}</span>`;
    drawLane(k, x0, pos, share);
  }
  drawWeights(w, total);
  drawCurve('mixCanvas', x0, pos, -1.25, 1.25, [-1, -0.5, 0, 0.5, 1], 1, (b) => mix(draw.seed, draw.factors, P.I, b, P.damping));
  const pad = (H - L) * 0.05 || 0.5;
  const step = (H - L) / 4 || 1;
  drawCurve('valueCanvas', x0, pos, L - pad, H + pad, [0, 1, 2, 3, 4].map((i) => L + i * step), 1, value, [min, max]);

  const v = value(pos);
  const span = H - L || 1;
  const band = el('gaugeBand');
  band.style.left = `${(100 * (min - L)) / span}%`;
  band.style.width = `${(100 * (max - min)) / span}%`;
  el('gaugeMark').style.left = `${(100 * (v - L)) / span}%`;
  el('gaugeL').textContent = `L ${f2(L)}`;
  el('gaugeH').textContent = `H ${f2(H)}`;
  beatDots.forEach((d, i) => d.classList.toggle('on', i === Math.floor(pos % 4)));
  el('nowBar').textContent = String(Math.floor(pos / 4) + 1);
  el('nowU').textContent = f3(mix(draw.seed, draw.factors, P.I, pos, P.damping));
  el('nowValue').textContent = f3(v);
  if (now - lastFormulas > 100) { writeFormulas(pos, w, total); lastFormulas = now; }
  requestAnimationFrame(frameLoop);
}

requestAnimationFrame(frameLoop);
