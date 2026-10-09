/**
 * The tapping widget at the top centre, a part of the panel in the band (src/band.ts): while the first taps of a run
 * come in, 4 dots fill; once the tempo is set, a strip shows each tap left
 * (early) or right (late) of the beat mark, and the tempo is written under it.
 * It fades a while after the last tap.
 */

import { formatTempo, TEMPO_TAPS, type ClockReading, type TapMark } from './clock';
import { DETECT_DOTS, type DetectView } from './detectView';

/** The widget stays this long after the last tap outside the band, then fades; the panel (src/band.ts) shows it too. */
export const HOLD_MS = 3500;
/** The strip spans this many ms each side of the beat mark; a tap further off sits at the end. */
export const STRIP_RANGE_MS = 100;
/** The tempo turns green when its standard error is below this (BPM): a hand steady to about 20 ms over a full window. */
export const GREEN_BELOW_BPM = 0.5;
/** Taps drawn on the strip. */
export const STRIP_TAPS = 24;

export interface StripMark {
  /** -1 (early end) … 1 (late end). */
  x: number;
  /** 0..1 */
  opacity: number;
  /** Still one of the taps the tempo is fitted through. */
  bright: boolean;
}

export interface WidgetView {
  visible: boolean;
  /** Dots filled while counting in; undefined once the tempo is set and the strip shows. */
  dots: number | undefined;
  /** Newest last. */
  marks: StripMark[];
  text: string;
  green: boolean;
  /** While the tempo is detected: the panel shows this (src/detectView.ts) instead of the dots and the strip. */
  detect?: DetectView;
}

/** How a tap shows: a bright one is in the window and fades with age; an older one is faint and fades further. */
function opacityOf(bright: boolean, age: number): number {
  return bright ? 1 - 0.45 * Math.min(1, age / 11) : Math.max(0.08, 0.3 - 0.02 * (age - 11));
}

export function widgetView(r: ClockReading, marks: readonly TapMark[], now: number): WidgetView {
  const visible = r.synced && now - r.lastTapAt < HOLD_MS;
  const counting = r.taps < TEMPO_TAPS;
  const shown: StripMark[] = [];
  if (!counting) {
    const drawn = marks.filter((m) => m.offsetMs !== undefined).slice(-STRIP_TAPS);
    drawn.forEach((m, i) => {
      const x = Math.max(-1, Math.min(1, (m.offsetMs as number) / STRIP_RANGE_MS));
      shown.push({ x, opacity: opacityOf(m.inWindow, drawn.length - 1 - i), bright: m.inWindow });
    });
  }
  const error = counting ? undefined : r.bpmError;
  return {
    visible,
    dots: counting ? r.taps : undefined,
    marks: shown,
    text: formatTempo(r.bpm, error),
    green: error !== undefined && error < GREEN_BELOW_BPM,
  };
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

/** Draws a WidgetView, touching the page only where it changed. */
export class TapWidget {
  private readonly root = byId('tap-widget');
  private readonly dots = [...byId('tap-dots').children] as HTMLElement[];
  private readonly strip = byId('tap-strip');
  private readonly number = byId('tap-number');
  private readonly value = byId('tap-value');
  private readonly label = byId('tap-label');
  private readonly detectDots = byId('detect-dots');
  private readonly fill = byId('detect-fill');
  private readonly ticks: HTMLElement[] = [];
  private visible: boolean | undefined;
  private filled: number | undefined = -1;
  private text = '';
  private green: boolean | undefined;
  private marksKey = '';
  private detecting: boolean | undefined;
  private detect: DetectView | undefined;

  constructor() {
    for (let i = 0; i < STRIP_TAPS; i++) {
      const tick = document.createElement('i');
      tick.style.display = 'none';
      this.strip.appendChild(tick);
      this.ticks.push(tick);
    }
    for (let i = 0; i < DETECT_DOTS; i++) this.detectDots.appendChild(document.createElement('i'));
  }

  private updateDetect(d: DetectView | undefined): void {
    if ((d !== undefined) !== this.detecting) {
      this.detecting = d !== undefined;
      this.root.classList.toggle('detect', this.detecting);
    }
    const last = this.detect;
    if (!d || (last && last.tempo === d.tempo && last.label === d.label && last.dim === d.dim && last.fill === d.fill && last.dots === d.dots)) {
      if (!d && last) {
        this.detect = undefined;
        this.root.classList.remove('dim');
        this.label.textContent = '';
      }
      return;
    }
    this.detect = d;
    this.root.classList.toggle('dim', d.dim);
    this.label.textContent = d.label;
    this.fill.style.width = `${(d.fill * 100).toFixed(1)}%`;
    [...this.detectDots.children].forEach((dot, i) => dot.classList.toggle('on', i < d.dots));
  }

  update(view: WidgetView): void {
    this.updateDetect(view.detect);
    if (view.visible !== this.visible) {
      this.visible = view.visible;
      this.root.classList.toggle('shown', view.visible);
    }
    if (view.dots !== this.filled) {
      this.filled = view.dots;
      this.root.classList.toggle('counting', view.dots !== undefined);
      this.dots.forEach((d, i) => d.classList.toggle('on', view.dots !== undefined && i < view.dots));
    }
    if (view.text !== this.text) {
      this.text = view.text;
      this.value.textContent = view.text;
    }
    if (view.green !== this.green) {
      this.green = view.green;
      this.number.classList.toggle('green', view.green);
    }
    const key = view.marks.map((m) => `${m.x.toFixed(3)}:${m.opacity.toFixed(2)}`).join(',');
    if (key !== this.marksKey) {
      this.marksKey = key;
      this.ticks.forEach((tick, i) => {
        const m = view.marks[i];
        tick.style.display = m ? '' : 'none';
        if (m) {
          tick.style.left = `${((m.x + 1) * 50).toFixed(2)}%`;
          tick.style.opacity = m.opacity.toFixed(2);
          tick.classList.toggle('old', !m.bright);
        }
      });
    }
  }
}
