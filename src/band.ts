/**
 * The panel across the top of the page: the one place for every control (src/ui.ts,
 * src/tapWidget.ts). A touch or a move of the mouse anywhere shows the whole panel (the
 * metronome, the buttons, the tapping widget, the sliders) and each touch starts the
 * PANEL_MS again; then it fades, and the mouse pointer with it. It does not fade while the
 * microphone listens or the mouse pointer is in the band: the count starts when they stop. The band, the row the panel
 * occupies across the full width, panels and the gaps between them alike, is the one part of
 * the page a press is not a press on: it is no tempo tap and no bar 1, it only brings the
 * panel back. With ?debug the band is outlined and the panel is up from the load and never fades.
 */

/** The panel stays this long after the last touch, then fades. */
export const PANEL_MS = 5000;

/** Whether a press at height `y` (client pixels from the top) is in the band that ends at `bandBottom`. */
export function inBand(y: number, bandBottom: number): boolean {
  return y < bandBottom;
}

/** Whether the panel is up: a finger or a mouse button is down on it, or the last touch was less than PANEL_MS ago; with ?debug (`pinned`) always. */
export function panelShown(lastTouchAt: number, now: number, held: boolean, pinned = false): boolean {
  return pinned || held || now - lastTouchAt < PANEL_MS;
}

/**
 * The time of the last touch as the panel counts it: while the microphone listens, or while the mouse pointer is in the band,
 * the panel is touched all the time, so its PANEL_MS count starts when the microphone closes or the pointer leaves, or at the
 * last real touch, whichever is later.
 */
export function lastTouch(touchedAt: number, now: number, listening: boolean, inside: boolean): number {
  return listening || inside ? Math.max(touchedAt, now) : touchedAt;
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
  /** The mouse pointer is in the band. */
  private inside = false;
  /** Escape put the panel away: neither the microphone nor the pointer holds it up until the next touch. */
  private dismissed = false;
  private outline: HTMLElement | undefined;

  /** `onPress` is called on every press in the band. */
  constructor(
    private readonly debug: boolean,
    onPress?: () => void,
  ) {
    const touch = (): void => this.touch();
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
    // a slider moved, a key, the focus arriving by Tab
    this.root.addEventListener('input', touch);
    this.root.addEventListener('keydown', touch);
    this.root.addEventListener('focusin', touch);
  }

  /** The panel comes back, or stays, for PANEL_MS more: a touch or a move of the mouse anywhere on the page. */
  touch(): void {
    this.lastTouchAt = performance.now();
    this.dismissed = false;
  }

  /** The mouse pointer is at client height `y` (null: it left the page): in the band it holds the panel up, and the count starts when it leaves. */
  pointerAt(y: number | null): void {
    this.inside = y !== null && this.covers(y);
  }

  /** Whether a press at client height `y` is in the band. */
  covers(y: number): boolean {
    return inBand(y, this.root.getBoundingClientRect().bottom);
  }

  /** Whether the event target is one of the panel's controls: keys are taps unless the focus is in here. */
  hasTarget(target: EventTarget | null): boolean {
    return target instanceof Node && this.root.contains(target);
  }

  /** Puts the panel away at once. */
  hide(): void {
    this.held = false;
    this.dismissed = true;
    this.lastTouchAt = -Infinity;
  }

  /** Call once a frame, with whether the microphone listens; whether the panel is up. */
  update(now: number, listening = false): boolean {
    if (!this.dismissed) this.lastTouchAt = lastTouch(this.lastTouchAt, now, listening, this.inside);
    const shown = panelShown(this.lastTouchAt, now, this.held, this.debug);
    if (shown !== this.shown) {
      this.shown = shown;
      this.root.classList.toggle('shown', shown);
      // the mouse pointer goes with the panel and comes back with it
      document.body.classList.toggle('idle', !shown);
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
