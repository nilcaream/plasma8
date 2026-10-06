/**
 * The band across the top of the page: the one place for every control (src/ui.ts,
 * src/tapWidget.ts, src/tempoWheel.ts) and the only place where a tap is never a
 * tempo tap. A press anywhere in the band shows the whole panel (the metronome, the
 * tapping widget, the tempo wheel, the sliders) and each touch on it starts the
 * PANEL_MS again; then it fades. With ?debug the band is outlined.
 */

/** The panel stays this long after the last touch in the band, then fades. */
export const PANEL_MS = 5000;

/** Whether a point `y` pixels from the top of the page is in a band that ends at `bottom`; the bottom edge is outside. */
export function inBand(y: number, bottom: number): boolean {
  return y < bottom;
}

/** Whether the panel is up: a finger or a mouse button is down in the band, or the last touch was less than PANEL_MS ago. */
export function panelShown(lastTouchAt: number, now: number, held: boolean): boolean {
  return held || now - lastTouchAt < PANEL_MS;
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

export class Band {
  private readonly root = byId('bar');
  private lastTouchAt = -Infinity;
  private held = false;
  private shown = false;
  private outline: HTMLElement | undefined;

  constructor(private readonly debug: boolean) {
    const touch = (): void => {
      this.lastTouchAt = performance.now();
    };
    this.root.addEventListener('pointerdown', () => {
      this.held = true;
      touch();
    });
    const release = (): void => {
      if (!this.held) return;
      this.held = false;
      touch();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    // a slider moved, a key on the wheel, the focus arriving by Tab
    this.root.addEventListener('input', touch);
    this.root.addEventListener('keydown', touch);
    this.root.addEventListener('focusin', touch);
  }

  /** Whether a tap at this height of the page falls in the band. */
  contains(y: number): boolean {
    return inBand(y, this.root.getBoundingClientRect().bottom);
  }

  /** Whether the event target is one of the panel's controls: keys are taps unless the focus is in here. */
  hasTarget(target: EventTarget | null): boolean {
    return target instanceof Node && this.root.contains(target);
  }

  /** Puts the panel away at once. */
  hide(): void {
    this.held = false;
    this.lastTouchAt = -Infinity;
  }

  /** Call once a frame; whether the panel is up. */
  update(now: number): boolean {
    const shown = panelShown(this.lastTouchAt, now, this.held);
    if (shown !== this.shown) {
      this.shown = shown;
      this.root.classList.toggle('shown', shown);
      // keys are taps unless the focus is in here, so give the focus back
      if (!shown && this.hasTarget(document.activeElement)) (document.activeElement as HTMLElement).blur();
    }
    if (this.debug) this.drawOutline();
    return shown;
  }

  private drawOutline(): void {
    if (!this.outline) {
      this.outline = document.createElement('div');
      this.outline.className = 'tap-outline';
      document.body.appendChild(this.outline);
    }
    const r = this.root.getBoundingClientRect();
    this.outline.style.left = `${r.left}px`;
    this.outline.style.top = `${r.top}px`;
    this.outline.style.width = `${r.width}px`;
    this.outline.style.height = `${r.height}px`;
    this.outline.dataset.label = `band ${Math.round(r.width)}x${Math.round(r.height)}: no taps`;
  }
}
