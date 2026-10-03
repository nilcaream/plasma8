import type { AlgorithmDef } from '../algorithm';
import type { Rng } from '../rng';
import { warpNoise } from './warpNoise';

export const ALGORITHMS: readonly AlgorithmDef[] = [warpNoise];

/**
 * The algorithm to run: the one asked for by name, else a random one. An
 * unknown name is not an error; `unknown` says so, and the random pick stands.
 */
export function chooseAlgorithm(requested: string | undefined, rng: Rng): { def: AlgorithmDef; unknown: boolean } {
  const found = requested === undefined ? undefined : ALGORITHMS.find((a) => a.name === requested);
  return { def: found ?? rng.pick(ALGORITHMS), unknown: requested !== undefined && found === undefined };
}
