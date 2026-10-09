/**
 * What the tempo panel shows while the tempo is detected from the microphone (the tapping widget, src/tapWidget.ts):
 * the tempo, dim with "listening" until it is sure and bright after; an amber bar filled to the detector's confidence;
 * ten dots, one lit per agreeing beat fit of the last seconds. Only numbers the detector and src/sure.ts already produce.
 */

import { SURE_FITS } from './sure';

/** A beat heard longer ago than this is no beat heard now: the bar empties and the dots go dark (the detector's own beat flickers between fits). */
export const NO_BEAT_SECONDS = 2;
/** The dots lit when the tempo is sure. */
export const DETECT_DOTS = SURE_FITS;

export interface DetectInputs {
  /** The microphone is open or opening. */
  listening: boolean;
  /** The tempo is sure (and stays so until the next listen). */
  sure: boolean;
  /** Fits that agree in the last seconds (Sureness.agreeing). */
  agreeing: number;
  /** The detector's confidence 0..1 of the last analysis that heard a beat. */
  confidence: number;
  /** Seconds since an analysis heard a beat; null when none has this listen. */
  sinceBeat: number | null;
  /** The tempo in use, if the beat clock has read one. */
  bpm: number | null;
}

export interface DetectView {
  /** The tempo to write, '' before a first reading. */
  tempo: string;
  /** "listening" until the tempo is sure; '' else. */
  label: string;
  /** The number is dim: listening, not sure yet. */
  dim: boolean;
  /** 0..1, the amber bar's fill. */
  fill: number;
  /** Dots lit, 0..DETECT_DOTS. */
  dots: number;
}

export function detectView(i: DetectInputs): DetectView {
  const tempo = i.bpm === null ? '' : i.bpm.toFixed(2);
  const fill = Math.max(0, Math.min(1, i.confidence));
  // sure: the settled state, whether the microphone has closed or stays open (continuous listen)
  if (i.sure) return { tempo, label: '', dim: false, fill, dots: DETECT_DOTS };
  if (!i.listening) return { tempo, label: '', dim: false, fill: 0, dots: 0 };
  const hearing = i.sinceBeat !== null && i.sinceBeat <= NO_BEAT_SECONDS;
  return {
    tempo,
    label: 'listening',
    dim: true,
    fill: hearing ? fill : 0,
    dots: hearing ? Math.max(0, Math.min(DETECT_DOTS - 1, i.agreeing)) : 0,
  };
}
