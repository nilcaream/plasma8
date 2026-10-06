/**
 * The /crossfader/ page: one free parameter pushed between the edges of a band
 * by a beat voice, graphed over 4 bars from the same functions the visuals
 * will use, with sliders, a cursor at the tapped or set tempo and a fresh draw.
 */
import { VOICES, VOICE_NAMES, type VoiceName } from './beatVoices';
import {
  TRAVEL_AT_0, TRAVEL_AT_1, crossfade, crossfaderState, drawRange, edgeOf, hitTime, travelFor, type Crossfader,
} from './crossfader';
import {
  button, colors, controlGroup, dot, el, frame, plot, playhead, samples, setup, slider, tempoControls,
  type Tick,
} from './pageGraphs';
import { CROSSFADER, LIVE } from './pageRanges';
import { PageTempo } from './pageTempo';
import { createRng, formatSeed, freshSeed } from './rng';

const WINDOW = 16; // beats on screen: 4 bars
const BAR = 4;
const GAP = 0.1; // the least room between min and max

/** The sliders show 2 decimals, so a draw is rounded to them and the graphs show what the sliders say. */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Where each voice's hits sit, in words, for the formulas. */
const PATTERN: Record<VoiceName, string> = {
  kick: 'kick every beat: low on beats 1 and 3, high on beats 2 and 4',
  snare: 'snare on beats 2 and 4: low on beat 2, high on beat 4',
  crash: 'crash on beat 1 of every bar: high on an odd bar (1, 3, ...), low on an even bar (2, 4, ...)',
};

let seed = freshSeed();
const drawn = drawRange(createRng(seed), CROSSFADER.bounds.lo, CROSSFADER.bounds.hi);
const P: Crossfader = {
  min: round2(drawn.min), max: round2(drawn.max), intensity: 0.5, voice: 'kick', travel0: TRAVEL_AT_0, travel1: TRAVEL_AT_1,
};

// --- controls -------------------------------------------------------------

const controls = el('controls');
const tempo = new PageTempo(performance.now(), 120);

const live = controlGroup(controls, 'Live',
  `Set by the user, with the slider and taps: I ${LIVE.intensity.min}-${LIVE.intensity.max}, BPM ${LIVE.bpm.min}-${LIVE.bpm.max} (the tap clock's limits).`);
slider(live, { label: 'I', ...LIVE.intensity, step: 0.01, value: P.intensity, digits: 2 }, (v) => { P.intensity = v; });
const showTempo = tempoControls(live, el<HTMLButtonElement>('tap'), tempo);

const random = controlGroup(controls, 'Random per instance',
  `Drawn when an instance starts, inside the algorithm's outer bounds (an example here: ${CROSSFADER.bounds.lo} to ${CROSSFADER.bounds.hi}): `
  + `a width of 25 to 60 percent of the bounds, put anywhere inside them. The sliders span what that can give; min stays ${GAP} below max.`);
const setMin = slider(random, { label: 'min', ...CROSSFADER.min, step: 0.01, value: P.min, digits: 2 }, (v) => {
  P.min = v;
  if (P.max < v + GAP) { P.max = round2(v + GAP); setMax(P.max); }
});
const setMax = slider(random, { label: 'max', ...CROSSFADER.max, step: 0.01, value: P.max, digits: 2 }, (v) => {
  P.max = v;
  if (P.min > v - GAP) { P.min = round2(v - GAP); setMin(P.min); }
});
const seedLine = document.createElement('p');
seedLine.className = 'note';
random.appendChild(seedLine);
const showSeed = (): void => { seedLine.textContent = `seed ${formatSeed(seed)}`; };
showSeed();
button(random, 'Draw again', 'redraw').addEventListener('click', () => {
  seed = freshSeed();
  const d = drawRange(createRng(seed), CROSSFADER.bounds.lo, CROSSFADER.bounds.hi);
  P.min = round2(d.min);
  P.max = round2(d.max);
  setMin(P.min);
  setMax(P.max);
  showSeed();
});

const fixed = controlGroup(controls, 'Fixed in code',
  `Which voice drives the value, and how many beats a stroke takes at intensity 0 and at 1 (${TRAVEL_AT_0} and ${TRAVEL_AT_1} in code; a straight line between them by I, ending on the hit, cut to the beats between two hits). `
  + 'Over a whole gap the stroke is close to a sine.');
const voiceRow = document.createElement('div');
voiceRow.className = 'ctl';
voiceRow.innerHTML = `<label for="voice">voice</label><select id="voice">${VOICE_NAMES.map((n) => `<option value="${n}">${n}</option>`).join('')}</select>`;
fixed.appendChild(voiceRow);
const voiceSelect = voiceRow.querySelector('select')!;
voiceSelect.value = P.voice;
voiceSelect.addEventListener('change', () => { P.voice = voiceSelect.value as VoiceName; });
const setTravel0 = slider(fixed, { label: 'travel I=0', ...CROSSFADER.travel, step: 0.005, value: P.travel0, digits: 3 }, (v) => { P.travel0 = v; });
const setTravel1 = slider(fixed, { label: 'travel I=1', ...CROSSFADER.travel, step: 0.005, value: P.travel1, digits: 3 }, (v) => { P.travel1 = v; });
button(fixed, 'Reset to code values', 'reset-fixed').addEventListener('click', () => {
  P.voice = 'kick';
  P.travel0 = TRAVEL_AT_0;
  P.travel1 = TRAVEL_AT_1;
  voiceSelect.value = P.voice;
  setTravel0(P.travel0);
  setTravel1(P.travel1);
});

// --- drawing --------------------------------------------------------------

/** Bar lines strong and numbered, beat lines light, for the window starting at x0. */
function windowTicks(x0: number): Tick[] {
  const ticks: Tick[] = [];
  for (let b = 0; b <= WINDOW; b++) {
    ticks.push(b % BAR === 0 ? { x: x0 + b, label: 'bar ' + ((x0 + b) / BAR + 1), strong: true } : { x: x0 + b, label: '' });
  }
  return ticks;
}

function drawValue(x0: number, pos: number): void {
  const s = setup(el<HTMLCanvasElement>('valueCanvas'));
  const pad = (P.max - P.min) * 0.1;
  const y0 = P.min - pad;
  const y1 = P.max + pad;
  const mid = (P.min + P.max) / 2;
  const { X, Y } = frame(s, x0, x0 + WINDOW, y0, y1, windowTicks(x0), [P.min, mid, P.max], 2);
  const { ctx } = s;
  ctx.fillStyle = colors.band;
  ctx.fillRect(X(x0), Y(P.max), X(x0 + WINDOW) - X(x0), Y(P.min) - Y(P.max));
  const { low, high } = crossfaderState(pos, P);
  for (const edge of [low, high]) plot(ctx, X, Y, x0, x0 + WINDOW, 1, () => edge, colors.light, 1.5, [5, 4]);
  plot(ctx, X, Y, x0, x0 + WINDOW, samples(s.w), (b) => crossfade(b, P), colors.total, 3);
  const color = colors[P.voice];
  const v = VOICES[P.voice];
  for (let n = Math.floor((x0 - v.onset) / v.period); hitTime(P.voice, n) <= x0 + WINDOW; n++) {
    const t = hitTime(P.voice, n);
    if (t >= x0) dot(ctx, X(t), Y(crossfade(t, P)), color, 4);
  }
  playhead(s, X, pos);
  dot(ctx, X(pos), Y(crossfade(pos, P)), colors.play);
}

// --- formulas -------------------------------------------------------------

const f2 = (v: number): string => v.toFixed(2);
const f3 = (v: number): string => v.toFixed(3);

function writeFormulas(pos: number): void {
  const st = crossfaderState(pos, P);
  const mid = (P.min + P.max) / 2;
  const half = (P.max - P.min) / 2;
  const v = VOICES[P.voice];
  const length = travelFor(P);
  const blended = P.travel0 + (P.travel1 - P.travel0) * Math.min(1, Math.max(0, P.intensity));
  const bar = Math.floor(pos / BAR) + 1;
  const beat = Math.floor(pos % BAR) + 1;
  const lines = [
    'range [min, max] drawn per instance;  mid = (min + max)/2,  half = (max − min)/2',
    `mid = (${f2(P.min)} + ${f2(P.max)})/2 = ${f3(mid)},  half = ${f3(half)}`,
    '',
    `band:  low = mid − I·half = ${f3(mid)} − ${f2(P.intensity)}·${f3(half)} = ${f3(st.low)};  high = mid + I·half = ${f3(st.high)}   (I = 0: the middle, no movement;  I = 1: the whole range)`,
    '',
    `hits of the ${P.voice}: hit n at t_n = ${v.onset} + n·${v.period} beats (t in beats from beat 1 of bar 1);  ${PATTERN[P.voice]}`,
    `edge e_n = ${edgeOf(P.voice, 0)} for even n, ${edgeOf(P.voice, 1)} for odd n  (hits counted on in both directions, so a value before the first hit is where the pattern puts it)`,
    '',
    `stroke length by intensity:  L = L0 + (L1 − L0)·I = ${f3(P.travel0)} + (${f3(P.travel1)} − ${f3(P.travel0)})·${f2(P.intensity)} = ${f3(blended)} beats`
      + (blended > length ? `, cut to the ${v.period} beats between two hits of the ${P.voice} = ${f3(length)}` : ''),
    's(x) = 3x² − 2x³ on x ∈ [0, 1]   (over a whole gap between two hits it is close to a sine; the shorter L, the nearer a flick)',
    'for t_n ≤ t < t_(n+1):   x = clamp((t − (t_(n+1) − L)) / L, 0, 1)',
    '                        value = e_n + (e_(n+1) − e_n)·s(x)     it holds e_n, then arrives on e_(n+1) exactly at t_(n+1)',
    '',
    `now:  t = ${f3(pos)} (bar ${bar}, beat ${beat});  last hit n = ${st.last.n} at ${f3(st.last.time)} on ${st.last.edge};  next hit n = ${st.next.n} at ${f3(st.next.time)} on ${st.next.edge}`,
    `      x = ${f3(st.progress)}  →  s(x) = ${f3(st.progress * st.progress * (3 - 2 * st.progress))}  →  value = ${f3(st.value)}`,
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
  const x0 = Math.floor(pos / WINDOW) * WINDOW;
  drawValue(x0, pos);
  el('legendVoice').style.setProperty('--c', `var(--${P.voice})`);

  const v = crossfade(pos, P);
  const span = P.max - P.min || 1;
  const { low, high } = crossfaderState(pos, P);
  const band = el('gaugeBand');
  band.style.left = `${(100 * (low - P.min)) / span}%`;
  band.style.width = `${(100 * (high - low)) / span}%`;
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
