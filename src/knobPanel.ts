/**
 * The debug panel's knobs (`?debug` only): a slider for every value the running
 * algorithm drew when it started. A slider shows this run's draw, and moving it
 * pins that value: it is put in at once, and every later run of the same
 * algorithm starts with it, until it is released or the page is loaded again.
 * The band on a slider is the range the code draws from; the thin line is
 * what was drawn this run.
 */

import type { Algorithm, AlgorithmDef } from './algorithm';
import { drawBounds, formatValues, settle, share, withPins, type Knob, type Values } from './knobs';

export interface Shown {
  def: AlgorithmDef;
  drawn: Values;
  algorithm: Algorithm;
}

interface Row {
  knob: Knob;
  input: HTMLInputElement;
  out: HTMLOutputElement;
  drawnMark: HTMLElement;
  row: HTMLElement;
}

const pct = (x: number): string => `${(x * 100).toFixed(2)}%`;
const show = (knob: Knob, v: number): string => (knob.whole ? String(Math.round(v)) : v.toFixed(3));

export class KnobPanel {
  private readonly root = document.getElementById('knobs') as HTMLElement;
  private readonly list: HTMLElement;
  private readonly head: HTMLElement;
  private readonly copied: HTMLTextAreaElement;
  /** Pinned values by algorithm name; this load only. */
  private readonly pins = new Map<string, Map<string, number>>();
  private rows: Row[] = [];
  private shown: Shown | undefined;
  private values: Values = {};

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
          <button type="button" data-do="again" title="Start this algorithm again now with a fresh draw; pinned values stay">Draw again</button>
          <button type="button" data-do="pin" title="Pin every value as it is now">Pin all</button>
          <button type="button" data-do="release" title="Release every pin: back to this run's draw">Release all</button>
          <button type="button" data-do="copy" title="Copy the values as text">Copy</button>
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
    this.root.querySelector('[data-do=pin]')!.addEventListener('click', () => this.pinAll());
    this.root.querySelector('[data-do=release]')!.addEventListener('click', () => this.releaseAll());
    this.root.querySelector('[data-do=copy]')!.addEventListener('click', () => void this.copy());
  }

  contains(target: EventTarget | null): boolean {
    return this.enabled && target instanceof Node && this.root.contains(target);
  }

  /** What an algorithm starts with: its draw, with this load's pins for it in place. */
  start(def: AlgorithmDef, drawn: Values): Values {
    return withPins(drawn, this.pinsOf(def.name));
  }

  /** Shows the running algorithm's knobs: a new list for another algorithm, new draws for the same one. */
  show(s: Shown): void {
    if (!this.enabled) return;
    const same = this.shown?.def === s.def;
    this.shown = s;
    this.values = this.start(s.def, s.drawn);
    // it was made a bar ahead: put in what was pinned since
    s.algorithm.tune(this.values);
    this.head.textContent = `${s.def.name}  seed ${this.seed}`;
    if (!same) this.build(s.def.knobs);
    for (const r of this.rows) this.paint(r);
  }

  private pinsOf(name: string): Map<string, number> {
    let p = this.pins.get(name);
    if (!p) this.pins.set(name, (p = new Map()));
    return p;
  }

  private build(knobs: readonly Knob[]): void {
    this.list.textContent = '';
    this.rows = knobs.map((knob) => {
      const row = document.createElement('div');
      row.className = 'knob';
      const [lo, hi] = knob.wide;
      const step = knob.whole ? 1 : (hi - lo) / 1000;
      const marks = knob.draw.kind === 'pick'
        ? [...new Set(knob.draw.values)].map((v) => `<i class="tick" style="left:${pct(share(knob, v))}"></i>`).join('')
        : (([a, b]) => `<i class="band" style="left:${pct(share(knob, a))};width:${pct(share(knob, b) - share(knob, a))}"></i>`)(drawBounds(knob.draw));
      const id = `knob-${knob.key.replace(/\W/g, '-')}`;
      row.innerHTML = `<label for="${id}">${knob.key}</label>
        <span class="track">${marks}<i class="drawn"></i><input id="${id}" type="range" min="${lo}" max="${hi}" step="${step}"></span>
        <output for="${id}"></output>
        <button type="button" class="release" title="Release: back to this run's draw">×</button>`;
      const r: Row = {
        knob,
        row,
        input: row.querySelector('input')!,
        out: row.querySelector('output')!,
        drawnMark: row.querySelector('.drawn')!,
      };
      r.input.addEventListener('input', () => this.pin(r, Number(r.input.value)));
      row.querySelector('.release')!.addEventListener('click', () => this.release(r));
      this.list.appendChild(row);
      return r;
    });
  }

  private paint(r: Row): void {
    const v = this.values[r.knob.key]!;
    const drawn = this.shown!.drawn[r.knob.key]!;
    r.input.value = String(v);
    r.out.textContent = show(r.knob, v);
    r.drawnMark.style.left = pct(share(r.knob, drawn));
    r.drawnMark.title = `drawn ${show(r.knob, drawn)}`;
    r.row.classList.toggle('pinned', this.pinsOf(this.shown!.def.name).has(r.knob.key));
  }

  private pin(r: Row, value: number): void {
    const s = this.shown!;
    const v = settle(r.knob, value);
    this.pinsOf(s.def.name).set(r.knob.key, v);
    this.values[r.knob.key] = v;
    s.algorithm.tune(this.values);
    this.paint(r);
  }

  private release(r: Row): void {
    const s = this.shown!;
    this.pinsOf(s.def.name).delete(r.knob.key);
    this.values[r.knob.key] = s.drawn[r.knob.key]!;
    s.algorithm.tune(this.values);
    this.paint(r);
  }

  private pinAll(): void {
    if (!this.shown) return;
    const pins = this.pinsOf(this.shown.def.name);
    for (const r of this.rows) pins.set(r.knob.key, this.values[r.knob.key]!);
    for (const r of this.rows) this.paint(r);
  }

  private releaseAll(): void {
    if (!this.shown) return;
    this.pinsOf(this.shown.def.name).clear();
    this.values = { ...this.shown.drawn };
    this.shown.algorithm.tune(this.values);
    for (const r of this.rows) this.paint(r);
  }

  private async copy(): Promise<void> {
    const s = this.shown;
    if (!s) return;
    const text = formatValues(`${s.def.name}  seed ${this.seed}`, s.def.knobs, this.values, s.drawn, this.pinsOf(s.def.name));
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
