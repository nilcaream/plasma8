/**
 * The values an algorithm draws at random when it starts, one knob each: what
 * it is drawn from, and a wider span to try values in. An algorithm lists its
 * knobs and turns their values into its shader's uniforms, so the draw, the
 * debug panel's sliders and their marks all come from the same list.
 */

import type { Rng } from './rng';

/**
 * What a knob is drawn from: uniform in [min, max), a whole number in min..max,
 * or one of a list (repeats weigh more). A fixed knob is not drawn: it is a
 * value fixed in code, such as how far the picture zooms on the beat, listed
 * so the debug panel can try others.
 */
export type Draw =
  | { kind: 'range'; min: number; max: number }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'pick'; values: readonly number[] }
  | { kind: 'fixed'; value: number };

export interface Knob {
  key: string;
  draw: Draw;
  /** The span to try values in: holds the whole draw, and nothing in it breaks the picture. */
  wide: readonly [number, number];
  /** Whole numbers only: the shader counts with it, or picks a case by it. */
  whole?: boolean;
  /** A fixed knob's heading on the panel: what the value does. */
  group?: string;
}

export type Values = Record<string, number>;

export const range = (key: string, min: number, max: number, wide: readonly [number, number]): Knob =>
  ({ key, draw: { kind: 'range', min, max }, wide });

export const int = (key: string, min: number, max: number, wide: readonly [number, number]): Knob =>
  ({ key, draw: { kind: 'int', min, max }, wide, whole: true });

export const pick = (key: string, values: readonly number[], wide: readonly [number, number], whole = true): Knob =>
  ({ key, draw: { kind: 'pick', values }, wide, whole });

/** What the panel says a fixed value does when the knob names no group of its own. */
export const DEFAULT_FIXED_GROUP = 'how it follows the music';

/** A value fixed in code, with a span to try others in, and what it does ("follows the beat", "moves with time"). */
export const fixed = (key: string, value: number, wide: readonly [number, number], group = DEFAULT_FIXED_GROUP): Knob =>
  ({ key, draw: { kind: 'fixed', value }, wide, group });

export const isFixed = (knob: Knob): boolean => knob.draw.kind === 'fixed';

/** The fixed knobs by what they do, each group in the order its first knob appears. */
export function fixedGroups(knobs: readonly Knob[]): { group: string; knobs: Knob[] }[] {
  const groups: { group: string; knobs: Knob[] }[] = [];
  for (const knob of knobs.filter(isFixed)) {
    const group = knob.group ?? DEFAULT_FIXED_GROUP;
    const found = groups.find((g) => g.group === group);
    if (found) found.knobs.push(knob);
    else groups.push({ group, knobs: [knob] });
  }
  return groups;
}

/** Three knobs `key.0`..`key.2` drawn alike, as for one palette vector. */
export const triple = (key: string, min: number, max: number, wide: readonly [number, number]): Knob[] =>
  [0, 1, 2].map((i) => range(`${key}.${i}`, min, max, wide));

/** The values of knobs `key.0`, `key.1`, … back as a vector. */
export const vec = (v: Values, key: string, n = 3): number[] => Array.from({ length: n }, (_, i) => v[`${key}.${i}`]!);

/** A unit vector at an angle in radians. */
export const unit = (angle: number): number[] => [Math.cos(angle), Math.sin(angle)];

export function drawKnob(draw: Draw, rng: Rng): number {
  switch (draw.kind) {
    case 'range':
      return rng.range(draw.min, draw.max);
    case 'int':
      return Math.min(draw.max, draw.min + Math.floor(rng.next() * (draw.max - draw.min + 1)));
    case 'pick':
      return rng.pick(draw.values);
    case 'fixed':
      return draw.value;
  }
}

/** One fresh value for every knob, in list order. */
export function drawKnobs(knobs: readonly Knob[], rng: Rng): Values {
  const out: Values = {};
  for (const k of knobs) out[k.key] = drawKnob(k.draw, rng);
  return out;
}

/** The lowest and highest value the draw can give. */
export function drawBounds(draw: Draw): [number, number] {
  switch (draw.kind) {
    case 'pick':
      return [Math.min(...draw.values), Math.max(...draw.values)];
    case 'fixed':
      return [draw.value, draw.value];
    default:
      return [draw.min, draw.max];
  }
}

/** Where a value sits on the knob's wide span, 0 at its low end and 1 at its high end. */
export function share(knob: Knob, value: number): number {
  const [lo, hi] = knob.wide;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

// --- the user's range: the debug panel's min, max and value per knob -------

/** The part of a knob's wide span the user likes, and the value in it now. */
export interface UserRange { min: number; max: number; value: number }

/** A choice of two, such as a sign: its two values are the whole wide span, and every slider lands on one of them. */
export function isChoice(knob: Knob): boolean {
  const d = knob.draw;
  return d.kind === 'pick' && new Set(d.values).size === 2 && Math.min(...d.values) === knob.wide[0] && Math.max(...d.values) === knob.wide[1];
}

/** The slider's step: 1 for whole numbers, the whole span for a choice of two, a thousandth of the span otherwise. */
export function step(knob: Knob): number {
  const [lo, hi] = knob.wide;
  return isChoice(knob) ? hi - lo : knob.whole ? 1 : (hi - lo) / 1000;
}

/** How far apart min and max must stay: one step when the values are continuous; whole numbers and choices may meet (one value only). */
export function gap(knob: Knob): number {
  return knob.whole || isChoice(knob) ? 0 : step(knob);
}

/** A slider's value kept in the wide span: on one of a choice's two values, whole where the knob is whole. */
export function settle(knob: Knob, value: number): number {
  const [lo, hi] = knob.wide;
  const v = Math.min(hi, Math.max(lo, value));
  if (isChoice(knob)) return v - lo < hi - v ? lo : hi;
  return knob.whole ? Math.round(v) : v;
}

const inside = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Where every knob starts: the range the code draws from, and the value drawn from it. */
export function startRange(knob: Knob, value: number): UserRange {
  const [min, max] = drawBounds(knob.draw);
  return { min, max, value };
}

/** Moves min; it stops short of max, and pulls the value inside. */
export function setMin(knob: Knob, r: UserRange, to: number): UserRange {
  const min = Math.min(settle(knob, to), r.max - gap(knob));
  return { min, max: r.max, value: inside(r.value, min, r.max) };
}

/** Moves max; it stops short of min, and pulls the value inside. */
export function setMax(knob: Knob, r: UserRange, to: number): UserRange {
  const max = Math.max(settle(knob, to), r.min + gap(knob));
  return { min: r.min, max, value: inside(r.value, r.min, max) };
}

/** Sets a fixed knob: its one value is its min, its max and its value. */
export function setFixed(knob: Knob, to: number): UserRange {
  const v = settle(knob, to);
  return { min: v, max: v, value: v };
}

/** Moves the value, kept inside min..max. */
export function setValue(knob: Knob, r: UserRange, to: number): UserRange {
  return { ...r, value: inside(settle(knob, to), r.min, r.max) };
}

/**
 * A fresh value from the user's range. Left at the code's range, it draws
 * exactly as the code does. Otherwise uniform in min..max (whole numbers for a
 * whole knob), except that a pick draws from its own values inside the range,
 * as often as the code would, while any lie inside.
 */
export function drawFrom(knob: Knob, r: UserRange, rng: Rng): number {
  if (knob.draw.kind === 'fixed') return r.min;
  const [lo, hi] = drawBounds(knob.draw);
  if (r.min === lo && r.max === hi) return drawKnob(knob.draw, rng);
  if (knob.draw.kind === 'pick') {
    const own = knob.draw.values.filter((v) => v >= r.min && v <= r.max);
    if (own.length > 0) return rng.pick(own);
  }
  if (knob.whole) return drawKnob({ kind: 'int', min: Math.ceil(r.min), max: Math.floor(r.max) }, rng);
  return rng.range(r.min, r.max);
}

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(3));

/** The ranges as plain text to paste back, one knob a line: min and max of the drawn ones (the sub-range, marked, of a moving one), then the value of each fixed one. */
export function formatRanges(
  title: string,
  knobs: readonly Knob[],
  ranges: Readonly<Record<string, UserRange>>,
  moving: ReadonlySet<string> = new Set(),
): string {
  const width = Math.max(...knobs.map((k) => k.key.length));
  const col = (n: number): string => num(n).padStart(7);
  const note = (k: Knob): string => (moving.has(k.key) ? '  (moving: this run\'s sub-range)' : '');
  const drawn = knobs.filter((k) => !isFixed(k)).map((k) => `${k.key.padEnd(width)}  min ${col(ranges[k.key]!.min)}  max ${col(ranges[k.key]!.max)}${note(k)}`);
  const kept = knobs.filter(isFixed).map((k) => `${k.key.padEnd(width)}  ${num(ranges[k.key]!.value)}`);
  return [title, ...drawn, ...kept].join('\n');
}
