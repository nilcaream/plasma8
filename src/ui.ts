import { formatTempo, type ClockReading } from './clock';
import type { Settings } from './settings';

/** How long the menu icon stays visible after the last movement or touch. */
const ICON_IDLE_MS = 3500;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

/**
 * The reserved upper-right corner: a faint icon that fades when nothing moves,
 * and the small menu it opens. Nothing in here is a tap area.
 */
export class Corner {
  private readonly root = byId('corner');
  private readonly button = byId<HTMLButtonElement>('menu-button');
  private readonly intensity = byId<HTMLInputElement>('intensity');
  private readonly strobe = byId<HTMLInputElement>('strobe');
  private readonly metronome = byId<HTMLInputElement>('metronome-toggle');
  private idleTimer: number | undefined;

  constructor(
    settings: Settings,
    private readonly onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void,
  ) {
    this.intensity.value = String(settings.intensity);
    this.strobe.value = String(settings.strobe);
    this.metronome.checked = settings.metronome;
    this.showValues();

    this.button.addEventListener('click', () => this.setOpen(!this.isOpen()));
    this.intensity.addEventListener('input', () => {
      this.showValues();
      this.onChange('intensity', this.intensity.valueAsNumber);
    });
    this.strobe.addEventListener('input', () => {
      this.showValues();
      this.onChange('strobe', this.strobe.valueAsNumber);
    });
    this.metronome.addEventListener('change', () => this.onChange('metronome', this.metronome.checked));

    for (const type of ['pointermove', 'pointerdown', 'touchstart']) {
      window.addEventListener(type, () => this.wake(), { passive: true });
    }
    this.wake();
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.root.contains(target);
  }

  isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  setOpen(open: boolean): void {
    this.root.classList.toggle('open', open);
    this.button.setAttribute('aria-expanded', String(open));
    // Keys are taps unless the focus is in here, so give the focus back.
    if (!open && this.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.wake();
  }

  private wake(): void {
    this.root.classList.add('awake');
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      if (!this.isOpen()) this.root.classList.remove('awake');
    }, ICON_IDLE_MS);
  }

  private showValues(): void {
    byId('intensity-value').textContent = this.intensity.valueAsNumber.toFixed(2);
    const strobe = this.strobe.valueAsNumber;
    byId('strobe-value').textContent = strobe === 0 ? 'off' : strobe.toFixed(2);
  }
}

/** A dot that pulses on every beat and looks different on beat 1, with the tempo beside it. */
export class Metronome {
  private readonly root = byId('metronome');
  private readonly dot = byId('dot');
  private readonly bpm = byId('bpm');
  private first: boolean | undefined;
  private text = '';
  private free: boolean | undefined;

  setEnabled(on: boolean): void {
    this.root.classList.toggle('on', on);
  }

  update(r: ClockReading): void {
    const first = r.beatInBar === 0;
    if (first !== this.first) {
      this.first = first;
      this.dot.classList.toggle('first', first);
    }
    const pulse = 1 + (first ? 0.7 : 0.5) * (1 - r.beatPhase) ** 3;
    this.dot.style.transform = `scale(${pulse.toFixed(3)})`;

    const text = formatTempo(r.bpm, r.bpmError);
    if (text !== this.text) {
      this.text = text;
      this.bpm.textContent = text;
    }
    const free = !r.synced;
    if (free !== this.free) {
      this.free = free;
      this.bpm.classList.toggle('free', free);
    }
  }
}

/** What the ?debug overlay shows besides the clock. */
export interface DebugInfo {
  name: string;
  home: number;
  /** Bars before the next change, counting the bar under way. */
  barsLeft: number;
  /** How the next change goes, once it is decided: "cut", "fade 2 beats". */
  change: string | undefined;
  intensity: number;
  /** The strobe slider: the flash's size and shape. */
  strobe: number;
  /** Motion speed against the algorithm's designed speed. */
  rate: number;
}

/** The ?debug overlay. */
export class DebugOverlay {
  private readonly root = byId('debug');
  private text = '';

  constructor(
    private readonly enabled: boolean,
    private readonly seed: string,
  ) {
    this.root.classList.toggle('on', enabled);
  }

  update(r: ClockReading, info: DebugInfo): void {
    if (!this.enabled) return;
    const next = !Number.isFinite(info.barsLeft)
      ? 'no changes (held by ?algo=)'
      : `next change in ${info.barsLeft} bar${info.barsLeft === 1 ? '' : 's'}${info.change ? ` (${info.change})` : ''}`;
    const text = [
      `${info.name}  home ${info.home.toFixed(2)}`,
      next,
      `bar ${r.bar + 1}  beat ${r.beatInBar + 1}  ${formatTempo(r.bpm, r.bpmError)} BPM`,
      `intensity ${info.intensity.toFixed(2)}  speed x${info.rate.toFixed(2)}  strobe ${info.strobe === 0 ? 'off' : info.strobe.toFixed(2)}`,
      `seed ${this.seed}`,
    ].join('\n');
    if (text !== this.text) {
      this.text = text;
      this.root.textContent = text;
    }
  }
}

export function showFatal(message: string): void {
  const el = byId('fatal');
  el.textContent = message;
  el.style.display = 'flex';
}
