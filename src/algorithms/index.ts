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
 * fuzzy pick by intensity in which the one running now weighs less. An unknown
 * name is not an error; `unknown` says so, and the random pick stands.
 */
export function chooseAlgorithm(
  requested: string | undefined,
  intensity: number,
  rng: Rng,
  running?: AlgorithmDef,
): { def: AlgorithmDef; unknown: boolean } {
  const found = requested === undefined ? undefined : ALGORITHMS.find((a) => a.name === requested);
  return {
    def: found ?? pickByIntensity(ALGORITHMS, intensity, rng, running),
    unknown: requested !== undefined && found === undefined,
  };
}
