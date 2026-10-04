/**
 * Helpers shared by the graph pages (/beats/, /harmonics/): grouped sliders, a
 * tempo that follows the app's tap clock, and canvas graphs (a frame with
 * ticks, curves, dots and a playhead) in the page's theme colours.
 */

import { MAX_BPM, MIN_BPM } from './clock';
import type { PageTempo } from './pageTempo';

export function el<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} is missing`);
  return e as T;
}

// --- controls -------------------------------------------------------------

/** A headed group of controls: where the values come from. */
export function controlGroup(parent: HTMLElement, title: string, note?: string): HTMLElement {
  const g = document.createElement('div');
  g.className = 'ctl-group';
  g.innerHTML = `<h3>${title}</h3>` + (note ? `<p class="note">${note}</p>` : '');
  parent.appendChild(g);
  return g;
}

export interface SliderSpec { label: string; min: number; max: number; step: number; value: number; digits: number }

/** A labelled slider showing its number; returns a setter that moves it without calling back. */
export function slider(parent: HTMLElement, spec: SliderSpec, onInput: (v: number) => void): (v: number) => void {
  const row = document.createElement('div');
  row.className = 'ctl';
  const id = 'in-' + spec.label.replace(/\W/g, '');
  row.innerHTML = `<label for="${id}">${spec.label}</label>
    <input id="${id}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.value}">
    <output for="${id}">${spec.value.toFixed(spec.digits)}</output>`;
  const input = row.querySelector('input')!;
  const out = row.querySelector('output')!;
  input.addEventListener('input', () => {
    out.textContent = Number(input.value).toFixed(spec.digits);
    onInput(Number(input.value));
  });
  parent.appendChild(row);
  return (v) => {
    input.value = String(v);
    out.textContent = v.toFixed(spec.digits);
  };
}

export function button(parent: HTMLElement, label: string, id: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.id = id;
  b.textContent = label;
  parent.appendChild(b);
  return b;
}

/** The Live group's BPM slider, and the tap button that drives the same tempo. */
export function tempoControls(live: HTMLElement, tapButton: HTMLButtonElement, tempo: PageTempo): (now: number) => void {
  const setBpm = slider(live, { label: 'BPM', min: MIN_BPM, max: MAX_BPM, step: 0.01, value: tempo.tempo(0).bpm, digits: 2 },
    (v) => tempo.setBpm(v, performance.now()));
  // the event's own time, as the app does: the moment of the press, not of the handler
  tapButton.addEventListener('pointerdown', (e) => tempo.tap(e.timeStamp));
  tapButton.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tempo.tap(e.timeStamp); }
  });
  let shown = NaN;
  return (now) => {
    const bpm = tempo.tempo(now).bpm;
    if (bpm !== shown) { setBpm(bpm); shown = bpm; }
  };
}

// --- graphs ---------------------------------------------------------------

const COLOR_KEYS = [
  'fg', 'muted', 'grid', 'beat', 'kick', 'snare', 'crash', 'total', 'light', 'play', 'panel', 'band',
  'l0', 'l1', 'l2', 'l3',
] as const;

/** The page's CSS colour tokens, read again when the theme changes. */
export const colors = {} as Record<(typeof COLOR_KEYS)[number], string>;
function readColors(): void {
  const cs = getComputedStyle(document.documentElement);
  for (const k of COLOR_KEYS) colors[k] = cs.getPropertyValue('--' + k).trim();
}
readColors();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readColors);

export interface Surface { ctx: CanvasRenderingContext2D; w: number; h: number }

export function setup(canvas: HTMLCanvasElement): Surface {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.font = '12px system-ui, sans-serif';
  return { ctx, w, h };
}

export const PAD = { l: 44, r: 24, t: 10, b: 26 };

export interface Tick { x: number; label: string; strong?: boolean }
export type Map1 = (v: number) => number;

/** A frame with x and y ticks; returns the mappings from data to pixels. */
export function frame(s: Surface, x0: number, x1: number, y0: number, y1: number, xTicks: Tick[], yTicks: number[], yDigits: number) {
  const { ctx, w, h } = s;
  const X: Map1 = (x) => PAD.l + (x - x0) / (x1 - x0) * (w - PAD.l - PAD.r);
  const Y: Map1 = (y) => h - PAD.b - (y - y0) / (y1 - y0) * (h - PAD.t - PAD.b);
  ctx.lineWidth = 1;
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const y of yTicks) {
    ctx.strokeStyle = colors.grid;
    ctx.beginPath(); ctx.moveTo(PAD.l, Y(y) + 0.5); ctx.lineTo(w - PAD.r, Y(y) + 0.5); ctx.stroke();
    ctx.fillText(y.toFixed(yDigits), PAD.l - 6, Y(y));
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xTicks) {
    ctx.strokeStyle = t.strong ? colors.beat : colors.grid;
    ctx.lineWidth = t.strong ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(Math.round(X(t.x)) + 0.5, PAD.t); ctx.lineTo(Math.round(X(t.x)) + 0.5, h - PAD.b); ctx.stroke();
    ctx.fillText(t.label, X(t.x), h - PAD.b + 6);
  }
  ctx.lineWidth = 1;
  return { X, Y };
}

export function plot(ctx: CanvasRenderingContext2D, X: Map1, Y: Map1, x0: number, x1: number, n: number, f: Map1, color: string, width: number, dash: number[] = []): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n;
    const y = f(x);
    if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius = 4.5): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = colors.panel;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
}

/** Samples per curve: two per pixel, and every beat lands on a sample. */
export const samples = (w: number): number => Math.max(512, Math.ceil(w / 256) * 512);

export function playhead(s: Surface, X: Map1, pos: number): void {
  s.ctx.strokeStyle = colors.play;
  s.ctx.lineWidth = 2;
  s.ctx.beginPath(); s.ctx.moveTo(X(pos), PAD.t); s.ctx.lineTo(X(pos), s.h - PAD.b); s.ctx.stroke();
}
