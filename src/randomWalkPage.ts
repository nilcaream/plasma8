/**
 * The /random-walk/ page: one free parameter that takes a random up-or-down
 * step on every hit of a beat voice, graphed over 4 bars and over 64 from the
 * same functions the visuals would use (src/randomWalk.ts), with sliders, a
 * cursor at the tapped or set tempo and a fresh draw. The /crossfader/ page
 * beside it is the same idea with a band between two edges instead.
 */
import { VOICES, VOICE_NAMES, type VoiceName } from './beatVoices';
import { REACH_POWER, TRAVEL_AT_0, TRAVEL_AT_1, hitTime, travelFor } from './crossfader';
import {
  button, colors, controlGroup, dot, el, frame, plot, playhead, samples, setup, slider, tempoControls,
  type Tick,
} from './pageGraphs';
import { RANDOM_WALK, LIVE } from './pageRanges';
import { PageTempo } from './pageTempo';
import { RandomWalk, STEP_AT_1, stepOf, type WalkParams } from './randomWalk';
import { createRng, formatSeed, freshSeed } from './rng';

const WINDOW = 16; // beats on screen: 4 bars
const STRIP = 256; // beats on the long graph: 64 bars
const BAR = 4;

let seed = freshSeed();
let rng = createRng(seed);
let walk = new RandomWalk(rng);
// the walk goes over the whole of a knob's min..max, whatever they are: here the unit range
const P: WalkParams = {
  min: 0, max: 1, intensity: 0.5, power: REACH_POWER, voice: 'kick',
  travel0: TRAVEL_AT_0, travel1: TRAVEL_AT_1, stepAt1: STEP_AT_1,
};

// --- controls -------------------------------------------------------------

const controls = el('controls');
const tempo = new PageTempo(performance.now(), 120);

const live = controlGroup(controls, 'Live',
  `Set by the user: I ${LIVE.intensity.min}-${LIVE.intensity.max} with the slider. In the app the tempo comes from Tap (${LIVE.bpm.min}-${LIVE.bpm.max} BPM, the tap clock's limits) or from Detect (${LIVE.detectBpm.min}-${LIVE.detectBpm.max} BPM, the microphone); this page has the Tap button.`);
slider(live, { label: 'I', ...LIVE.intensity, step: 0.01, value: P.intensity, digits: 2 }, (v) => { P.intensity = v; });
const showTempo = tempoControls(live, el<HTMLButtonElement>('tap'), tempo);

const seedLine = document.createElement('p');
seedLine.className = 'note';
live.appendChild(seedLine);
const showSeed = (): void => { seedLine.textContent = `seed ${formatSeed(seed)}: the point the walk starts from, drawn at random over the whole range`; };
showSeed();
button(live, 'Draw again', 'redraw').addEventListener('click', () => {
  seed = freshSeed();
  rng = createRng(seed);
  walk = new RandomWalk(rng);
  showSeed();
});

const fixed = controlGroup(controls, 'Fixed in code',
  `Which voice takes the steps; how far a step goes at intensity 1, as a share of the range (it is that times I to the power below, so none at 0); `
  + `and how many beats a stroke takes at intensity 0 and at 1 (${TRAVEL_AT_0} and ${TRAVEL_AT_1} in code; a straight line between them by I, ending on the hit, cut to the beats between two hits).`);
const voiceRow = document.createElement('div');
voiceRow.className = 'ctl';
voiceRow.innerHTML = `<label for="voice">voice</label><select id="voice">${VOICE_NAMES.map((n) => `<option value="${n}">${n}</option>`).join('')}</select>`;
fixed.appendChild(voiceRow);
const voiceSelect = voiceRow.querySelector('select')!;
voiceSelect.value = P.voice;
voiceSelect.addEventListener('change', () => { P.voice = voiceSelect.value as VoiceName; });
const setStep = slider(fixed, { label: 'step I=1', ...RANDOM_WALK.step, step: 0.005, value: P.stepAt1, digits: 3 }, (v) => { P.stepAt1 = v; });
const setPower = slider(fixed, { label: 'reach power', ...RANDOM_WALK.power, step: 0.01, value: P.power, digits: 2 }, (v) => { P.power = v; });
const setTravel0 = slider(fixed, { label: 'travel I=0', ...RANDOM_WALK.travel, step: 0.005, value: P.travel0, digits: 3 }, (v) => { P.travel0 = v; });
const setTravel1 = slider(fixed, { label: 'travel I=1', ...RANDOM_WALK.travel, step: 0.005, value: P.travel1, digits: 3 }, (v) => { P.travel1 = v; });
button(fixed, 'Reset to code values', 'reset-fixed').addEventListener('click', () => {
  P.voice = 'kick';
  P.stepAt1 = STEP_AT_1;
  P.power = REACH_POWER;
  P.travel0 = TRAVEL_AT_0;
  P.travel1 = TRAVEL_AT_1;
  voiceSelect.value = P.voice;
  setStep(P.stepAt1);
  setPower(P.power);
  setTravel0(P.travel0);
  setTravel1(P.travel1);
});

// --- drawing --------------------------------------------------------------

const valueOf = (u: number): number => P.min + u * (P.max - P.min);

/** Bar lines strong and labelled every `every` bars, beat lines light (a line each 4 bars on the long graph), for the window starting at x0. */
function ticksFor(x0: number, length: number, every: number): Tick[] {
  const ticks: Tick[] = [];
  const step = length > WINDOW ? BAR * 4 : 1;
  for (let b = 0; b <= length; b += step) {
    const bars = (x0 + b) / BAR;
    const label = Number.isInteger(bars / every) ? 'bar ' + (bars + 1) : '';
    ticks.push(label ? { x: x0 + b, label, strong: true } : { x: x0 + b, label: '' });
  }
  return ticks;
}

/** The walk's trace over one window: from where its record starts to the playhead, which is as far as it is known. */
function drawTrace(canvasId: string, x0: number, length: number, pos: number, every: number, hits: boolean): void {
  const s = setup(el<HTMLCanvasElement>(canvasId));
  const pad = (P.max - P.min) * 0.1;
  const mid = (P.min + P.max) / 2;
  const { X, Y } = frame(s, x0, x0 + length, P.min - pad, P.max + pad, ticksFor(x0, length, every), [P.min, mid, P.max], 2);
  const { ctx } = s;
  ctx.fillStyle = colors.band;
  ctx.fillRect(X(x0), Y(P.max), X(x0 + length) - X(x0), Y(P.min) - Y(P.max));
  const first = walk.history[0];
  if (first) {
    const from = Math.max(x0, first.time);
    const to = Math.min(pos, x0 + length);
    if (to > from) plot(ctx, X, Y, from, to, Math.ceil(samples(s.w) * (to - from) / length) * 2, (b) => valueOf(walk.read(b, P) ?? 0), colors.total, hits ? 3 : 2);
  }
  if (hits) {
    const ahead = valueOf(walk.target(P));
    const arrive = hitTime(P.voice, Math.floor((pos - VOICES[P.voice].onset) / VOICES[P.voice].period) + 1);
    plot(ctx, X, Y, pos, Math.min(arrive, x0 + length), 1, () => ahead, colors.light, 1.5, [5, 4]);
    for (const h of walk.history) if (h.time >= x0 && h.time <= x0 + length && h.time <= pos) dot(ctx, X(h.time), Y(valueOf(h.u)), colors[P.voice], 4);
  }
  playhead(s, X, pos);
  const now = walk.read(pos, P);
  if (now !== undefined) dot(ctx, X(pos), Y(valueOf(now)), colors.play);
}

// --- formulas -------------------------------------------------------------

const f2 = (v: number): string => v.toFixed(2);
const f3 = (v: number): string => v.toFixed(3);

function writeFormulas(pos: number): void {
  const v = VOICES[P.voice];
  const base = stepOf(P);
  const step = walk.step(P);
  const next = walk.next(P);
  const last = walk.history[walk.history.length - 1];
  const length = travelFor(P);
  const blended = P.travel0 + (P.travel1 - P.travel0) * Math.min(1, Math.max(0, P.intensity));
  const bar = Math.floor(pos / BAR) + 1;
  const beat = Math.floor(pos % BAR) + 1;
  const sign = (d: number): string => (d === 1 ? '+' : '−');
  const flipped = next.dir !== walk.direction;
  const lines = [
    'the walk goes over the whole of a knob\'s min..max (here min = 0, max = 1) and keeps a place u in [0, 1] (0 = min, 1 = max):  value = min + u·(max − min)',
    'start: u drawn at random in [0, 1) per instance, so it starts anywhere in the range; at I = 0 it stays there',
    '',
    `step by intensity:  s0 = stepAt1 · I^p = ${f3(P.stepAt1)} · ${f2(P.intensity)}^${P.power} = ${f3(base)} of the range   (I = 0: no step, nothing moves)`,
    `every step is a little longer, up to a tenth, drawn for each hit:  s = s0 · (1 + e),  e in [0, 0.1)   (the next one: e = ${f3((step / (base || 1)) - 1)}, s = ${f3(step)} of the range = ${f3(step * (P.max - P.min))} in value)`,
    `hits of the ${P.voice}: hit n at t_n = ${v.onset} + n·${v.period} beats (t in beats from beat 1 of bar 1)`,
    'on every hit n:  d_n = +1 or −1, drawn at random (half each);   u_n = u_(n−1) + d_n·s   if that stays inside 0..1,   else  u_(n−1) − d_n·s',
    'so every step is a whole step: at an edge the direction flips instead of the step being cut short (s is at most 0.495, so one way always fits)',
    '',
    `stroke length by intensity:  L = L0 + (L1 − L0)·I = ${f3(P.travel0)} + (${f3(P.travel1)} − ${f3(P.travel0)})·${f2(P.intensity)} = ${f3(blended)} beats`
      + (blended > length ? `, cut to the ${v.period} beats between two hits of the ${P.voice} = ${f3(length)}` : ''),
    's(x) = 3x² − 2x³ on x ∈ [0, 1]   (the same smooth stroke as the crossfader)',
    'for t_n ≤ t < t_(n+1):   x = clamp((t − (t_(n+1) − L)) / L, 0, 1)',
    '                        u = u_n + (u_(n+1) − u_n)·s(x)     it holds u_n, then arrives on u_(n+1) exactly at t_(n+1)',
    '',
    last
      ? `now:  t = ${f3(pos)} (bar ${bar}, beat ${beat});  last hit n = ${last.n} at ${f3(last.time)}, u = ${f3(last.u)};  the next hit is drawn ${walk.direction === 1 ? 'up' : 'down'}`
        + (flipped ? `, which would leave the range, so it goes ${next.dir === 1 ? 'up' : 'down'}` : '')
        + `: u = ${f3(last.u)} ${sign(next.dir)} ${f3(step)} = ${f3(next.u)}`
      : `now:  t = ${f3(pos)}`,
  ];
  el('formulas').textContent = lines.join('\n');
}

// --- real time ------------------------------------------------------------

const beatDots = el('beatDots').querySelectorAll('i');
const nowTempo = el('nowTempo');
const square = el('square');
let lastFormulas = -Infinity;
el('restart').addEventListener('click', () => tempo.restart(performance.now()));

function frameLoop(now: number): void {
  const pos = tempo.beats(now);
  showTempo(now);
  nowTempo.textContent = tempo.tempo(now).label;
  const v = walk.at(pos, P);
  drawTrace('valueCanvas', Math.floor(pos / WINDOW) * WINDOW, WINDOW, pos, 1, true);
  drawTrace('stripCanvas', Math.floor(pos / STRIP) * STRIP, STRIP, pos, 8, false);
  el('legendVoice').style.setProperty('--c', `var(--${P.voice})`);

  const span = P.max - P.min || 1;
  el('gaugeMark').style.left = `${(100 * (v - P.min)) / span}%`;
  el('gaugeMin').textContent = `min ${f2(P.min)}`;
  el('gaugeMax').textContent = `max ${f2(P.max)}`;
  const grey = Math.round(255 * Math.min(1, Math.max(0, (v - P.min) / span)));
  square.style.background = `rgb(${grey}, ${grey}, ${grey})`;
  beatDots.forEach((d, i) => d.classList.toggle('on', i === Math.floor(pos % BAR)));
  el('nowBar').textContent = String(Math.floor(pos / BAR) + 1);
  el('nowValue').textContent = f3(v);
  if (now - lastFormulas > 100) { writeFormulas(pos); lastFormulas = now; }
  requestAnimationFrame(frameLoop);
}

requestAnimationFrame(frameLoop);
