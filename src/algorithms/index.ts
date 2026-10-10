import type { AlgorithmDef } from '../algorithm';
import { pickByIntensity } from '../pick';
import type { Rng } from '../rng';
import { julia } from './julia';
import { maze } from './maze';
import { plasma } from './plasma';
import { tunnel } from './tunnel';
import { warpNoise } from './warpNoise';

export const ALGORITHMS: readonly AlgorithmDef[] = [warpNoise, plasma, maze, julia, tunnel];

/**
 * The next algorithm to run: a fuzzy pick by intensity in which the one running
 * now weighs less, among the `allowed` names (all when none is given or none of
 * them is known); a single allowed one is picked every time.
 */
export function chooseAlgorithm(intensity: number, rng: Rng, running?: AlgorithmDef, allowed?: readonly string[]): AlgorithmDef {
  const lit = allowed === undefined ? ALGORITHMS : ALGORITHMS.filter((a) => allowed.includes(a.name));
  const pool = lit.length > 0 ? lit : ALGORITHMS;
  return pool.length === 1 ? pool[0]! : pickByIntensity(pool, intensity, rng, running);
}
