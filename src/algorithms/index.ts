import type { AlgorithmDef } from '../algorithm';
import { pickByIntensity } from '../pick';
import type { Rng } from '../rng';
import { julia } from './julia';
import { plasma } from './plasma';
import { tunnel } from './tunnel';
import { warpNoise } from './warpNoise';

export const ALGORITHMS: readonly AlgorithmDef[] = [warpNoise, plasma, julia, tunnel];

/**
 * The next algorithm to run: the one asked for by name, every time, else a
 * fuzzy pick by intensity in which the one running now weighs less, among the
 * `allowed` names (all when none is given or none of them is known); a single
 * allowed one is picked every time. An unknown name is not an error; `unknown`
 * says so, and the pick stands.
 */
export function chooseAlgorithm(
  requested: string | undefined,
  intensity: number,
  rng: Rng,
  running?: AlgorithmDef,
  allowed?: readonly string[],
): { def: AlgorithmDef; unknown: boolean } {
  const found = requested === undefined ? undefined : ALGORITHMS.find((a) => a.name === requested);
  const lit = allowed === undefined ? ALGORITHMS : ALGORITHMS.filter((a) => allowed.includes(a.name));
  const pool = lit.length > 0 ? lit : ALGORITHMS;
  return {
    def: found ?? (pool.length === 1 ? pool[0]! : pickByIntensity(pool, intensity, rng, running)),
    unknown: requested !== undefined && found === undefined,
  };
}
