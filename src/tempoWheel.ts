/**
 * The whole-number tempo wheel, a roller like an alarm clock's. It shows the
 * tempo rounded; dragging it up or down (finger or mouse) moves it one BPM
 * per WHEEL_ROW_PX, between MIN_BPM and MAX_BPM, and each whole number it
 * lands on becomes the tempo exactly. A notch of the mouse wheel over it moves one BPM.
 */

import { MAX_BPM, MIN_BPM } from './clock';

/** Pixels of drag per BPM: also the height of one row, so the numbers follow the finger. */
export const WHEEL_ROW_PX = 24;
/** Rows drawn: the one in the middle and two each side. */
export const WHEEL_ROWS = 5;

/** The wheel's position after dragging `dyPx` (positive is down) from the whole number `start`: up is a faster tempo. */
export function wheelPosition(start: number, dyPx: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, start - dyPx / WHEEL_ROW_PX));
}

/** The whole number after one notch of the mouse wheel (`deltaY`, negative is up) from `start`: one BPM, however far it scrolled; up is a faster tempo. */
export function wheelNotch(start: number, deltaY: number): number {
  const step = deltaY < 0 ? 1 : deltaY > 0 ? -1 : 0;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(start) + step));
}

export interface WheelRow {
  /** The number on the row; undefined past either end of the range. */
  value: number | undefined;
  /** Pixels from the middle of the wheel to the middle of the row. */
  y: number;
  opacity: number;
}

export function wheelRows(position: number): WheelRow[] {
  const centre = Math.round(position);
  return Array.from({ length: WHEEL_ROWS }, (_, i) => {
    const offset = i - (WHEEL_ROWS - 1) / 2;
    const value = centre + offset;
    const away = Math.abs(offset - (position - centre));
    return {
      value: value >= MIN_BPM && value <= MAX_BPM ? value : undefined,
      y: (offset - (position - centre)) * WHEEL_ROW_PX,
      opacity: Math.max(0.08, 1 - 0.45 * away),
    };
  });
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

export class TempoWheel {
  private readonly root = byId('tempo-wheel');
  private readonly rows = [...byId('tempo-wheel-rows').children] as HTMLElement[];
  private position = 0;
  private dragging = false;
  private startY = 0;
  private startValue = 0;
  private lastSet = 0;
  private drawn = '';

  constructor(private readonly onSet: (bpm: number) => void) {
    this.root.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      this.dragging = true;
      this.startY = e.clientY;
      this.startValue = Math.round(this.position);
      this.lastSet = this.startValue;
      try {
        // the finger can leave the wheel and still drag it; a pointer that has gone already throws, and the drag goes on without
        this.root.setPointerCapture(e.pointerId);
      } catch {
        // nothing to do
      }
      this.root.classList.add('dragging');
      e.preventDefault();
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.move(wheelPosition(this.startValue, e.clientY - this.startY));
    });
    const end = (): void => {
      if (!this.dragging) return;
      this.dragging = false;
      this.root.classList.remove('dragging');
      this.move(Math.round(this.position));
      // keys are taps unless the focus is in here, so give the focus back
      this.root.blur();
    };
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
    // only while the panel is up: a part that is hidden takes no events. The page never scrolls under it.
    this.root.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (!this.dragging) this.move(wheelNotch(this.position, e.deltaY));
      },
      { passive: false },
    );
    this.root.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      e.preventDefault();
      this.move(wheelPosition(Math.round(this.position), -step * WHEEL_ROW_PX));
    });
  }

  /** Follows the clock's tempo (rounded) unless a finger is on the wheel. */
  show(bpm: number): void {
    if (this.dragging) return;
    this.position = Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
    this.draw();
  }

  private move(position: number): void {
    this.position = position;
    const value = Math.round(position);
    if (value !== this.lastSet) {
      this.lastSet = value;
      this.onSet(value);
    }
    this.draw();
  }

  private draw(): void {
    const rows = wheelRows(this.position);
    const key = rows.map((r) => `${r.value}:${r.y.toFixed(1)}`).join(',');
    if (key === this.drawn) return;
    this.drawn = key;
    this.root.setAttribute('aria-valuenow', String(Math.round(this.position)));
    rows.forEach((r, i) => {
      const el = this.rows[i]!;
      el.textContent = r.value === undefined ? '' : String(r.value);
      el.style.transform = `translateY(${r.y.toFixed(1)}px)`;
      el.style.opacity = r.opacity.toFixed(2);
    });
  }
}
