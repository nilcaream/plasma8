/**
 * The slider ranges of the graph pages, all read from the app's own
 * constants, so a page can never be set to a value the app cannot have.
 * Random: exactly the range the app draws from. Live: exactly the range the
 * app accepts. Fixed in code: a wide span for trying values, up to where the
 * maths breaks (a rise longer than the window, a fall power or damping of 0).
 */
import { AMOUNT_RANGE, GAIN_RANGE, MAX_RISE, POWER_RANGE } from './beatVoices';
import { MAX_BPM, MIN_BPM } from './clock';
import { REACH_POWER_RANGE, TRAVEL_RANGE } from './crossfader';
import { DAMPING_RANGE, FACTOR_RANGES, OFFSET_RANGE, WIDTH_SHARE_RANGE } from './harmonics';
import { STEP_AT_1_RANGE } from './randomWalk';
import { clamp01 } from './settings';

export interface Range { min: number; max: number }

const range = ([min, max]: readonly [number, number]): Range => ({ min, max });

export const LIVE = {
  /** What the app clamps a stored or linked intensity to. */
  intensity: { min: clamp01(-Infinity), max: clamp01(Infinity) },
  /** What the tap clock clamps its tempo to. */
  bpm: { min: MIN_BPM, max: MAX_BPM },
};

export const BEATS = {
  amount: range(AMOUNT_RANGE),
  rise: { min: 0, max: MAX_RISE },
  power: range(POWER_RANGE),
  gain: range(GAIN_RANGE),
};

/** An example algorithm's outer bounds for one free parameter, and the least room between L and H. */
export const BOUNDS = { min: 0, max: 10, gap: 0.1 };

/**
 * The crossfader's example parameter: its outer bounds (the same example as the
 * harmonics page), the range an instance draws inside them (the min can be as
 * high as the bounds' top less the narrowest width, the max as low as the
 * bounds' bottom plus it), and the stroke's length.
 */
const CROSSFADER_BOUNDS = { lo: 2, hi: 8 };
const narrowest = (CROSSFADER_BOUNDS.hi - CROSSFADER_BOUNDS.lo) * WIDTH_SHARE_RANGE[0];
export const CROSSFADER = {
  bounds: CROSSFADER_BOUNDS,
  min: { min: CROSSFADER_BOUNDS.lo, max: CROSSFADER_BOUNDS.hi - narrowest },
  max: { min: CROSSFADER_BOUNDS.lo + narrowest, max: CROSSFADER_BOUNDS.hi },
  travel: range(TRAVEL_RANGE),
};

/** The random walk's sliders: the crossfader's stroke lengths, the step at intensity 1 as a share of the range, and the power of the intensity. */
export const RANDOM_WALK = {
  travel: CROSSFADER.travel,
  step: range(STEP_AT_1_RANGE),
  power: range(REACH_POWER_RANGE),
};

export const HARMONICS = {
  factors: FACTOR_RANGES.map(range),
  width: range(WIDTH_SHARE_RANGE),
  offset: range(OFFSET_RANGE),
  damping: range(DAMPING_RANGE),
};
