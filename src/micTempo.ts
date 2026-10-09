/**
 * The microphone half of tempo detection, shared by the /tempo/ page and the main page: opens the microphone (no echo
 * cancellation, noise suppression or gain control), feeds it to the tempo detector through an AudioWorklet, analyses every
 * quarter second of audio, keeps the beat clock (src/beatClock.ts) and carries it forward to the sound reaching the
 * microphone now, on the page's clock (`beatsAt`).
 */

import { BeatClock } from './beatClock';
import { TempoDetector, type Analysis } from './tempoDetect';

/** Seconds of audio between analyses. */
export const EVERY = 0.25;
/** The arrival floor may rise this many ms per second of audio, to follow a drift between the audio clock and the page's. */
const FLOOR_LEAK = 0.5;
/**
 * A refit that moves the strobe's beats back by less than this many beats is held still until the clock catches up:
 * the limiter takes any step back for a fresh count and would mute the flash under way.
 */
const STROBE_HOLD = 0.1;
/** The page's clock takes the grid's latest beat only between these fractions of a beat, where the flash is dark. */
const RETUNE_FROM = 0.4;
const RETUNE_TO = 0.8;
/** The input level meter falls this many dB a second. */
const LEVEL_FALL = 20;

// The worklet only gathers the microphone's samples into blocks and posts them.
const WORKLET = `
class TempoTap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const chans = inputs[0];
    if (chans && chans.length) {
      const len = chans[0].length, k = chans.length;
      for (let i = 0; i < len; i++) {
        let v = 0;
        for (let c = 0; c < k; c++) v += chans[c][i];
        this.buf[this.n++] = v / k;
        if (this.n === this.buf.length) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(2048);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('tempo-tap', TempoTap);
`;

/**
 * The beat clock on the page clock: a beat's performance.now(), the beat's length in ms, and `epoch`, which moves when the
 * count of beats starts again. Held steady between retunes, since the flash limiter takes any move of a flash's peak while
 * it rises for a tap moving the grid.
 */
export interface Wall { at: number; ms: number; epoch: number }

interface Open { ctx: AudioContext; stream: MediaStream; node: AudioWorkletNode }

export class MicTempo {
  det: TempoDetector | null = null;
  /** The detector's final outcome: a tempo and a beat time that run on by themselves. */
  clock = new BeatClock();
  /** Peak level of the input in dB, falling; -Infinity while closed. */
  level = -Infinity;
  /** Seconds from the sound at the microphone to the samples in the audio graph, when the browser reports it. */
  inputLatency = 0;
  /** The smallest (performance.now() at a block's arrival - its last sample's time) seen, ms: the audio's time 0 on the page clock. */
  floor = Infinity;
  /** What the opened microphone says about itself, for the page to show. */
  facts = '';
  error = '';
  arming = false;
  /** Called after every analysis tick (null while the detector has nothing yet) and after every block. */
  onAnalysis: (a: Analysis | null) => void = () => {};
  onBlock: () => void = () => {};
  private open: Open | null = null;
  private pushed = 0;
  private nextAt = EVERY;
  private wall: Wall | null = null;
  private epoch = 0;
  private strobeBeats = -Infinity;
  private retunedAt = -Infinity;

  get listening(): boolean { return this.open !== null; }

  /**
   * Opens the microphone. The context is made by the caller inside the user's gesture when it can, so Safari lets it run;
   * without one it is made here. Resolves to whether the microphone is open; the reason it is not is in `error`.
   */
  async arm(ctx: AudioContext = new AudioContext()): Promise<boolean> {
    if (this.arming || this.open) { void ctx.close(); return this.open !== null; }
    this.arming = true;
    this.error = '';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      await ctx.resume();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'tempo-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      // silent, but connected, so every browser keeps pulling the worklet
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(node).connect(mute).connect(ctx.destination);
      this.det = new TempoDetector(ctx.sampleRate);
      this.reset();
      node.port.onmessage = (e: MessageEvent<Float32Array>) => this.hear(e.data);
      this.open = { ctx, stream, node };
      const track = stream.getAudioTracks()[0];
      const s = track?.getSettings() ?? {};
      const latency = (s as { latency?: unknown }).latency;
      this.inputLatency = typeof latency === 'number' && Number.isFinite(latency) ? latency : 0;
      const onOff = (v: unknown): string => (v === undefined ? 'not reported' : v ? 'on' : 'off');
      this.facts = `${track?.label || 'microphone'}\nsample rate ${ctx.sampleRate} Hz\n`
        + `echo cancellation ${onOff(s.echoCancellation)}, noise suppression ${onOff(s.noiseSuppression)}, auto gain ${onOff(s.autoGainControl)}`;
      return true;
    } catch (e) {
      void ctx.close();
      this.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      return false;
    } finally {
      this.arming = false;
    }
  }

  /** Releases the microphone; the detector and the clock keep what they had. Arming again starts from scratch. */
  disarm(): void {
    if (!this.open) return;
    this.open.node.port.onmessage = null;
    for (const t of this.open.stream.getTracks()) t.stop();
    void this.open.ctx.close();
    this.open = null;
    this.level = -Infinity;
    this.facts = 'Not open.';
  }

  /** The detector and the beat clock start again. */
  reset(): void {
    this.det?.reset();
    this.clock = new BeatClock();
    this.nextAt = EVERY;
    this.pushed = 0;
    this.floor = Infinity;
    this.strobeBeats = -Infinity;
    this.wall = null;
    this.retunedAt = -Infinity;
  }

  private hear(block: Float32Array): void {
    const det = this.det;
    if (!det) return;
    const fs = det.env.fs;
    this.pushed += block.length;
    this.floor = Math.min(performance.now() - (this.pushed / fs) * 1000, this.floor + (FLOOR_LEAK * block.length) / fs);
    let sq = 0;
    for (let i = 0; i < block.length; i++) sq += block[i]! * block[i]!;
    // a peak meter: it jumps up to a loud block and falls LEVEL_FALL dB a second, so the gaps between hits do not empty it
    const db = 10 * Math.log10(sq / block.length + 1e-12);
    this.level = Math.max(db, this.level - (LEVEL_FALL * block.length) / fs);
    det.push(block);
    if (det.seconds >= this.nextAt) {
      this.nextAt = det.seconds + EVERY;
      const a = det.analyse();
      if (a) this.clock.update(a);
      this.onAnalysis(a);
    }
    this.onBlock();
  }

  /**
   * The beat clock carried forward to the sound reaching the microphone now: the count of beats on the page clock (a whole
   * number is a beat) and the tempo. Null until the clock has a beat and the audio is timed against the page.
   */
  beatsAt(now: number): { beats: number; bpm: number } | null {
    if (this.clock.beat === null || !Number.isFinite(this.floor)) { this.wall = null; return null; }
    // the clock's beat on the page clock: the sound of it reaches the microphone at this performance.now()
    const ms = this.clock.period * 1000;
    let at = this.floor + (this.clock.beat - this.inputLatency) * 1000;
    if (!this.wall) this.wall = { at, ms, epoch: ++this.epoch };
    const old = (now - this.wall.at) / this.wall.ms;
    const whole = Math.floor(old);
    // retuned once a beat, in its dark middle, so no flash sees its clock move; the count carries on from the old one
    if (old - whole >= RETUNE_FROM && old - whole < RETUNE_TO && whole !== this.retunedAt) {
      at += Math.round((now - at) / ms - old) * ms;
      this.wall = { at, ms, epoch: this.wall.epoch };
      this.retunedAt = whole;
    }
    let beats = (now - this.wall.at) / this.wall.ms;
    if (beats < this.strobeBeats && this.strobeBeats - beats < STROBE_HOLD) beats = this.strobeBeats;
    this.strobeBeats = beats;
    return { beats, bpm: 60000 / this.wall.ms };
  }

  /** The clock of the last `beatsAt`: it goes on running by itself after the microphone is closed. */
  get beatWall(): Wall | null { return this.wall; }
}
