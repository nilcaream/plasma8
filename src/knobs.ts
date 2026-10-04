/**
 * The values an algorithm draws at random when it starts, one knob each: what
 * it is drawn from, and a wider span to try values in. An algorithm lists its
 * knobs and turns their values into its shader's uniforms, so the draw, the
 * debug panel's sliders and their marks all come from the same list.
 */

import type { Rng } from './rng';

/** What a knob is drawn from: uniform in [min, max), a whole number in min..max, or one of a list (repeats weigh more). */
export type Draw =
  | { kind: 'range'; min: number; max: number }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'pick'; values: readonly number[] };

export interface Knob {
  key: string;
  draw: Draw;
  /** The span to try values in: holds the whole draw, and nothing in it breaks the picture. */
  wide: readonly [number, number];
  /** Whole numbers only: the shader counts with it, or picks a case by it. */
  whole?: boolean;
}

export type Values = Record<string, number>;

export const range = (key: string, min: number, max: number, wide: readonly [number, number]): Knob =>
  ({ key, draw: { kind: 'range', min, max }, wide });

export const int = (key: string, min: number, max: number, wide: readonly [number, number]): Knob =>
  ({ key, draw: { kind: 'int', min, max }, wide, whole: true });

export const pick = (key: string, values: readonly number[], wide: readonly [number, number], whole = true): Knob =>
  ({ key, draw: { kind: 'pick', values }, wide, whole });

/** A sign, -1 or 1, as often each. */
export const sign = (key: string): Knob => pick(key, [-1, 1], [-1, 1]);

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
  return draw.kind === 'pick' ? [Math.min(...draw.values), Math.max(...draw.values)] : [draw.min, draw.max];
}

/** Where a value sits on the knob's wide span, 0 at its low end and 1 at its high end. */
export function share(knob: Knob, value: number): number {
  const [lo, hi] = knob.wide;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/** A value from the slider, kept in the wide span and whole where the knob is whole. */
export function settle(knob: Knob, value: number): number {
  const v = Math.min(knob.wide[1], Math.max(knob.wide[0], value));
  return knob.whole ? Math.round(v) : v;
}

/** What starts an instance: this load's draw, with every value the user has pinned in its place. */
export function withPins(drawn: Values, pins: ReadonlyMap<string, number>): Values {
  const out = { ...drawn };
  for (const [key, value] of pins) if (key in out) out[key] = value;
  return out;
}

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(3));

function describe(draw: Draw): string {
  return draw.kind === 'pick' ? `one of ${draw.values.map(num).join(' ')}` : `${draw.kind === 'int' ? 'whole ' : ''}${num(draw.min)}..${num(draw.max)}`;
}

/** The values as plain text, one knob a line, to paste back: value, what was drawn, from what, and whether it is pinned. */
export function formatValues(title: string, knobs: readonly Knob[], values: Values, drawn: Values, pins: ReadonlyMap<string, number>): string {
  const width = Math.max(...knobs.map((k) => k.key.length));
  const lines = knobs.map((k) =>
    `${k.key.padEnd(width)}  ${num(values[k.key]!).padStart(7)}${pins.has(k.key) ? ' pinned' : '       '}  drawn ${num(drawn[k.key]!)} from ${describe(k.draw)}`);
  return [title, ...lines].join('\n');
}
