import { ALGORITHMS, chooseAlgorithm } from './algorithms';
import type { Algorithm, AlgorithmDef, FrameInputs } from './algorithm';
import { Band, metronomeShown } from './band';
import { DEFAULT_SHAPE, flash } from './beatVoices';
import { TapClock, type ClockReading } from './clock';
import { beatInputs } from './drive';
import { FlashPeaks, amountsText, formatDump, movingText } from './dump';
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
import { movingAt, movingRange } from './moving';
import { Stage, TRANSITION_STYLES, drawTransitionLook, type TransitionLook } from './stage';
import { TapWidget, widgetView } from './tapWidget';
import { TempoWheel } from './tempoWheel';
import { DebugOverlay, Metronome, Sliders, showFatal } from './ui';

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
  const known = ALGORITHMS.find((a) => a.name === params.algo);
  // the algorithm held by name (?algo= or the panel's picker); undefined: the changes pick
  let forced = params.algo;
  const knobPanel = new KnobPanel(
    params.debug,
    seedText,
    () => {
      current.algorithm.dispose();
      current = create(current.def);
      knobPanel.show(current);
      console.info(`[plasma8] ${current.def.name} drawn again; seed ${seedText}`);
    },
    ALGORITHMS.map((a) => a.name),
    known?.name,
    (name) => pick(name),
  );
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
    const { def, unknown } = chooseAlgorithm(forced, intensity, rng, running);
    if (unknown && !warned) {
      warned = true;
      console.warn(`[plasma8] unknown algorithm "${params.algo}", picking at random`);
    }
    return create(def);
  };
  const announce = (r: Running, bars: number, how: string): void => {
    const voices = amountsText(r.algorithm.amounts?.());
    console.info(
      `[plasma8] ${r.def.name} (home ${r.def.home.toFixed(2)}) ${how}; ${Number.isFinite(bars) ? `next change in ${bars} bars` : 'held, no change'}; seed ${seedText}; voices ${voices}; moves ${movingText(r.algorithm.moving)}`,
    );
  };

  const stage = new Stage(gl);
  // an algorithm forced by name never changes: it keeps its draw until "Draw again" or a reload
  const sequencer = new Sequencer(rng, 0, known !== undefined);
  const motion = new MotionClock();
  const steady = new MotionClock();
  let current = make(live.intensity);
  let incoming: Running | undefined;
  let look: TransitionLook | undefined;
  announce(current, sequencer.segment.bars, 'to start');
  knobPanel.show(current);

  const clock = new TapClock(performance.now(), params.bpm);
  // the panel's picker: an algorithm switches in at once with fresh values and is held like ?algo=; "changes" gives it back to the sequencer
  const pick = (name: string | undefined): void => {
    forced = name;
    if (name === undefined) {
      sequencer.release(clock.read(performance.now()).beats);
      console.info(`[plasma8] changes back on; ${current.def.name} stays until the next one`);
      return;
    }
    sequencer.engage();
    incoming?.algorithm.dispose();
    incoming = undefined;
    look = undefined;
    current.algorithm.dispose();
    current = create(ALGORITHMS.find((a) => a.name === name)!);
    knobPanel.show(current);
    announce(current, Infinity, 'picked and held');
  };
  const flashLimiter = new FlashLimiter();

  const tapWidget = new TapWidget();
  // dragging the wheel sets the tempo to the whole number it shows, and the beat stays where it is
  const wheel = new TempoWheel((bpm) => clock.setBpm(bpm, performance.now()));
  // the band across the top: every control lives there, and a tap there is never a tempo tap (src/band.ts)
  // a press in it prints what is on the screen as one console block (src/dump.ts)
  const peaks = new FlashPeaks();
  let seen: { r: ClockReading; intensity: number; strobe: number; flash: number; fade: number; now: number } | undefined;
  const band = new Band(params.debug, () => {
    if (!seen) return;
    const { r, intensity, strobe, flash: flashNow, fade, now } = seen;
    const style = (look ? TRANSITION_STYLES[look.style] : undefined) ?? '';
    console.info(
      formatDump({
        name: current.def.name,
        home: current.def.home,
        seed: seedText,
        transition: incoming ? { state: fade > 0 ? 'fade' : 'ready', to: incoming.def.name, style, progress: fade } : { state: 'none' },
        bpm: r.bpm,
        beats: r.beats,
        bar: r.bar + 1,
        beatInBar: r.beatInBar + 1,
        intensity,
        strobe,
        moving: (current.algorithm.moving ?? []).map((m) => ({ key: m.key, voice: m.voice, value: movingAt(m, intensity, r.beats) })),
        flash: flashNow,
        amounts: current.algorithm.amounts?.(),
        limiter: flashLimiter.state,
        peaks: peaks.recent(now),
        now,
      }),
    );
  });
  const metronome = new Metronome();
  const debug = new DebugOverlay(params.debug, seedText);
  new Sliders(live, (key, value) => {
    live[key] = value;
    remembered[key] = value;
    saveSettings(remembered);
  });

  // Taps: pointer down and key down, anywhere except the band. A tap
  // is timed when the event happened, not when a busy page got round to it.
  window.addEventListener('pointerdown', (e) => {
    if (band.hasTarget(e.target) || band.contains(e.clientY) || knobPanel.contains(e.target) || !isTapPointer(e)) return;
    clock.tap(e.timeStamp);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') band.hide();
    if (band.hasTarget(e.target) || knobPanel.contains(e.target) || !isTapKey(e)) return;
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
    const amounts = current.algorithm.amounts?.();
    const flashNow = amounts ? flash(flashLimiter.flashBeats, strobe, amounts, DEFAULT_SHAPE).total : 0;
    peaks.record(now, flashNow);
    seen = { r, intensity, strobe, flash: flashNow, fade, now };
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

    // the panel up (a press in the band) shows the widget as it was last seen and the metronome, whatever the taps; taps alone show the widget and the metronome
    const panel = band.update(now);
    const widget = widgetView(r, clock.tapMarks(), now);
    tapWidget.update({ ...widget, visible: widget.visible || panel });
    metronome.show(metronomeShown(widget.visible, panel));
    wheel.show(r.bpm);
    metronome.update(r);
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
