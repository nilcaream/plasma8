import { ALGORITHMS, chooseAlgorithm } from './algorithms';
import type { Algorithm, AlgorithmDef, FrameInputs } from './algorithm';
import { TapClock } from './clock';
import { beatInputs } from './drive';
import { FlashLimiter } from './flashLimit';
import { createContext } from './gl';
import { isTapKey, isTapPointer } from './input';
import { KnobPanel } from './knobPanel';
import type { Values } from './knobs';
import { parseDebugParams } from './query';
import { createRng, formatSeed, freshSeed } from './rng';
import { Sequencer, type Change } from './sequence';
import { loadSettings, saveSettings, type Settings } from './settings';
import { MotionClock, motionRate, motionTimeFor, steadyRate } from './motion';
import { movingRange } from './moving';
import { Stage, TRANSITION_STYLES, drawTransitionLook, type TransitionLook } from './stage';
import { TapAreas } from './tapAreas';
import { TapWidget, widgetView } from './tapWidget';
import { TempoWheel } from './tempoWheel';
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
    const algorithm = def.create(gl, values, rng, knobPanel.options(def));
    if (params.debug && algorithm.moving?.length) {
      const list = algorithm.moving.map((m) => {
        const { min, max } = movingRange(m);
        return `${m.key} ${min.toFixed(3)}..${max.toFixed(3)} (of ${m.lo.toFixed(3)}..${m.hi.toFixed(3)}) by the ${m.voice}`;
      });
      console.info(`[plasma8] ${def.name}: ${algorithm.moving.length} values move: ${list.join('; ')}`);
    }
    return { def, values, algorithm };
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
  // an algorithm forced by name never changes: it keeps its draw until "Draw again" or a reload
  const sequencer = new Sequencer(rng, 0, ALGORITHMS.some((a) => a.name === params.algo));
  const motion = new MotionClock();
  const steady = new MotionClock();
  let current = make(live.intensity);
  let incoming: Running | undefined;
  let look: TransitionLook | undefined;
  announce(current, sequencer.segment.bars, 'to start');
  knobPanel.show(current);

  const clock = new TapClock(performance.now(), params.bpm);
  const flashLimiter = new FlashLimiter();

  const tapWidget = new TapWidget();
  // dragging the wheel sets the tempo to the whole number it shows, and the beat stays where it is
  const wheel = new TempoWheel((bpm) => clock.setBpm(bpm, performance.now()));
  // where a tap is not a tempo tap: the corner and its open menu, the widget, the wheel (src/tapAreas.ts)
  const noTapAreas = new TapAreas(
    [
      { name: 'menu', ids: ['corner', 'menu'] },
      { name: 'widget', ids: ['tap-widget'] },
      { name: 'wheel', ids: ['tempo-wheel'] },
    ],
    params.debug,
  );
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
    if (corner.contains(e.target) || knobPanel.contains(e.target) || wheel.contains(e.target) || !isTapPointer(e)) return;
    if (noTapAreas.contains(e.clientX, e.clientY)) return;
    clock.tap(e.timeStamp);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && corner.isOpen()) corner.setOpen(false);
    if (corner.contains(e.target) || knobPanel.contains(e.target) || wheel.contains(e.target) || !isTapKey(e)) return;
    clock.tap(e.timeStamp);
  });

  const start = performance.now();
  let last = start;
  let pending = 'change';

  const frame = (): void => {
    const now = performance.now();
    const dt = (now - last) / 1000;
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

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const shared = motion.update(dt, rate);
    const steadyTime = steady.update(dt, steadyRate(intensity));
    // a flash window the clock put too close to the last one stays dark (src/flashLimit.ts)
    const strobe = flashLimiter.allow(r.beats, r.bpm, now) ? live.strobe : 0;
    const inputsFor = (def: AlgorithmDef): FrameInputs => ({
      ...beat,
      time: motionTimeFor(def, shared, steadyTime),
      strobe,
      flashBeats: flashLimiter.flashBeats,
      bpm: r.bpm,
      width,
      height,
    });
    const drawn = inputsFor(current.def);
    knobPanel.tick(drawn.intensity, drawn.beats);
    stage.render(current.algorithm, incoming?.algorithm, look, {
      inputs: drawn,
      incomingInputs: incoming ? inputsFor(incoming.def) : undefined,
      fade,
    });

    const widget = widgetView(r, clock.tapMarks(), now);
    tapWidget.update(widget);
    wheel.show(r.bpm);
    wheel.hold(widget.visible);
    noTapAreas.update();
    if (live.metronome) metronome.update(r);
    debug.update(r, {
      name: current.def.name,
      home: current.def.home,
      barsLeft: sequencer.barsLeft(r.beats),
      change: describeChange(sequencer.change, look),
      intensity,
      strobe: live.strobe,
      // the speed the picture really runs at: a steady-speed algorithm keeps its own clock
      rate: current.def.steadySpeed ? steadyRate(intensity) : rate,
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
