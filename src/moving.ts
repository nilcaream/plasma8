/**
 * Moving values: for an algorithm that lists its knobs in groups, an instance
 * picks a few groups at random and one value from each; those values stop
 * having a single drawn number and walk over the whole of their knob's min..max,
 * by a random walk (src/randomWalk.ts) with one step on every hit of one beat
 * voice, every frame, from a random start. The intensity sets only the length
 * of the step. Every other value stays as it was drawn.
 */

import { VOICE_NAMES, type VoiceName } from './beatVoices';
import { REACH_POWER, TRAVEL_AT_0, TRAVEL_AT_1 } from './crossfader';
import { RandomWalk, STEP_AT_1 } from './randomWalk';
import { createRng, type Rng } from './rng';

/** How many groups an instance moves a value in: this many to this many, drawn once at start. */
export const MOVING_COUNT = [2, 5] as const;

/** One value that moves: its key, the min and max it walks between (its knob's own), the voice whose hits step it and the walk that remembers where it has been. */
export interface MovingValue {
  key: string;
  min: number;
  max: number;
  voice: VoiceName;
  walk: RandomWalk;
}

/**
 * A group of values that change one thing on screen: each entry is a value or a
 * pair (or more) that moves together, and an instance moves one entry of it.
 */
export type MovingGroup = readonly (string | readonly string[])[];

/**
 * Every value a group list may move, by key, with the name of the group it is in
 * (`names` is in the order of `groups`): what the debug panel marks on a knob
 * that can move whether or not this instance moves it.
 */
export function groupNames(groups: readonly MovingGroup[], names: readonly string[]): Record<string, string> {
  if (names.length !== groups.length) throw new Error(`${groups.length} moving groups but ${names.length} names`);
  const out: Record<string, string> = {};
  groups.forEach((group, i) => {
    for (const key of group.flat()) out[key] = names[i]!;
  });
  return out;
}

/** N in `count` (at most the number of groups) different groups, one entry from each; each of its values walks its knob's min..max (`bounds`) from a random start, with its own voice. */
export function drawMoving(
  groups: readonly MovingGroup[],
  bounds: (key: string) => readonly [number, number],
  rng: Rng,
  count: readonly [number, number] = MOVING_COUNT,
): MovingValue[] {
  const [least, most] = count;
  const n = Math.min(groups.length, least + Math.floor(rng.next() * (most - least + 1)));
  const rest = [...groups];
  const out: MovingValue[] = [];
  for (let i = 0; i < n; i++) {
    const group = rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!;
    const entry = rng.pick(group);
    for (const key of typeof entry === 'string' ? [entry] : entry) {
      const [min, max] = bounds(key);
      const voice = rng.pick(VOICE_NAMES);
      // the walk draws from a generator of its own, seeded here (its start is its first draw), so its steps while the page runs never touch `rng`
      out.push({ key, min, max, voice, walk: new RandomWalk(createRng(Math.floor(rng.next() * 4294967296))) });
    }
  }
  return out;
}

/**
 * One "can move" list of an algorithm: when an instance starts, `pick` of its
 * entries are drawn, without repeats and all equally likely. An entry is a
 * knob's key, or the name that its sub-values share (`palD` is `palD.0`,
 * `palD.1` and `palD.2`): a picked entry moves all of its knobs.
 */
export interface MovingList {
  pick: number;
  entries: readonly string[];
}

/** The knobs an entry stands for, in the order of `knobKeys`: the key itself, or every `entry.n`. */
export function entryKeys(entry: string, knobKeys: readonly string[]): string[] {
  const keys = knobKeys.filter((k) => k === entry || k.startsWith(`${entry}.`));
  if (keys.length === 0) throw new Error(`moving entry "${entry}" names no knob`);
  return keys;
}

/**
 * What the debug panel marks on every knob a list may move (the list's number
 * and how many it picks); `knobKeys` are the algorithm's knobs, so a name with sub-values marks each of them.
 */
export function listLabels(lists: readonly MovingList[], knobKeys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  lists.forEach((list, i) => {
    for (const entry of list.entries) for (const key of entryKeys(entry, knobKeys)) out[key] = `list ${i + 1}: pick ${list.pick} of ${list.entries.length}`;
  });
  return out;
}

/**
 * From every list, `pick` different entries at random; each knob of a picked
 * entry walks its knob's min..max (`bounds`) from a random start, with a voice
 * and a walk of its own. Nothing outside the lists moves.
 */
export function drawLists(
  lists: readonly MovingList[],
  knobKeys: readonly string[],
  bounds: (key: string) => readonly [number, number],
  rng: Rng,
): MovingValue[] {
  const out: MovingValue[] = [];
  for (const list of lists) {
    if (list.pick > list.entries.length) throw new Error(`pick ${list.pick} of ${list.entries.length} entries`);
    const rest = [...list.entries];
    for (let i = 0; i < list.pick; i++) {
      const entry = rest.splice(Math.floor(rng.next() * rest.length), 1)[0]!;
      for (const key of entryKeys(entry, knobKeys)) {
        const [min, max] = bounds(key);
        const voice = rng.pick(VOICE_NAMES);
        // the walk draws from a generator of its own, seeded here (its start is its first draw), so its steps while the page runs never touch `rng`
        out.push({ key, min, max, voice, walk: new RandomWalk(createRng(Math.floor(rng.next() * 4294967296))) });
      }
    }
  }
  return out;
}

/** The power of the intensity that sets how long every moving value's step is; one value for all of them, set from the debug panel. */
let reachPower = REACH_POWER;
export const getReachPower = (): number => reachPower;
export const setReachPower = (power: number): void => { reachPower = power; };

/** The step at intensity 1 as a share of a moving value's range; one value for all of them, set from the debug panel. */
let stepAt1 = STEP_AT_1;
export const getStepAt1 = (): number => stepAt1;
export const setStepAt1 = (share: number): void => { stepAt1 = share; };

/** A moving value now. Call it with the beats going forward, once or more a frame: the walk takes the hits that passed since the last call. */
export const movingAt = (m: MovingValue, intensity: number, beats: number): number =>
  m.walk.at(beats, { min: m.min, max: m.max, intensity, power: reachPower, voice: m.voice, travel0: TRAVEL_AT_0, travel1: TRAVEL_AT_1, stepAt1 });

/** Every moving value now, by key. */
export function movingValues(moving: readonly MovingValue[], intensity: number, beats: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moving) out[m.key] = movingAt(m, intensity, beats);
  return out;
}
