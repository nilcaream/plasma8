/**
 * The beat clock behind the /tempo/ strobe: the detector's final outcome, a tempo and a beat time that run on by
 * themselves. It starts at the first grid fit and then never stops: through a breakdown, a dropout or silence it
 * keeps the last tempo and offset.
 *
 * Its tempo moves in two ways only. A grid within SAME_BPM of it is the same tempo, measured more precisely, and is
 * taken at the next re-anchor. A grid further away is a new tempo, taken only when it is sure: the fits must stay
 * within SAME_BPM of each other for CHANGE_SECONDS in a row, each with a standard error of at most CHANGE_SD, at
 * least CHANGE_FITS of them and none more than CHANGE_GAP after the one before. An analysis that hears no beat
 * neither counts for the new tempo nor breaks the run: in quiet or sparse music the beat comes and goes from one
 * analysis to the next, and a run that needs every one of them never finishes.
 *
 * Its offset moves in steps: every ANCHOR_PEAKS new on-grid peaks the clock takes the grid's beat (and its tempo,
 * when it is the same one and precise). A step of more than STEP_BEATS is taken only when the next re-anchor finds
 * it again; a step of half a beat (the grid's parity changing) also needs the grid's parity to be clear (beatShare
 * at least PARITY_SHARE), and otherwise the clock re-anchors on its own parity.
 */

import type { Analysis, GridFit } from './tempoDetect';

/** A grid within this many BPM of the clock is the same tempo. */
export const SAME_BPM = 1;
/** A new tempo needs fits that agree with each other for this many seconds in a row... */
export const CHANGE_SECONDS = 2;
/**
 * ...each this precise: the fit's standard error at most this many BPM. Not the detector's confidence: that is the share
 * of onset strength on the grid over the whole fit window, which still holds the old tempo for many seconds after a change.
 */
export const CHANGE_SD = 0.1;
/** ...at least this many of them (half the analyses of CHANGE_SECONDS, one every 0.25 s)... */
export const CHANGE_FITS = 4;
/**
 * ...and none more than this many seconds after the one before: two lone fits far apart are not a run. Through a quiet
 * room the precise fits of a held tempo came 1.0–1.5 s apart (Four Tet "Baby", Burial "Archangel").
 */
export const CHANGE_GAP = 2;
/**
 * A fit counts toward a new tempo only when its grid holds at least this share of the evidence of the tempo the clock
 * holds; one below it is taken as no beat heard. Evidence is the onset strength on a grid's half beats over the last
 * EVIDENCE_SECONDS. Through a beatless stretch of pad and claps the grid wanders over a few weak hits that any tempo
 * fits; their evidence stays a fraction of the beat's, while a real new tempo is about as strong as the old one.
 */
export const EVIDENCE_SHARE = 0.5;
export const EVIDENCE_SECONDS = 4;
/** The held tempo's evidence is the most it had, halving every this many seconds, so a quieter new tempo is taken in the end. */
export const EVIDENCE_HALF_LIFE = 30;
/** The clock takes the grid's beat every this many new on-grid peaks. */
export const ANCHOR_PEAKS = 4;
/** A re-anchor moves the offset by at most this share of a beat at once; a bigger step needs two re-anchors in a row that agree. */
export const STEP_BEATS = 1 / 8;
/** A step of about half a beat (the grid's parity changing) needs at least this share of the grid's strength on the new beat (0.5..1). */
export const PARITY_SHARE = 0.6;
/** A re-anchor takes a fit only with at least this share of the onset strength on its grid... */
export const ANCHOR_ON_GRID = 0.3;
/** ...and its tempo only when the fit's standard error is at most this, BPM. */
export const REFINE_SD = 0.05;
/** A peak counts as new when it is this many seconds after the last one counted: the same hit, picked again, is not. */
const SAME_PEAK = 0.05;

export class BeatClock {
  /** A beat's time, seconds of audio, and the beat's length; `beat` is null until the first grid fit. */
  beat: number | null = null;
  period = 0;
  /** Moves on every change of beat or period, so a reader knows when to take the clock again. */
  version = 0;
  /** Tempo changes taken, and re-anchors on the same tempo. */
  changes = 0;
  anchors = 0;
  private lastPeak = -Infinity;
  private count = 0;
  private candidate: { bpm: number; since: number; last: number; fits: number } | null = null;
  /** A big offset step seen at the last re-anchor and not yet taken, seconds. */
  private step: number | null = null;
  /** The held tempo's evidence at its most, and when. */
  private held = 0;
  private heldAt = 0;

  get bpm(): number { return 60 / this.period; }

  /** Takes one analysis; the clock moves only as the rules above say. */
  update(a: Analysis): void {
    const g = a.grid;
    // no beat heard says nothing about a new tempo either way: the candidate waits for the next beat
    if (!a.beat || !g) return;
    if (this.beat === null) { this.take(g, a); return; }
    const e = evidence(a, g);
    if (Math.abs(g.bpm - this.bpm) <= SAME_BPM) {
      this.candidate = null;
      if (e >= this.heldNow(a.time)) { this.held = e; this.heldAt = a.time; }
      for (const p of a.peaks) {
        if (p.onGrid && p.t > this.lastPeak + SAME_PEAK) { this.count++; this.lastPeak = p.t; }
      }
      if (this.count >= ANCHOR_PEAKS) this.anchor(g);
      return;
    }
    if (e < EVIDENCE_SHARE * this.heldNow(a.time)) return;
    if (g.sd > CHANGE_SD) { this.candidate = null; return; }
    const c = this.candidate;
    if (!c || Math.abs(g.bpm - c.bpm) > SAME_BPM || a.time - c.last > CHANGE_GAP) {
      this.candidate = { bpm: g.bpm, since: a.time, last: a.time, fits: 1 };
      return;
    }
    c.bpm = g.bpm;
    c.last = a.time;
    c.fits++;
    if (a.time - c.since >= CHANGE_SECONDS && c.fits >= CHANGE_FITS) { this.take(g, a); this.changes++; }
  }

  private heldNow(time: number): number { return this.held * 0.5 ** ((time - this.heldAt) / EVIDENCE_HALF_LIFE); }

  /** The grid's beat and tempo, as they are: the first fit, or a new tempo. */
  private take(g: GridFit, a: Analysis): void {
    this.held = evidence(a, g);
    this.heldAt = a.time;
    this.beat = g.beat;
    this.period = g.period;
    this.candidate = null;
    this.step = null;
    this.count = 0;
    for (const p of a.peaks) if (p.onGrid) this.lastPeak = Math.max(this.lastPeak, p.t);
    this.version++;
  }

  /**
   * The grid's beat on the same tempo. A step of more than STEP_BEATS (a fit that put the beat on an off-beat hit, or the
   * music's phase really moving) is taken only when the next re-anchor finds the same step.
   */
  private anchor(g: GridFit): void {
    if (g.onGridShare < ANCHOR_ON_GRID) return;
    const period = g.sd <= REFINE_SD ? g.period : this.period;
    const tol = STEP_BEATS * this.period;
    let beat = g.beat;
    let d = beat - this.beat! - Math.round((beat - this.beat!) / this.period) * this.period;
    // on a near coin flip between the beat and the half beat the clock keeps the parity it has
    if (Math.abs(Math.abs(d) - this.period / 2) <= tol && g.beatShare < PARITY_SHARE) {
      beat -= Math.sign(d) * (g.period / 2);
      d -= Math.sign(d) * (this.period / 2);
    }
    this.count = 0;
    if (Math.abs(d) > tol) {
      const confirmed = this.step !== null && Math.abs(d - this.step) <= tol;
      this.step = confirmed ? null : d;
      if (!confirmed) return;
    } else this.step = null;
    this.beat = beat;
    this.period = period;
    this.anchors++;
    this.version++;
  }
}

/** The onset strength of the last EVIDENCE_SECONDS within the fit's tolerance (15 % of a half beat) of the grid's half beats. */
function evidence(a: Analysis, g: GridFit): number {
  const half = g.period / 2;
  const tol = 0.15 * half;
  let on = 0;
  for (const p of a.peaks) {
    if (p.t <= a.time - EVIDENCE_SECONDS) continue;
    const d = p.t - g.beat - Math.round((p.t - g.beat) / half) * half;
    if (Math.abs(d) <= tol) on += p.strength;
  }
  return on;
}
