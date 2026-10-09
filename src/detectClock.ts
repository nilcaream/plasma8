/**
 * The visuals' clock while the tempo comes from the microphone (tempo source Detect). It reads like the tap clock
 * (src/clock.ts) but its tempo and its beats are the detector's: the beat clock of src/beatClock.ts on the page's clock
 * (`Wall`, src/micTempo.ts), which goes on running by itself when the microphone is closed.
 *
 * A press is a hint where bar 1 is, and only that: it never reaches the detector and moves nothing of the tempo or of
 * where the beats fall. The detected beat nearest the press becomes beat 1 of bar 1. A press more than RESET_GAP_MS after
 * the one before starts a fresh count (the visuals change); follow-up presses within that are ignored. Before the first
 * detected beat the clock free-runs at DEFAULT_BPM from the press; then it takes the detected tempo and beats, keeping the
 * beat of the bar it was on, so the picture moves by less than a beat.
 */

import { BEATS_PER_BAR, DEFAULT_BPM, RESET_GAP_MS, type ClockReading } from './clock';
import type { Wall } from './micTempo';

export class DetectClock {
  private wall: Wall | null = null;
  /** The detector's beat count at beat 1 of bar 1. */
  private offset = 0;
  /** While there is no detected beat: where beat 1 of bar 1 sits on the page's clock. */
  private anchor: number;
  private synced = false;
  private run = 0;
  private lastPress = -Infinity;

  constructor(start = 0, private readonly bpm = DEFAULT_BPM) {
    this.anchor = start;
  }

  /** The detector's clock of the moment, or null when it has none (it keeps the last it had). Call once a frame. */
  setWall(wall: Wall | null, now: number): void {
    if (!wall || wall === this.wall) return;
    if (!this.wall || wall.epoch !== this.wall.epoch) {
      // the beats start counting again: the whole beat the clock is on goes on as the beat of the bar it was, on the detector's phase
      const whole = Math.floor(this.read(now).beats);
      this.wall = wall;
      this.offset = Math.floor((now - wall.at) / wall.ms) - whole;
    } else this.wall = wall;
  }

  /** A press at `now` (the time the event happened). Returns whether it is beat 1 of bar 1, a fresh count: false for a follow-up. */
  press(now: number): boolean {
    const gap = now - this.lastPress;
    this.lastPress = now;
    if (this.synced && gap >= 0 && gap <= RESET_GAP_MS) return false;
    this.synced = true;
    this.run += 1;
    if (this.wall) this.offset = Math.round((now - this.wall.at) / this.wall.ms);
    else this.anchor = now;
    return true;
  }

  read(now: number): ClockReading {
    const bpm = this.wall ? 60000 / this.wall.ms : this.bpm;
    const raw = this.wall ? (now - this.wall.at) / this.wall.ms - this.offset : ((now - this.anchor) * bpm) / 60000;
    const beats = Math.max(0, raw);
    const wholeBeat = Math.floor(beats);
    const beatInBar = wholeBeat % BEATS_PER_BAR;
    const beatPhase = beats - wholeBeat;
    return {
      bpm,
      bpmError: undefined,
      synced: this.synced,
      run: this.run,
      taps: 0,
      lastTapAt: this.lastPress,
      beats,
      beatPhase,
      beatInBar,
      barPhase: (beatInBar + beatPhase) / BEATS_PER_BAR,
      bar: Math.floor(wholeBeat / BEATS_PER_BAR),
    };
  }
}
