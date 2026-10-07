/**
 * What is on the screen, written as one console block when the top band is pressed
 * (src/band.ts): the algorithm, the transition, the clock, the moving values, the
 * flash and the flash peaks of the last PEAK_WINDOW_MS, so a picture that flashes
 * too much can be told from a picture that moves a lot.
 */

import type { Amounts, VoiceName } from './beatVoices';

/** The peaks list covers this long. */
export const PEAK_WINDOW_MS = 5000;
/** A local maximum of the flash value below this is not a peak. */
export const PEAK_MIN = 0.02;

export interface Peak {
  /** performance.now() of the frame it peaked on. */
  at: number;
  value: number;
}

/** The flash peaks of the last PEAK_WINDOW_MS, found from the flash value of every frame. */
export class FlashPeaks {
  private peaks: Peak[] = [];
  private older = 0;
  private prev = 0;
  private prevAt = 0;

  /** Call once a frame with the flash value shown; a frame that is the top of a rise and a fall is a peak. */
  record(now: number, value: number): void {
    if (this.prev >= PEAK_MIN && this.prev > this.older && this.prev >= value) this.peaks.push({ at: this.prevAt, value: this.prev });
    this.older = this.prev;
    this.prev = value;
    this.prevAt = now;
    const cut = now - PEAK_WINDOW_MS;
    if (this.peaks.length > 0 && this.peaks[0]!.at < cut) this.peaks = this.peaks.filter((p) => p.at >= cut);
  }

  /** How many peaks it holds. */
  get held(): number {
    return this.peaks.length;
  }

  /** The peaks in the last PEAK_WINDOW_MS before `now`, oldest first. */
  recent(now: number): Peak[] {
    return this.peaks.filter((p) => p.at >= now - PEAK_WINDOW_MS);
  }
}

export interface MovingNow {
  key: string;
  voice: VoiceName;
  value: number;
}

export interface DumpData {
  name: string;
  home: number;
  seed: string;
  /** What the picture is doing between two algorithms: nothing, one made and waiting, or the fade under way. */
  transition: { state: 'none' } | { state: 'ready' | 'fade'; to: string; style: string; progress: number };
  bpm: number;
  beats: number;
  /** From 1. */
  bar: number;
  /** From 1. */
  beatInBar: number;
  intensity: number;
  strobe: number;
  moving: readonly MovingNow[];
  flash: number;
  amounts: Amounts | undefined;
  /** 'open' while a window may flash, 'muted' while the limiter holds it dark, 'finishing' while a rising flash runs on the old grid. */
  limiter: string;
  peaks: readonly Peak[];
  now: number;
}

/** The voice strengths of a flash, `kick 1.00 snare 0.62 crash 0.80`. */
export function amountsText(amounts: Amounts | undefined): string {
  if (!amounts) return 'no voices';
  return `kick ${amounts.kick.toFixed(2)} snare ${amounts.snare.toFixed(2)} crash ${amounts.crash.toFixed(2)}`;
}

/** The values that move, with the voice that pushes each: `scale (kick), palD.1 (snare)`. */
export function movingText(moving: readonly { key: string; voice: VoiceName }[] | undefined): string {
  return moving && moving.length > 0 ? moving.map((m) => `${m.key} (${m.voice})`).join(', ') : 'none';
}

export function formatDump(d: DumpData): string {
  const transition =
    d.transition.state === 'none'
      ? 'none'
      : d.transition.state === 'fade'
        ? `fade to ${d.transition.to}, ${d.transition.style}, ${(d.transition.progress * 100).toFixed(0)}% done`
        : `${d.transition.to} is made and waits for the fade (${d.transition.style})`;
  const secs = PEAK_WINDOW_MS / 1000;
  const times = d.peaks.map((p) => `-${((d.now - p.at) / 1000).toFixed(2)} s ${p.value.toFixed(2)}`).join(', ');
  return [
    `[plasma8] on screen now: ${d.name} (home ${d.home.toFixed(2)}), seed ${d.seed}`,
    `  transition: ${transition}`,
    `  tempo ${d.bpm.toFixed(2)} BPM, bar ${d.bar} beat ${d.beatInBar} (beats ${d.beats.toFixed(2)})`,
    `  intensity ${d.intensity.toFixed(2)}, strobe ${d.strobe.toFixed(2)}`,
    `  moving values: ${d.moving.length === 0 ? 'none' : d.moving.map((m) => `${m.key} (${m.voice}) ${m.value.toFixed(3)}`).join(', ')}`,
    `  flash now ${d.flash.toFixed(3)}, voices ${amountsText(d.amounts)}, limiter ${d.limiter}`,
    `  flash peaks, last ${secs} s: ${d.peaks.length} (${(d.peaks.length / secs).toFixed(1)} a second)${times ? `: ${times}` : ''}`,
  ].join('\n');
}
