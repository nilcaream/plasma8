/**
 * The panel across the top of the page: the one place for every control (src/ui.ts,
 * src/tapWidget.ts, src/tempoWheel.ts). A touch or a move of the mouse anywhere shows
 * the whole panel (the metronome, the tapping widget, the tempo wheel, the sliders, the
 * buttons) and each touch starts the PANEL_MS again; then it fades. The panel's
 * controls are the only things on the page a press is not a press on: between them it
 * is transparent and a press falls through to the page. With ?debug the band is
 * outlined and the panel, the metronome included, is up from the load and never fades.
 */

/** The panel stays this long after the last touch, then fades. */
export const PANEL_MS = 5000;

/** Whether the panel is up: a finger or a mouse button is down on it, or the last touch was less than PANEL_MS ago; with ?debug (`pinned`) always. */
export function panelShown(lastTouchAt: number, now: number, held: boolean, pinned = false): boolean {
  return pinned || held || now - lastTouchAt < PANEL_MS;
}

/** Whether the metronome is up: the user is tapping, or the panel is (it is a part of it). */
export function metronomeShown(tapping: boolean, panel: boolean): boolean {
  return tapping || panel;
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

  /** `onPress` is called on every press in the band. */
  constructor(
    private readonly debug: boolean,
    onPress?: () => void,
  ) {
    const touch = (): void => {
      this.lastTouchAt = performance.now();
    };
    this.root.addEventListener('pointerdown', () => {
      this.held = true;
      touch();
      onPress?.();
    });
    const release = (): void => {
      if (!this.held) return;
      this.held = false;
      touch();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    // a slider moved, a key or the mouse wheel on the tempo wheel, the focus arriving by Tab
    this.root.addEventListener('input', touch);
    this.root.addEventListener('wheel', touch, { passive: true });
    this.root.addEventListener('keydown', touch);
    this.root.addEventListener('focusin', touch);
  }

  /** The panel comes back, or stays, for PANEL_MS more: a touch or a move of the mouse anywhere on the page. */
  touch(): void {
    this.lastTouchAt = performance.now();
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
    const shown = panelShown(this.lastTouchAt, now, this.held, this.debug);
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
