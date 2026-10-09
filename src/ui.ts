import type { ClockReading } from './clock';
import { settingPatch, type Settings } from './settings';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

/** The intensity and strobe sliders, a part of the panel in the band (src/band.ts). */
export class Sliders {
  private readonly intensity = byId<HTMLInputElement>('intensity');
  private readonly strobe = byId<HTMLInputElement>('strobe');

  constructor(
    settings: Settings,
    private readonly onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void,
  ) {
    this.intensity.value = String(settings.intensity);
    this.strobe.value = String(settings.strobe);
    this.showValues();

    this.intensity.addEventListener('input', () => {
      this.showValues();
      this.onChange('intensity', this.intensity.valueAsNumber);
    });
    this.strobe.addEventListener('input', () => {
      this.showValues();
      this.onChange('strobe', this.strobe.valueAsNumber);
    });
  }

  private showValues(): void {
    byId('intensity-value').textContent = this.intensity.valueAsNumber.toFixed(2);
    const strobe = this.strobe.valueAsNumber;
    byId('strobe-value').textContent = strobe === 0 ? 'off' : strobe.toFixed(2);
  }
}

/**
 * The panel's buttons: tempo source, continuous listen, the visual's min and max length, what plays. Each button names its
 * setting and value in `data-setting` and `data-value`; the one whose value is the setting's is pressed (`aria-pressed`),
 * which the look lights. A press changes the setting through `settingPatch` and tells `onChange`.
 */
export class Panel {
  private readonly root = byId('switches');
  private readonly buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button[data-setting]')];
  private readonly listen = byId('group-listen');
  private readonly dot = byId('mic-dot');
  private readonly note = byId('mic-note');

  constructor(
    private readonly current: () => Settings,
    onChange: (patch: Partial<Settings>) => void,
  ) {
    this.root.addEventListener('click', (e) => {
      const button = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button[data-setting]') : null;
      if (!button || button.disabled) return;
      const patch = settingPatch(this.current(), button.dataset.setting ?? '', button.dataset.value ?? '');
      if (patch) onChange(patch);
    });
  }

  /** Marks the pressed buttons; continuous listen is for the source Detect only. */
  sync(s: Settings): void {
    for (const b of this.buttons) {
      const value = b.dataset.value;
      const pressed =
        b.dataset.setting === 'source' ? s.source === value
        : b.dataset.setting === 'continuous' ? (s.continuous ? 'on' : 'off') === value
        : b.dataset.setting === 'min' ? String(s.minBars) === value
        : b.dataset.setting === 'max' ? String(s.maxBars) === value
        : s.plays === value;
      b.setAttribute('aria-pressed', String(pressed));
      if (b.closest('#group-listen')) b.disabled = s.source !== 'detect';
    }
    this.listen.classList.toggle('inactive', s.source !== 'detect');
  }

  /** The red dot is on whenever the microphone listens, and stays when the panel has faded; the note says why it does not. */
  showMic(listening: boolean, note: string): void {
    this.dot.hidden = !listening;
    if (this.note.textContent !== note) this.note.textContent = note;
  }
}

/** A dot that pulses on every beat and looks different on beat 1, a part of the panel in the band. The tempo is written by the tapping widget (src/tapWidget.ts). */
export class Metronome {
  private readonly root = byId('metronome');
  private readonly dot = byId('dot');
  private first: boolean | undefined;
  private visible: boolean | undefined;

  /** Shows the metronome on its own, when the panel is not up: while the tapping widget shows. */
  show(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.classList.toggle('shown', visible);
  }

  update(r: ClockReading): void {
    const first = r.beatInBar === 0;
    if (first !== this.first) {
      this.first = first;
      this.dot.classList.toggle('first', first);
    }
    const pulse = 1 + (first ? 0.7 : 0.5) * (1 - r.beatPhase) ** 3;
    this.dot.style.transform = `scale(${pulse.toFixed(3)})`;
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
      ? 'no changes (algorithm held)'
      : `next change in ${info.barsLeft} bar${info.barsLeft === 1 ? '' : 's'}${info.change ? ` (${info.change})` : ''}`;
    const text = [
      `${info.name}  home ${info.home.toFixed(2)}`,
      next,
      `bar ${r.bar + 1}  beat ${r.beatInBar + 1}`,
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
