/**
 * The vertical axis of the /tempo/ page's "reading over time" panel. The current detection is always in the middle;
 * steady, the axis spans one BPM either way, and when older values lie further off it widens on both sides at once so
 * that every value of both lines in the window is in view. It narrows again as those values leave the window.
 */

/** The axis never spans less than this many BPM either side of the middle. */
export const MIN_HALF = 1;
/** The room kept beyond the furthest value, so a line at the edge (and the beat's wide band) is not cut off by the frame. */
const PAD = 1.12;
/** A tick this close outside the axis (BPM) still counts: a reading of 127.9999 has 129 at its top. */
const EDGE = 0.01;
/** Whole-BPM tick steps, the smallest one that puts at most MAX_TICKS labels on the axis is used. */
const STEPS = [1, 2, 5, 10, 20, 50];
const MAX_TICKS = 9;

export interface HistoryAxis {
  /** The value in the vertical middle. */
  centre: number;
  lo: number;
  hi: number;
  /** Whole BPM, ascending, all within lo..hi. */
  ticks: number[];
}

/**
 * The axis for the two lines over the window, oldest value first, null where a line has no reading. The middle is the
 * current detection (its latest reading); with no detection yet it is the latest beat clock tempo; with neither the
 * panel is empty (null).
 */
export function historyAxis(detection: readonly (number | null)[], beat: readonly (number | null)[]): HistoryAxis | null {
  const last = (xs: readonly (number | null)[]): number | null => {
    for (let i = xs.length - 1; i >= 0; i--) if (xs[i] !== null) return xs[i]!;
    return null;
  };
  const centre = last(detection) ?? last(beat);
  if (centre === null) return null;
  let far = 0;
  for (const v of [...detection, ...beat]) if (v !== null) far = Math.max(far, Math.abs(v - centre));
  const half = Math.max(MIN_HALF, far * PAD);
  const lo = centre - half, hi = centre + half;
  const first = (s: number): number => Math.ceil((lo - EDGE) / s) * s;
  const step = STEPS.find((s) => Math.floor((hi + EDGE) / s) - first(s) / s + 1 <= MAX_TICKS) ?? STEPS[STEPS.length - 1]!;
  const ticks: number[] = [];
  for (let t = first(step); t <= hi + EDGE; t += step) ticks.push(t);
  return { centre, lo, hi, ticks };
}
