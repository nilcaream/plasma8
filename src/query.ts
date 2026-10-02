/**
 * Debug parameters in the URL. They pin a choice and never the random draw:
 * there is no parameter that sets the seed.
 */

import { MAX_BPM, MIN_BPM } from './clock';
import { clamp01 } from './settings';

export interface DebugParams {
  /** Force this algorithm by name. */
  algo?: string;
  /** Start with this intensity instead of the remembered one. */
  intensity?: number;
  /** Start with this strobe instead of the remembered one. */
  strobe?: number;
  /** Start the free-running clock at this tempo; taps still change it. */
  bpm?: number;
  /** Show the overlay with the algorithm's name and the bar count. */
  debug: boolean;
}

function number(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDebugParams(search: string): DebugParams {
  const q = new URLSearchParams(search);
  const out: DebugParams = { debug: false };

  const algo = q.get('algo')?.trim();
  if (algo) out.algo = algo;

  const intensity = number(q.get('intensity'));
  if (intensity !== undefined) out.intensity = clamp01(intensity);

  const strobe = number(q.get('strobe'));
  if (strobe !== undefined) out.strobe = clamp01(strobe);

  const bpm = number(q.get('bpm'));
  if (bpm !== undefined) out.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));

  const debug = q.get('debug');
  out.debug = debug !== null && debug !== '0' && debug !== 'false';

  return out;
}
