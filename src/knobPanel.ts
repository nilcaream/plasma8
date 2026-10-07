/**
 * The debug panel's knobs (`?debug` only): for every value the running
 * algorithm drew when it started, three sliders over the knob's wide span. Min
 * and max are the part of the span the user likes; they start at the range the
 * code draws from (the ticks on their tracks), and every later run of the same
 * algorithm draws from them, until the page is loaded again. Value is this
 * run's value, kept inside min..max (the band on its track), and put in at once.
 * Under them, "Fixed in code": one value slider for each value the code fixes
 * (how the picture follows the music), starting at the code's value (the tick).
 */

import type { Algorithm, AlgorithmDef, CreateOptions } from './algorithm';
import {
  algorithmOptions, drawBounds, drawFrom, fixedGroups, formatRanges, isFixed, setFixed, setMax, setMin, setValue, share, startRange, step,
  type Knob, type UserRange, type Values,
} from './knobs';
import { movingAt, movingRange, type MovingValue } from './moving';
import type { Rng } from './rng';

export interface Shown {
  def: AlgorithmDef;
  values: Values;
  algorithm: Algorithm;
}

type Part = 'min' | 'max' | 'value';
const PARTS: readonly Part[] = ['min', 'max', 'value'];

interface Row {
  el: HTMLElement;
  name: HTMLElement;
  knob: Knob;
  /** min, max and value for a drawn knob; value alone for a fixed one. */
  parts: readonly Part[];
  inputs: Partial<Record<Part, HTMLInputElement>>;
  outs: Partial<Record<Part, HTMLOutputElement>>;
  band: HTMLElement | null;
}

const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;
const show = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(3));

export class KnobPanel {
  private readonly root = document.getElementById('knobs') as HTMLElement;
  private readonly list: HTMLElement;
  private readonly head: HTMLElement;
  private readonly copied: HTMLTextAreaElement;
  /** The user's min and max by algorithm name and knob; this load only. */
  private readonly saved = new Map<string, Map<string, { min: number; max: number }>>();
  private rows: Row[] = [];
  private shown: Shown | undefined;
  private ranges: Record<string, UserRange> = {};
  /** The shown algorithm's moving values by knob key; empty while the moves are off. */
  private moving = new Map<string, MovingValue>();
  /** The "Moves off" switch; this load only. */
  private movesOff = false;

  constructor(
    private readonly enabled: boolean,
    private readonly seed: string,
    onDrawAgain: () => void,
    algorithmNames: readonly string[] = [],
    /** The algorithm held when the page loads (a known ?algo=), else undefined: the picker starts on it. */
    held: string | undefined = undefined,
    /** The picker moved: an algorithm's name to hold it, undefined to hand back to the sequencer. */
    onPick: (name: string | undefined) => void = () => {},
  ) {
    this.root.classList.toggle('on', enabled);
    this.root.innerHTML = `
      <button type="button" class="fold" aria-expanded="true">knobs</button>
      <div class="body">
        <div class="head"></div>
        <label class="pick" title="Hold one algorithm, or let the changes pick. Not remembered across loads."><span>Algorithm</span> <select data-do="algo">${
          algorithmOptions(algorithmNames).map((o) => `<option value="${o.value}">${o.label}</option>`).join('')
        }</select></label>
        <div class="buttons">
          <button type="button" data-do="again" title="Start this algorithm again now, every value drawn from your min..max">Draw again</button>
          <button type="button" data-do="copy" title="Copy every random knob's min and max, and every fixed value, as text">Copy</button>
        </div>
        <label class="switch" title="Nothing moves: every value stays where it is and its sliders work like any other knob's. Not remembered across loads."><input type="checkbox" data-do="moves"> Moves off</label>
        <textarea readonly rows="6" hidden></textarea>
        <div class="list"></div>
      </div>`;
    this.head = this.root.querySelector('.head')!;
    this.list = this.root.querySelector('.list')!;
    this.copied = this.root.querySelector('textarea')!;
    const fold = this.root.querySelector<HTMLButtonElement>('.fold')!;
    fold.addEventListener('click', () => {
      const open = !this.root.classList.toggle('folded');
      fold.setAttribute('aria-expanded', String(open));
    });
    this.root.querySelector('[data-do=again]')!.addEventListener('click', onDrawAgain);
    this.root.querySelector('[data-do=copy]')!.addEventListener('click', () => void this.copy());
    const picker = this.root.querySelector<HTMLSelectElement>('[data-do=algo]')!;
    if (held !== undefined && algorithmNames.includes(held)) picker.value = held;
    picker.addEventListener('change', () => onPick(picker.value === '' ? undefined : picker.value));
    this.root.querySelector<HTMLInputElement>('[data-do=moves]')!.addEventListener('change', (e) => {
      this.setMovesOff((e.target as HTMLInputElement).checked);
    });
  }

  /** What a new instance is asked for: no moving values while "Moves off" is on, and moving values inside the min..max set here. */
  options(def: AlgorithmDef): CreateOptions {
    return {
      moves: !this.movesOff,
      bounds: (key) => {
        const r = this.rangeOf(def.name, def.knobs.find((k) => k.key === key)!, 0);
        return [r.min, r.max];
      },
    };
  }

  /** Switches the moves off (every moving value stays where it is now) or on again (they move from their sub-ranges). */
  private setMovesOff(off: boolean): void {
    this.movesOff = off;
    const s = this.shown;
    if (!s) return;
    if (off) for (const key of this.moving.keys()) s.values[key] = this.ranges[key]!.value;
    this.show(s);
  }

  contains(target: EventTarget | null): boolean {
    return this.enabled && target instanceof Node && this.root.contains(target);
  }

  /** What an algorithm starts with: every knob drawn from the user's min..max (the code's range until moved). */
  start(def: AlgorithmDef, rng: Rng): Values {
    const out: Values = {};
    for (const knob of def.knobs) out[knob.key] = drawFrom(knob, this.rangeOf(def.name, knob, 0), rng);
    return out;
  }

  /** Shows the running algorithm's knobs: a new list for another algorithm, new values for the same one. */
  show(s: Shown): void {
    if (!this.enabled) return;
    const same = this.shown?.def === s.def;
    this.shown = s;
    this.ranges = {};
    this.moving = new Map((this.movesOff ? [] : s.algorithm.moving ?? []).map((m) => [m.key, m]));
    s.algorithm.hold?.(this.movesOff);
    for (const knob of s.def.knobs) {
      const m = this.moving.get(knob.key);
      if (m) {
        // a moving value shows its sub-range; its value is read live (tick)
        const { min, max } = movingRange(m);
        this.ranges[knob.key] = { min, max, value: (min + max) / 2 };
        continue;
      }
      const r = this.rangeOf(s.def.name, knob, s.values[knob.key]!);
      // made a bar ahead: a min or max moved since pulls its value inside
      this.ranges[knob.key] = setValue(knob, r, r.value);
    }
    this.tune();
    this.head.textContent = `${s.def.name}  seed ${this.seed}`;
    if (!same) this.build(s.def.knobs);
    for (const r of this.rows) {
      const moving = this.moving.get(r.knob.key);
      const moves = moving !== undefined;
      r.el.classList.toggle('moving', moves);
      r.name.textContent = moving ? `${r.knob.key}  (moves) ${moving.voice}` : r.knob.key;
      for (const input of Object.values(r.inputs)) input.disabled = moves;
      this.paint(r);
    }
  }

  /** Once a frame: the live value of every moving value. */
  tick(intensity: number, beats: number): void {
    for (const r of this.rows) {
      const m = this.moving.get(r.knob.key);
      if (!m) continue;
      const v = movingAt(m, intensity, beats);
      this.ranges[r.knob.key]!.value = v;
      r.inputs.value!.value = String(v);
      r.outs.value!.textContent = show(v);
    }
  }

  private rangeOf(name: string, knob: Knob, value: number): UserRange {
    const saved = this.saved.get(name)?.get(knob.key);
    return saved ? { ...saved, value } : startRange(knob, value);
  }

  private build(knobs: readonly Knob[]): void {
    this.list.textContent = '';
    const heading = (text: string, note: string): void => {
      const h = document.createElement('div');
      h.className = 'group';
      h.innerHTML = `<b>${text}</b><span>${note}</span>`;
      this.list.appendChild(h);
    };
    heading('Random per instance', 'drawn from min..max at every start');
    const drawn = knobs.filter((k) => !isFixed(k)).map((k) => this.row(k));
    const kept: Row[] = [];
    for (const { group, knobs: inGroup } of fixedGroups(knobs)) {
      heading('Fixed in code', `${group}; the code's value to start`);
      kept.push(...inGroup.map((k) => this.row(k)));
    }
    this.rows = [...drawn, ...kept];
  }

  private row(knob: Knob): Row {
    const row = document.createElement('div');
    row.className = 'knob';
    const [lo, hi] = knob.wide;
    const [a, b] = drawBounds(knob.draw);
    const codeTicks = [...new Set([a, b])].map((v) => `<i class="tick" style="left:${pct(share(knob, v))}"></i>`).join('');
    const parts = isFixed(knob) ? (['value'] as const) : PARTS;
    const id = `knob-${knob.key.replace(/\W/g, '-')}`;
    row.innerHTML = `<div class="name">${knob.key}</div>` + parts.map((part) => `
      <label for="${id}-${part}">${part}</label>
      <span class="track">${part === 'value' && !isFixed(knob) ? '<i class="band"></i>' : codeTicks}<input id="${id}-${part}" data-part="${part}" type="range" min="${lo}" max="${hi}" step="${step(knob)}"></span>
      <output for="${id}-${part}"></output>`).join('');
    const r: Row = { el: row, name: row.querySelector<HTMLElement>('.name')!, knob, parts, inputs: {}, outs: {}, band: row.querySelector('.band') };
    for (const part of parts) {
      const input = row.querySelector<HTMLInputElement>(`input[data-part=${part}]`)!;
      r.inputs[part] = input;
      r.outs[part] = row.querySelector<HTMLOutputElement>(`output[for=${id}-${part}]`)!;
      input.addEventListener('input', () => this.move(r, part, Number(input.value)));
    }
    this.list.appendChild(row);
    return r;
  }

  private paint(r: Row): void {
    const range = this.ranges[r.knob.key]!;
    for (const part of r.parts) {
      r.inputs[part]!.value = String(range[part]);
      r.outs[part]!.textContent = show(range[part]);
    }
    if (r.band) {
      r.band.style.left = pct(share(r.knob, range.min));
      r.band.style.width = pct(share(r.knob, range.max) - share(r.knob, range.min));
    }
  }

  private move(r: Row, part: Part, to: number): void {
    const s = this.shown!;
    const key = r.knob.key;
    const next = isFixed(r.knob) ? setFixed(r.knob, to)
      : (part === 'min' ? setMin : part === 'max' ? setMax : setValue)(r.knob, this.ranges[key]!, to);
    this.ranges[key] = next;
    let saved = this.saved.get(s.def.name);
    if (!saved) this.saved.set(s.def.name, (saved = new Map()));
    saved.set(key, { min: next.min, max: next.max });
    this.tune();
    this.paint(r);
  }

  private tune(): void {
    const s = this.shown!;
    for (const [key, r] of Object.entries(this.ranges)) s.values[key] = r.value;
    s.algorithm.tune(s.values);
  }

  private async copy(): Promise<void> {
    const s = this.shown;
    if (!s) return;
    const text = formatRanges(s.def.name, s.def.knobs, this.ranges, new Set(this.moving.keys()));
    this.copied.value = text;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.hidden = true;
      this.flash('Copied');
    } catch {
      // no clipboard here: show the text, selected, to copy by hand
      this.copied.hidden = false;
      this.copied.select();
      this.flash('Select and copy');
    }
  }

  private flash(text: string): void {
    const b = this.root.querySelector<HTMLButtonElement>('[data-do=copy]')!;
    b.textContent = text;
    setTimeout(() => { b.textContent = 'Copy'; }, 1500);
  }
}
