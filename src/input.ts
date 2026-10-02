/** Which events count as a tap. Kept apart from the DOM wiring so it can be tested. */

export interface KeyLike {
  key: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/** Keys that do something else in a browser or only prepare another key. */
const NOT_TAPS = new Set(['Tab', 'Escape', 'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Dead']);

/** A key press is a tap unless it is held down, part of a shortcut, or one of the keys above. */
export function isTapKey(e: KeyLike): boolean {
  if (e.repeat) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return !NOT_TAPS.has(e.key);
}

export interface PointerLike {
  pointerType: string;
  button: number;
  isPrimary: boolean;
}

/** A touch or a primary-button press; right and middle clicks and second fingers are not taps. */
export function isTapPointer(e: PointerLike): boolean {
  if (!e.isPrimary) return false;
  return e.pointerType !== 'mouse' || e.button === 0;
}
