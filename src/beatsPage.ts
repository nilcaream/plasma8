/**
 * The /beats/ page: graphs of the beat flash voices over one bar, drawn from
 * the same functions the visuals use, with sliders and a square that pulses
 * in time so the sharpness can be felt.
 */
import {
  DEFAULT_SHAPE, VOICES, VOICE_NAMES, fallPower, flash, light, rise, windowEnvelope,
  type Amounts, type Shape, type VoiceName,
} from './beatVoices';
import {
  button, colors, controlGroup, dot, el, frame, plot, playhead, samples, setup, slider, tempoControls, type Tick,
} from './pageGraphs';
import { PageTempo } from './pageTempo';

type Key = 'I' | 'kick' | 'snare' | 'crash' | 'G' | keyof Shape;
const P: Record<Key, number> = { I: 0.5, kick: 0.3, snare: 0.1, crash: 0.8, G: 1, ...DEFAULT_SHAPE };
const shape = (): Shape => ({ a0: P.a0, a1: P.a1, p0: P.p0, p1: P.p1 });
const amounts = (): Amounts => ({ kick: P.kick, snare: P.snare, crash: P.crash });

function at(beats: number) {
  const f = flash(beats, P.I, amounts(), shape());
  return { ...f, light: light(f.total, P.G) };
}

// --- controls -------------------------------------------------------------

const controls = el('controls');
const tempo = new PageTempo(performance.now(), 120);
const set = (key: Key) => (v: number): void => { P[key] = v; writeFormulas(); };

const live = controlGroup(controls, 'Live', 'Set by the user, with the slider and taps: neither random nor fixed.');
slider(live, { label: 'I', min: 0, max: 1, step: 0.01, value: P.I, digits: 2 }, set('I'));
const showTempo = tempoControls(live, el<HTMLButtonElement>('tap'), tempo);

const random = controlGroup(controls, 'Random per instance', 'Drawn when an instance starts; here each A from U(0, 1).');
const amountSliders = Object.fromEntries(VOICE_NAMES.map((name) => [name,
  slider(random, { label: 'A_' + name, min: 0, max: 1, step: 0.01, value: P[name], digits: 2 }, set(name))])) as Record<VoiceName, (v: number) => void>;
button(random, 'Draw again', 'redraw').addEventListener('click', () => {
  for (const name of VOICE_NAMES) {
    P[name] = Math.round(Math.random() * 100) / 100;
    amountSliders[name](P[name]);
  }
  writeFormulas();
});

const fixed = controlGroup(controls, 'Fixed in code',
  'Constants in src/beatVoices.ts; x0 is the value at intensity 0, x1 at 1. Windows: kick every beat, snare on 2 and 4, crash on 1, a beat each.');
slider(fixed, { label: 'a0', min: 0, max: 1, step: 0.005, value: P.a0, digits: 3 }, set('a0'));
slider(fixed, { label: 'a1', min: 0, max: 1, step: 0.005, value: P.a1, digits: 3 }, set('a1'));
slider(fixed, { label: 'p0', min: 0, max: 8, step: 0.1, value: P.p0, digits: 1 }, set('p0'));
slider(fixed, { label: 'p1', min: 0, max: 8, step: 0.1, value: P.p1, digits: 1 }, set('p1'));
slider(fixed, { label: 'G', min: 0, max: 2, step: 0.01, value: P.G, digits: 2 }, set('G'));

// --- drawing --------------------------------------------------------------

const BEAT_TICKS: Tick[] = [0, 1, 2, 3, 4].map((x): Tick => ({ x, label: x < 4 ? 'beat ' + (x + 1) : 'next 1', strong: true }))
  .concat([0.5, 1.5, 2.5, 3.5].map((x): Tick => ({ x, label: '' })));


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

const square = el('square');
const beatDots = document.querySelectorAll('.beats i');
const nowF = el('nowF');
const nowLight = el('nowLight');
const nowTempo = el('nowTempo');
el('restart').addEventListener('click', () => tempo.restart(performance.now()));

function frameLoop(now: number): void {
  const pos = tempo.beats(now) % 4;
  showTempo(now);
  nowTempo.textContent = tempo.tempo(now).label;
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
