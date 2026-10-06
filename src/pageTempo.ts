import { TapClock, toBpm, formatTempo } from './clock';

/**
 * A graph page's beat position. A tap goes to the app's own tap clock, with
 * the same fit and the same rule that a tap after a pause is beat 1, and the
 * page then follows it. Moving the BPM slider sets the tempo by hand from
 * there, keeping the phase, and the next tap starts from that tempo.
 */
export class PageTempo {
  private clock: TapClock;
  private following = false;
  private t0: number;
  private beatsAtT0 = 0;
  private bpm: number;

  constructor(now: number, bpm: number) {
    this.t0 = now;
    this.bpm = toBpm(bpm);
    this.clock = new TapClock(now, this.bpm);
  }

  /** Beats since beat 1 of bar 1. */
  beats(now: number): number {
    return this.following ? this.clock.read(now).beats : this.beatsAtT0 + ((now - this.t0) * this.bpm) / 60000;
  }

  tempo(now: number): { bpm: number; label: string } {
    if (!this.following) return { bpm: this.bpm, label: formatTempo(this.bpm, undefined) };
    const r = this.clock.read(now);
    return { bpm: r.bpm, label: formatTempo(r.bpm, r.bpmError) };
  }

  tap(time: number): void {
    if (this.clock.tap(time)) this.following = true;
  }

  setBpm(bpm: number, now: number): void {
    this.beatsAtT0 = this.beats(now);
    this.t0 = now;
    this.bpm = toBpm(bpm);
    this.following = false;
    this.clock = new TapClock(now, this.bpm);
  }

  /** Back to beat 1 now, at the tempo it has. */
  restart(now: number): void {
    this.bpm = this.tempo(now).bpm;
    this.beatsAtT0 = 0;
    this.t0 = now;
    this.following = false;
    this.clock = new TapClock(now, this.bpm);
  }
}
