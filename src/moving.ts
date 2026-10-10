/**
 * Moving values: an algorithm lists the values that "can move" in one or more
 * lists, each with how many of its entries an instance picks. A picked
 * value stops having a single drawn number and walks over the whole of its
 * knob's min..max, by a random walk (src/randomWalk.ts) with one step on every
 * hit of one beat voice, every frame, from a random start. The intensity sets
 * only the length of the step. Every other value stays as it was drawn.
 */

import { VOICE_NAMES, type VoiceName } from './beatVoices';
import { REACH_POWER, TRAVEL_AT_0, TRAVEL_AT_1, stroke } from './crossfader';
import { RandomWalk, STEP_AT_1 } from './randomWalk';
import { createRng, type Rng } from './rng';

/** One value that moves: its key, the min and max it walks between (its knob's own), the voice whose hits step it and the walk that remembers where it has been. */
export interface MovingValue {
  key: string;
  min: number;
  max: number;
  voice: VoiceName;
  walk: RandomWalk;
}

/** A moving value with a walk of its own, started at a random point of min..max from `seed`. */
const mover = (key: string, min: number, max: number, voice: VoiceName, seed: number): MovingValue =>
  ({ key, min, max, voice, walk: new RandomWalk(createRng(seed)) });

/** A value that moves by the kick, the way a drawn one would over min..max: what the debug panel's box next to a knob starts while the moves are off. */
export const followKick = (key: string, min: number, max: number, seed: number): MovingValue => mover(key, min, max, 'kick', seed);

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
        out.push(mover(key, min, max, voice, Math.floor(rng.next() * 4294967296)));
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

const walkParams = (m: MovingValue, intensity: number) =>
  ({ min: m.min, max: m.max, intensity, power: reachPower, voice: m.voice, travel0: TRAVEL_AT_0, travel1: TRAVEL_AT_1, stepAt1 });

/** A moving value now. Call it with the beats going forward, once or more a frame: the walk takes the hits that passed since the last call. */
export const movingAt = (m: MovingValue, intensity: number, beats: number): number => m.walk.at(beats, walkParams(m, intensity));

/**
 * The stroke a moving value is in now, in its own units: it rested at `from` since its voice's last hit and lands on `to` at
 * the next; `done` is the eased share of the way, so the value now is from + (to - from) · done. Before the walk has taken a
 * hit it stands still at its start. For an algorithm that draws a change as a whole stroke (the maze turns its tiles by it).
 */
export function movingStroke(m: MovingValue, intensity: number, beats: number): { from: number; to: number; done: number } {
  const p = walkParams(m, intensity);
  const value = m.walk.at(beats, p);
  const s = m.walk.strokeAt(beats, p);
  if (!s) return { from: value, to: value, done: 0 };
  const unit = (u: number): number => m.min + u * (m.max - m.min);
  return { from: unit(s.from), to: unit(s.to), done: stroke(s.x) };
}

/** Every moving value now, by key. */
export function movingValues(moving: readonly MovingValue[], intensity: number, beats: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moving) out[m.key] = movingAt(m, intensity, beats);
  return out;
}
