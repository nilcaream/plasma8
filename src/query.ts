/**
 * Debug parameters in the URL. They pin a choice and never the random draw:
 * there is no parameter that sets the seed.
 */

import { toBpm } from './clock';
import { clamp01 } from './settings';

export interface DebugParams {
  /** Light this algorithm alone in "What plays", by name. */
  algo?: string;
  /** Start with this intensity instead of the remembered one. */
  intensity?: number;
  /** Start with this strobe instead of the remembered one. */
  strobe?: number;
  /** Start the free-running clock at this tempo (above 180 it is halved, as for taps); taps still change it. */
  bpm?: number;
  /** Show the knobs panel. */
  debug: boolean;
  /** With debug only: the kinds of the maze's flips to draw from, by name (`transition=card` or `card,ripple`); all of them when left out. */
  transitions?: string[];
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
  if (bpm !== undefined) out.bpm = toBpm(bpm);

  const debug = q.get('debug');
  out.debug = debug !== null && debug !== '0' && debug !== 'false';

  const transitions = q.get('transition')?.split(',').map((t) => t.trim()).filter((t) => t !== '');
  if (out.debug && transitions?.length) out.transitions = transitions;

  return out;
}
