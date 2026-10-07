import { describe, expect, it } from 'vitest';
import { PEAK_WINDOW_MS, FlashPeaks, formatDump, type DumpData } from './dump';

const data: DumpData = {
  name: 'plasma',
  home: 0.35,
  seed: 'd5f5b161',
  transition: { state: 'fade', to: 'julia-kaleidoscope', style: 'wipe', progress: 0.5 },
  bpm: 129.74,
  beats: 47.62,
  bar: 12,
  beatInBar: 4,
  intensity: 0.34,
  strobe: 0.44,
  moving: [
    { key: 'scale', voice: 'kick', value: 1.234 },
    { key: 'palD.1', voice: 'snare', value: 0.55 },
  ],
  flash: 0.213,
  amounts: { kick: 1, snare: 0.62, crash: 0.8 },
  limiter: 'open',
  peaks: [
    { at: 9000, value: 0.44 },
    { at: 9460, value: 0.4 },
  ],
  now: 10000,
};

/** One frame a millisecond: a spike of the given height at each of `at`, 0 elsewhere. */
function feed(peaks: FlashPeaks, spikes: readonly number[], to: number, height = 0.4): void {
  for (let t = 0; t <= to; t++) peaks.record(t, spikes.includes(t) ? height : spikes.includes(t + 1) || spikes.includes(t - 1) ? height / 2 : 0);
}

describe('formatDump', () => {
  const text = formatDump(data);

  it('names the algorithm, its home, the seed and the transition', () => {
    expect(text).toContain('plasma (home 0.35), seed d5f5b161');
    expect(text).toContain('fade to julia-kaleidoscope, wipe, 50% done');
  });

  it('gives the tempo and the place in the bar', () => {
    expect(text).toContain('129.74 BPM, bar 12 beat 4 (beats 47.62)');
  });

  it('gives the intensity and the strobe', () => {
    expect(text).toContain('intensity 0.34, strobe 0.44');
  });

  it('lists each moving value with its voice and its value now', () => {
    expect(text).toContain('scale (kick) 1.234, palD.1 (snare) 0.550');
  });

  it('gives the flash now, the voice strengths and the limiter', () => {
    expect(text).toContain('flash now 0.213, voices kick 1.00 snare 0.62 crash 0.80, limiter open');
  });

  it('lists the flash peaks of the last 5 s with their times and how many a second', () => {
    expect(text).toContain('flash peaks, last 5 s: 2 (0.4 a second): -1.00 s 0.44, -0.54 s 0.40');
  });

  it('says so when nothing moves, there is no transition and no voices', () => {
    const quiet = formatDump({ ...data, transition: { state: 'none' }, moving: [], amounts: undefined, peaks: [] });
    expect(quiet).toContain('transition: none');
    expect(quiet).toContain('moving values: none');
    expect(quiet).toContain('no voices');
    expect(quiet).toContain('last 5 s: 0 (0.0 a second)');
  });

  it('is one block: one console call takes it', () => {
    expect(text.split('\n').length).toBe(7);
  });
});

describe('FlashPeaks', () => {
  it('finds the top of each rise and fall, with its time and height', () => {
    const peaks = new FlashPeaks();
    feed(peaks, [100, 560, 1020], 1100);
    expect(peaks.recent(1100).map((p) => p.at)).toEqual([100, 560, 1020]);
    expect(peaks.recent(1100)[0]!.value).toBe(0.4);
  });

  it('ignores a flash value too small to be a flash', () => {
    const peaks = new FlashPeaks();
    feed(peaks, [100, 560], 700, 0.01);
    expect(peaks.recent(700)).toEqual([]);
  });

  it('keeps the last 5 s only, in the list and in what it holds', () => {
    const peaks = new FlashPeaks();
    feed(peaks, [100, 560, 6000, 6460], 7000);
    expect(peaks.recent(7000).map((p) => p.at)).toEqual([6000, 6460]);
    // a long run holds no more than 5 s of peaks, 2 a second here
    const long = new FlashPeaks();
    const spikes = Array.from({ length: 200 }, (_, i) => 100 + i * 460);
    feed(long, spikes, 100 + 200 * 460);
    expect(long.held).toBeLessThanOrEqual(PEAK_WINDOW_MS / 460 + 2);
  });

  it('counts a plateau (the flash capped at 1) as one peak', () => {
    const peaks = new FlashPeaks();
    [0, 0.5, 1, 1, 1, 0.5, 0].forEach((v, i) => peaks.record(i * 16, v));
    expect(peaks.recent(200)).toHaveLength(1);
  });
});
