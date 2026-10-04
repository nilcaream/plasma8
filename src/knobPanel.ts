/**
 * The debug panel's knobs (`?debug` only): for every value the running
 * algorithm drew when it started, three sliders over the knob's wide span. Min
 * and max are the part of the span the user likes; they start at the range the
 * code draws from (the ticks on their tracks), and every later run of the same
 * algorithm draws from them, until the page is loaded again. Value is this
 * run's value, kept inside min..max (the band on its track), and put in at once.
 */

import type { Algorithm, AlgorithmDef } from './algorithm';
import {
  drawBounds, drawFrom, formatRanges, setMax, setMin, setValue, share, startRange, step,
  type Knob, type UserRange, type Values,
} from './knobs';
import type { Rng } from './rng';

export interface Shown {
  def: AlgorithmDef;
  values: Values;
  algorithm: Algorithm;
}

type Part = 'min' | 'max' | 'value';
const PARTS: readonly Part[] = ['min', 'max', 'value'];

interface Row {
  knob: Knob;
  inputs: Record<Part, HTMLInputElement>;
  outs: Record<Part, HTMLOutputElement>;
  band: HTMLElement;
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

  constructor(
    private readonly enabled: boolean,
    private readonly seed: string,
    onDrawAgain: () => void,
  ) {
    this.root.classList.toggle('on', enabled);
    this.root.innerHTML = `
      <button type="button" class="fold" aria-expanded="true">knobs</button>
      <div class="body">
        <div class="head"></div>
        <div class="buttons">
          <button type="button" data-do="again" title="Start this algorithm again now, every value drawn from your min..max">Draw again</button>
          <button type="button" data-do="copy" title="Copy every knob's min and max as text">Copy</button>
        </div>
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
    for (const knob of s.def.knobs) {
      const r = this.rangeOf(s.def.name, knob, s.values[knob.key]!);
      // made a bar ahead: a min or max moved since pulls its value inside
      this.ranges[knob.key] = setValue(knob, r, r.value);
    }
    this.tune();
    this.head.textContent = `${s.def.name}  seed ${this.seed}`;
    if (!same) this.build(s.def.knobs);
    for (const r of this.rows) this.paint(r);
  }

  private rangeOf(name: string, knob: Knob, value: number): UserRange {
    const saved = this.saved.get(name)?.get(knob.key);
    return saved ? { ...saved, value } : startRange(knob, value);
  }

  private build(knobs: readonly Knob[]): void {
    this.list.textContent = '';
    this.rows = knobs.map((knob) => {
      const row = document.createElement('div');
      row.className = 'knob';
      const [lo, hi] = knob.wide;
      const [a, b] = drawBounds(knob.draw);
      const codeTicks = [...new Set([a, b])].map((v) => `<i class="tick" style="left:${pct(share(knob, v))}"></i>`).join('');
      const id = `knob-${knob.key.replace(/\W/g, '-')}`;
      row.innerHTML = `<div class="name">${knob.key}</div>` + PARTS.map((part) => `
        <label for="${id}-${part}">${part}</label>
        <span class="track">${part === 'value' ? '<i class="band"></i>' : codeTicks}<input id="${id}-${part}" data-part="${part}" type="range" min="${lo}" max="${hi}" step="${step(knob)}"></span>
        <output for="${id}-${part}"></output>`).join('');
      const pick = <T extends Element>(sel: (p: Part) => string): Record<Part, T> =>
        Object.fromEntries(PARTS.map((p) => [p, row.querySelector<T>(sel(p))!])) as Record<Part, T>;
      const r: Row = {
        knob,
        inputs: pick<HTMLInputElement>((p) => `input[data-part=${p}]`),
        outs: pick<HTMLOutputElement>((p) => `output[for=${id}-${p}]`),
        band: row.querySelector('.band')!,
      };
      for (const part of PARTS) r.inputs[part].addEventListener('input', () => this.move(r, part, Number(r.inputs[part].value)));
      this.list.appendChild(row);
      return r;
    });
  }

  private paint(r: Row): void {
    const range = this.ranges[r.knob.key]!;
    for (const part of PARTS) {
      r.inputs[part].value = String(range[part]);
      r.outs[part].textContent = show(range[part]);
    }
    r.band.style.left = pct(share(r.knob, range.min));
    r.band.style.width = pct(share(r.knob, range.max) - share(r.knob, range.min));
  }

  private move(r: Row, part: Part, to: number): void {
    const s = this.shown!;
    const key = r.knob.key;
    const set = part === 'min' ? setMin : part === 'max' ? setMax : setValue;
    const next = set(r.knob, this.ranges[key]!, to);
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
    const text = formatRanges(s.def.name, s.def.knobs, this.ranges);
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
