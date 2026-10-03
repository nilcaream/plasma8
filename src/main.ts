import { chooseAlgorithm } from './algorithms';
import type { Algorithm } from './algorithm';
import { TapClock } from './clock';
import { createContext } from './gl';
import { isTapKey, isTapPointer } from './input';
import { parseDebugParams } from './query';
import { createRng, formatSeed, freshSeed } from './rng';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Corner, DebugOverlay, Metronome, showFatal } from './ui';

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

  // A fresh seed every load: the same URL never looks the same twice.
  const seed = freshSeed();
  const rng = createRng(seed);
  const { def, unknown } = chooseAlgorithm(params.algo, rng);
  if (unknown) console.warn(`[plasma8] unknown algorithm "${params.algo}", picked one at random`);
  const algorithm: Algorithm = def.create(gl, rng);
  console.info(`[plasma8] algorithm ${algorithm.name}, seed ${formatSeed(seed)}`);

  const clock = new TapClock(performance.now(), params.bpm);

  const metronome = new Metronome();
  metronome.setEnabled(live.metronome);
  const debug = new DebugOverlay(params.debug, algorithm.name, formatSeed(seed));
  const corner = new Corner(live, (key, value) => {
    live[key] = value;
    remembered[key] = value;
    saveSettings(remembered);
    if (key === 'metronome') metronome.setEnabled(live.metronome);
  });

  // Taps: pointer down and key down, anywhere except the reserved corner.
  window.addEventListener('pointerdown', (e) => {
    if (corner.contains(e.target) || !isTapPointer(e)) return;
    clock.tap(performance.now());
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && corner.isOpen()) corner.setOpen(false);
    if (corner.contains(e.target) || !isTapKey(e)) return;
    clock.tap(performance.now());
  });

  const start = performance.now();
  let last = start;
  let calm = UNSYNCED_CALM;

  const frame = (): void => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;

    const r = clock.read(now);
    calm += ((r.synced ? 1 : UNSYNCED_CALM) - calm) * (1 - Math.exp(-dt / CALM_EASE_SECONDS));

    const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    algorithm.draw(null, {
      time: (now - start) / 1000,
      beatPhase: r.beatPhase,
      barPhase: r.barPhase,
      barCount: r.bar,
      intensity: live.intensity * calm,
      width,
      height,
    });

    if (live.metronome) metronome.update(r);
    debug.update(r);
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
