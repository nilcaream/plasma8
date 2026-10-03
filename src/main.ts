import { chooseAlgorithm } from './algorithms';
import type { Algorithm, AlgorithmDef } from './algorithm';
import { TapClock } from './clock';
import { createContext } from './gl';
import { isTapKey, isTapPointer } from './input';
import { parseDebugParams } from './query';
import { createRng, formatSeed, freshSeed } from './rng';
import { Sequencer, type Change } from './sequence';
import { loadSettings, saveSettings, type Settings } from './settings';
import { softening } from './soften';
import { Stage, TRANSITION_STYLES, drawTransitionLook, type TransitionLook } from './stage';
import { FlashGate, flashLevel } from './strobe';
import { BeatTravel } from './travel';
import { Corner, DebugOverlay, Metronome, showFatal } from './ui';

interface Running {
  def: AlgorithmDef;
  algorithm: Algorithm;
}

function describeChange(change: Change | undefined, look: TransitionLook | undefined): string | undefined {
  if (!change) return undefined;
  if (change.kind === 'cut') return 'cut';
  const style = look ? `, ${TRANSITION_STYLES[look.style]}` : '';
  return `fade ${change.beats} beat${change.beats === 1 ? '' : 's'}${style}`;
}

/** Cap the pixel ratio: the soft fields gain nothing from more, and phones pay for it. */
const MAX_PIXEL_RATIO = 1.5;
/** Before the first tap the visuals are calmer: the intensity is scaled by this, then eased to 1. */
const UNSYNCED_CALM = 0.55;
const CALM_EASE_SECONDS = 0.8;

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
  let warned = false;
  const make = (intensity: number, running?: AlgorithmDef): Running => {
    const { def, unknown } = chooseAlgorithm(params.algo, intensity, rng, running);
    if (unknown && !warned) {
      warned = true;
      console.warn(`[plasma8] unknown algorithm "${params.algo}", picking at random`);
    }
    return { def, algorithm: def.create(gl, rng) };
  };
  const announce = (r: Running, bars: number, how: string): void => {
    console.info(`[plasma8] ${r.def.name} (home ${r.def.home.toFixed(2)}) ${how}; next change in ${bars} bars; seed ${seedText}`);
  };

  const stage = new Stage(gl);
  const sequencer = new Sequencer(rng);
  const gate = new FlashGate();
  const travel = new BeatTravel();
  let current = make(live.intensity);
  let incoming: Running | undefined;
  let look: TransitionLook | undefined;
  announce(current, sequencer.segment.bars, 'to start');

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
    if (corner.contains(e.target) || !isTapPointer(e)) return;
    clock.tap(e.timeStamp);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && corner.isOpen()) corner.setOpen(false);
    if (corner.contains(e.target) || !isTapKey(e)) return;
    clock.tap(e.timeStamp);
  });

  const start = performance.now();
  let last = start;
  let calm = UNSYNCED_CALM;
  let lastBeat = -1;
  let pending = 'change';

  const frame = (): void => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    const seconds = (now - start) / 1000;
    last = now;

    const r = clock.read(now);
    calm += ((r.synced ? 1 : UNSYNCED_CALM) - calm) * (1 - Math.exp(-dt / CALM_EASE_SECONDS));
    // The algorithms get the calmer value before the first tap; the pick, the cuts and the softening follow the slider.
    const slider = live.intensity;
    const intensity = slider * calm;

    // Changes: the next algorithm is made a bar ahead, and takes over on beat 1.
    const step = sequencer.update(r.beats, r.run, slider);
    if (step.prepare) {
      incoming = make(slider, current.def);
      look = drawTransitionLook(rng);
      pending = describeChange(sequencer.change, look) ?? 'change';
    }
    if (step.change && incoming) {
      current.algorithm.dispose();
      current = incoming;
      incoming = undefined;
      look = undefined;
      announce(current, sequencer.segment.bars, `in by ${pending}`);
    }

    // Softening follows the slider at once; during a fade it slides from the outgoing home to the incoming one.
    const fade = incoming ? step.fade : 0;
    const eased = fade * fade * (3 - 2 * fade);
    const softOut = softening(current.def.home, slider);
    const soft = incoming && fade > 0 ? softOut + (softening(incoming.def.home, slider) - softOut) * eased : softOut;

    // Strobe: off at 0; the running algorithm says kick or snare, the gate keeps the cap.
    const beat = Math.floor(r.beats);
    if (beat !== lastBeat) {
      lastBeat = beat;
      if (live.strobe > 0) gate.onBeat(current.def.strobe, beat, r.bpm, seconds);
    }
    const flash = flashLevel(seconds - gate.lastFlash, live.strobe) * calm;

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    stage.render(current.algorithm, incoming?.algorithm, look, {
      inputs: {
        time: seconds,
        beatPhase: r.beatPhase,
        barPhase: r.barPhase,
        barCount: r.bar,
        travel: travel.update(r.beats),
        intensity,
        width,
        height,
      },
      fade,
      soft,
      flash,
    });

    if (live.metronome) metronome.update(r);
    debug.update(r, {
      name: current.def.name,
      home: current.def.home,
      barsLeft: sequencer.barsLeft(r.beats),
      change: describeChange(sequencer.change, look),
      intensity,
      soft,
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
