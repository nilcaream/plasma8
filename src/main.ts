import { chooseAlgorithm } from './algorithms';
import type { Algorithm, AlgorithmDef } from './algorithm';
import { TapClock } from './clock';
import { beatInputs } from './drive';
import { createContext } from './gl';
import { isTapKey, isTapPointer } from './input';
import { KnobPanel } from './knobPanel';
import type { Values } from './knobs';
import { parseDebugParams } from './query';
import { createRng, formatSeed, freshSeed } from './rng';
import { Sequencer, type Change } from './sequence';
import { loadSettings, saveSettings, type Settings } from './settings';
import { BarSteps, MotionClock, motionRate } from './motion';
import { Stage, TRANSITION_STYLES, drawTransitionLook, type TransitionLook } from './stage';
import { FlashGate, flashLevel } from './strobe';
import { Corner, DebugOverlay, Metronome, showFatal } from './ui';

interface Running {
  def: AlgorithmDef;
  /** Its knobs' values: drawn at start, moved by the debug panel. */
  values: Values;
  algorithm: Algorithm;
}

function describeChange(change: Change | undefined, look: TransitionLook | undefined): string | undefined {
  if (!change) return undefined;
  if (change.kind === 'cut') return 'cut';
  const style = look ? `, ${TRANSITION_STYLES[look.style]}` : '';
  const beats = Number.isInteger(change.beats) ? String(change.beats) : change.beats.toFixed(1);
  return `fade ${beats} beat${change.beats === 1 ? '' : 's'}${style}`;
}

/** Cap the pixel ratio: the soft fields gain nothing from more, and phones pay for it. */
const MAX_PIXEL_RATIO = 1.5;

function main(): void {
  const params = parseDebugParams(location.search);

  // Remembered settings; a pinned debug value starts the page but is only remembered once the user moves it.
  const remembered = loadSettings();
  const live: Settings = {
    ...remembered,
    ...(params.intensity !== undefined && { intensity: params.intensity }),
    ...(params.strobe !== undefined && { strobe: params.strobe }),
  };

  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const gl = createContext(canvas);

  // A fresh seed every load: the same URL never looks the same twice. Every
  // algorithm draws its parameters from it, again at every change.
  const seed = freshSeed();
  const seedText = formatSeed(seed);
  const rng = createRng(seed);
  // ?debug: a slider for every value the running algorithm drew; "Draw again" starts it afresh at once
  const knobPanel = new KnobPanel(params.debug, seedText, () => {
    current.algorithm.dispose();
    current = create(current.def);
    knobPanel.show(current);
    console.info(`[plasma8] ${current.def.name} drawn again; seed ${seedText}`);
  });
  let warned = false;
  // every value it draws at start: from the code's ranges, or from the debug panel's min..max once moved
  const create = (def: AlgorithmDef): Running => {
    const values = knobPanel.start(def, rng);
    return { def, values, algorithm: def.create(gl, values, rng) };
  };
  const make = (intensity: number, running?: AlgorithmDef): Running => {
    const { def, unknown } = chooseAlgorithm(params.algo, intensity, rng, running);
    if (unknown && !warned) {
      warned = true;
      console.warn(`[plasma8] unknown algorithm "${params.algo}", picking at random`);
    }
    return create(def);
  };
  const announce = (r: Running, bars: number, how: string): void => {
    console.info(`[plasma8] ${r.def.name} (home ${r.def.home.toFixed(2)}) ${how}; next change in ${bars} bars; seed ${seedText}`);
  };

  const stage = new Stage(gl);
  const sequencer = new Sequencer(rng);
  const gate = new FlashGate();
  const motion = new MotionClock();
  const barSteps = new BarSteps();
  let current = make(live.intensity);
  let incoming: Running | undefined;
  let look: TransitionLook | undefined;
  announce(current, sequencer.segment.bars, 'to start');
  knobPanel.show(current);

  const clock = new TapClock(performance.now(), params.bpm);

  const metronome = new Metronome();
  metronome.setEnabled(live.metronome);
  const debug = new DebugOverlay(params.debug, seedText);
  const corner = new Corner(live, (key, value) => {
    live[key] = value;
    remembered[key] = value;
    saveSettings(remembered);
    if (key === 'metronome') metronome.setEnabled(live.metronome);
  });

  // Taps: pointer down and key down, anywhere except the reserved corner. A tap
  // is timed when the event happened, not when a busy page got round to it.
  window.addEventListener('pointerdown', (e) => {
    if (corner.contains(e.target) || knobPanel.contains(e.target) || !isTapPointer(e)) return;
    clock.tap(e.timeStamp);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && corner.isOpen()) corner.setOpen(false);
    if (corner.contains(e.target) || knobPanel.contains(e.target) || !isTapKey(e)) return;
    clock.tap(e.timeStamp);
  });

  const start = performance.now();
  let last = start;
  let lastBeat = -1;
  let pending = 'change';

  const frame = (): void => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    const seconds = (now - start) / 1000;
    last = now;

    const r = clock.read(now);
    const intensity = live.intensity;
    const beat = beatInputs(r, intensity);

    // Changes: the next algorithm is made a bar ahead, and takes over on beat 1.
    const step = sequencer.update(r.beats, r.run, intensity);
    if (step.prepare) {
      incoming = make(intensity, current.def);
      look = drawTransitionLook(rng);
      pending = describeChange(sequencer.change, look) ?? 'change';
    }
    if (step.change && incoming) {
      current.algorithm.dispose();
      current = incoming;
      incoming = undefined;
      look = undefined;
      announce(current, sequencer.segment.bars, `in by ${pending}`);
      knobPanel.show(current);
    }

    // Speed follows the intensity at once; during a fade it slides from the outgoing home to the incoming one.
    const fade = incoming ? step.fade : 0;
    const eased = fade * fade * (3 - 2 * fade);
    const rateOut = motionRate(current.def.home, intensity);
    const rate = incoming && fade > 0 ? rateOut + (motionRate(incoming.def.home, intensity) - rateOut) * eased : rateOut;

    // Strobe: off at 0; the running algorithm says kick or snare, the gate keeps the cap.
    const beatIndex = Math.floor(r.beats);
    if (beatIndex !== lastBeat) {
      lastBeat = beatIndex;
      if (live.strobe > 0) gate.onBeat(current.def.strobe, beatIndex, r.bpm, seconds);
    }
    const flash = flashLevel(seconds - gate.lastFlash, live.strobe);

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    stage.render(current.algorithm, incoming?.algorithm, look, {
      inputs: {
        ...beat,
        time: motion.update(dt, rate),
        barSteps: barSteps.update(r.bar, r.barPhase, intensity),
        width,
        height,
      },
      fade,
      flash,
    });

    if (live.metronome) metronome.update(r);
    debug.update(r, {
      name: current.def.name,
      home: current.def.home,
      barsLeft: sequencer.barsLeft(r.beats),
      change: describeChange(sequencer.change, look),
      intensity,
      rate,
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

try {
  main();
} catch (err) {
  console.error(err);
  showFatal(err instanceof Error ? err.message : String(err));
}
