import './style.css';
import { ALGORITHMS, chooseAlgorithm } from './algorithms';
import type { Algorithm, AlgorithmDef, FrameInputs } from './algorithm';
import { Band, metronomeShown } from './band';
import { DEFAULT_SHAPE, flash } from './beatVoices';
import { TapClock, clampBpm, formatTempo, type ClockReading } from './clock';
import { DetectClock } from './detectClock';
import { beatInputs } from './drive';
import { FlashPeaks, amountsText, formatDump, movingText } from './dump';
import { FlashLimiter } from './flashLimit';
import { createContext } from './gl';
import { isTapKey, isTapPointer } from './input';
import { KnobPanel } from './knobPanel';
import type { Values } from './knobs';
import { MicTempo } from './micTempo';
import { HoldWatch } from './press';
import { parseDebugParams } from './query';
import { createRng, formatSeed, freshSeed } from './rng';
import { Sequencer, type Change } from './sequence';
import { loadSettings, saveSettings, type Settings } from './settings';
import { MotionClock, motionRate, motionTimeFor, steadyRate } from './motion';
import { movingAt } from './moving';
import { Stage, TRANSITION_STYLES, drawTransitionLook, type TransitionLook } from './stage';
import { Sureness } from './sure';
import { TapWidget, widgetView, type WidgetView } from './tapWidget';
import { TempoWheel } from './tempoWheel';
import { DebugOverlay, Metronome, Panel, Sliders, showFatal } from './ui';

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
      const list = algorithm.moving.map((m) => `${m.key} ${m.min.toFixed(3)}..${m.max.toFixed(3)} by the ${m.voice}`);
      console.info(`[plasma8] ${def.name}: ${algorithm.moving.length} values move: ${list.join('; ')}`);
    }
    return { def, values, algorithm };
  };
  // the panel's "What plays": one algorithm, in a new variant of itself at every change, or undefined: the changes pick
  const playing = (): string | undefined => (ALGORITHMS.some((a) => a.name === live.plays) ? live.plays : undefined);
  const make = (intensity: number, running?: AlgorithmDef): Running => {
    const { def, unknown } = chooseAlgorithm(playing() ?? forced, intensity, rng, running);
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
  const sequencer = new Sequencer(rng, 0, known !== undefined, { min: live.minBars, max: live.maxBars });
  const motion = new MotionClock();
  const steady = new MotionClock();
  let current = make(live.intensity);
  let incoming: Running | undefined;
  let look: TransitionLook | undefined;
  announce(current, sequencer.segment.bars, 'to start');
  knobPanel.show(current);

  // The visuals' clock is the tap clock or the detect clock, by the tempo source; `starts` counts the fresh counts (a press
  // that is beat 1 of bar 1), which the sequencer takes as "the next visual starts now".
  let tapClock = new TapClock(performance.now(), params.bpm);
  let detectClock = new DetectClock(performance.now());
  let starts = 0;
  const reading = (now: number): ClockReading => (live.source === 'tap' ? tapClock.read(now) : detectClock.read(now));
  // the panel's picker: an algorithm switches in at once with fresh values and is held like ?algo=; "changes" gives it back to the sequencer
  const pick = (name: string | undefined): void => {
    forced = name;
    if (name === undefined) {
      sequencer.release(reading(performance.now()).beats);
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
  // (while the tempo is detected the wheel only shows it)
  const wheel = new TempoWheel((bpm) => {
    if (live.source === 'tap') tapClock.setBpm(bpm, performance.now());
  });
  // the band across the top: every control lives there, and a press on one of its controls is never a tempo tap (src/band.ts)
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
  const remember = (patch: Partial<Settings>): void => {
    Object.assign(live, patch);
    Object.assign(remembered, patch);
    saveSettings(remembered);
  };
  new Sliders(live, (key, value) => remember({ [key]: value } as Partial<Settings>));

  // --- the microphone (Detect) ---
  // It listens always (continuous) or from a press held for LISTEN_HOLD_MS until the tempo is sure. The detector, its beat
  // clock and the page-clock strobe are the /tempo/ page's (src/micTempo.ts); the detect clock reads the beat clock's wall.
  const mic = new MicTempo();
  const sure = new Sureness();
  const panel = new Panel(() => live, (patch) => apply(patch));
  const listen = (ctx?: AudioContext): void => {
    if (mic.listening || mic.arming) {
      void ctx?.close();
      return;
    }
    sure.reset();
    void mic.arm(ctx).then((ok) => {
      if (!ok) console.warn(`[plasma8] the microphone could not be opened: ${mic.error}`);
      else console.info(`[plasma8] listening: ${mic.facts.replace(/\n/g, '; ')}`);
    });
  };
  mic.onAnalysis = (a) => {
    // an analysis without a beat comes with nothing new: the clock and the sureness skip it
    if (!sure.update(a, mic.clock.beat === null ? null : mic.clock.bpm)) return;
    if (live.source === 'detect' && !live.continuous && mic.listening) {
      mic.disarm();
      console.info(`[plasma8] the tempo is sure, ${mic.clock.bpm.toFixed(2)} BPM: the microphone is closed`);
    }
  };

  // --- the settings the panel changes ---
  const apply = (patch: Partial<Settings>): void => {
    const now = performance.now();
    const before = { ...live };
    remember(patch);
    if (live.source !== before.source) {
      const r = reading(now);
      // the other clock takes over at the beat the first was at, so the picture does not jump
      if (live.source === 'detect') {
        detectClock = new DetectClock(now - (r.beats * 60000) / r.bpm, r.bpm);
        if (live.continuous) listen();
      } else {
        mic.disarm();
        tapClock = new TapClock(now - (r.beats * 60000) / r.bpm, clampBpm(r.bpm));
      }
    }
    if (live.source === 'detect') {
      // continuous listen turned on: listen now; turned off while the tempo is sure already: stop now
      if (live.continuous && !before.continuous) listen();
      if (!live.continuous && before.continuous && sure.sure) mic.disarm();
    }
    if (live.minBars !== before.minBars || live.maxBars !== before.maxBars) sequencer.setRange({ min: live.minBars, max: live.maxBars });
    if (live.plays !== before.plays) {
      const name = playing();
      if (name !== undefined && name !== current.def.name) {
        // the one algorithm is on at once, in a variant of its own, and its first length is counted from here
        incoming?.algorithm.dispose();
        incoming = undefined;
        look = undefined;
        current.algorithm.dispose();
        current = create(ALGORITHMS.find((a) => a.name === name)!);
        knobPanel.show(current);
        sequencer.release(reading(now).beats);
        announce(current, sequencer.segment.bars, 'playing alone');
      }
    }
    panel.sync(live);
  };
  panel.sync(live);
  // After a reload with Continuous on, the microphone starts on the first press (a browser wants a gesture for it).
  let micAskedByPress = false;
  const mayListenOnPress = (): boolean => {
    const ask = live.source === 'detect' && live.continuous && !mic.listening && !mic.arming && !micAskedByPress;
    if (ask) micAskedByPress = true;
    return ask;
  };

  // --- presses ---
  // A press (a touch, a click or a key down, not its release) anywhere except on the panel's controls is beat 1 of bar 1 and
  // the next visual starts. Tap: more presses within a second are the tap tempo. Detect: only that hint, and follow-up
  // presses are ignored. A press timed when the event happened, not when a busy page got round to it.
  const hold = new HoldWatch();
  let prepared: AudioContext | undefined;
  const drop = (): void => {
    void prepared?.close();
    prepared = undefined;
  };
  const press = (owner: string, at: number): void => {
    if (live.source === 'tap') {
      const run = tapClock.read(at).run;
      tapClock.tap(at);
      if (tapClock.read(at).run !== run) starts++;
      return;
    }
    if (detectClock.press(at)) starts++;
    hold.down(owner, at);
    // the context is made inside the press, so Safari lets it run when the press has been held long enough
    if (!live.continuous && !mic.listening && !prepared && hold.held) prepared = new AudioContext();
  };
  window.addEventListener('pointerdown', (e) => {
    band.touch();
    const ask = mayListenOnPress();
    if (ask) listen();
    if (band.hasTarget(e.target) || knobPanel.contains(e.target) || !isTapPointer(e)) return;
    press(`pointer ${e.pointerId}`, e.timeStamp);
  });
  const release = (owner: string): void => {
    hold.up(owner);
    if (!hold.held) drop();
  };
  window.addEventListener('pointerup', (e) => release(`pointer ${e.pointerId}`));
  window.addEventListener('pointercancel', (e) => release(`pointer ${e.pointerId}`));
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') band.touch();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') band.hide();
    if (mayListenOnPress()) listen();
    if (band.hasTarget(e.target) || knobPanel.contains(e.target) || !isTapKey(e)) return;
    band.touch();
    press(`key ${e.code}`, e.timeStamp);
  });
  window.addEventListener('keyup', (e) => release(`key ${e.code}`));

  const start = performance.now();
  let last = start;
  let pending = 'change';

  const frame = (): void => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    // a press held for half a second asks the microphone to listen (tempo source Detect, continuous listen off)
    if (hold.due(now) && live.source === 'detect' && !live.continuous && !mic.listening) {
      const ctx = prepared;
      prepared = undefined;
      listen(ctx);
    }
    // the microphone's beat clock, carried to now, keeps the detect clock's wall; the clock runs on by itself once the microphone is closed
    if (mic.listening) mic.beatsAt(now);
    detectClock.setWall(mic.beatWall, now);

    const r = reading(now);
    const intensity = live.intensity;
    const beat = beatInputs(r, intensity);

    // Changes: the next algorithm is made a bar ahead, and takes over on beat 1; a press that is beat 1 of bar 1 takes over at once.
    const step = sequencer.update(r.beats, starts, intensity);
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
    const panelUp = band.update(now);
    // the tapping widget is the tap clock's; while the tempo is detected it only shows the tempo, when the panel is up
    const widget: WidgetView =
      live.source === 'tap'
        ? widgetView(r, tapClock.tapMarks(), now)
        : { visible: false, dots: undefined, marks: [], text: formatTempo(r.bpm, undefined), green: false };
    tapWidget.update({ ...widget, visible: widget.visible || panelUp });
    metronome.show(metronomeShown(widget.visible, panelUp));
    panel.showMic(mic.listening, mic.error ? `The microphone could not be opened (${mic.error}).` : '');
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
    // what an end-to-end run reads (the /tempo/ page has its own __tempo)
    (window as unknown as { __plasma8: unknown }).__plasma8 = {
      settings: live, listening: mic.listening, arming: mic.arming, error: mic.error, sure: sure.sure,
      bpm: r.bpm, beats: r.beats, bar: r.bar, beatInBar: r.beatInBar, starts, name: current.def.name, barsLeft: sequencer.barsLeft(r.beats),
      segmentBars: sequencer.segment.bars, micBpm: mic.clock.beat === null ? null : mic.clock.bpm,
    };
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
