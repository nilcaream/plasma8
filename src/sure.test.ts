import { describe, expect, it } from 'vitest';
import { BeatClock } from './beatClock';
import { SURE_CONFIDENCE, SURE_FITS, SURE_SD, SURE_SECONDS, SURE_SPREAD, Sureness } from './sure';
import { CASES, run } from './tempoBench';
import type { Analysis } from './tempoDetect';
import { tempoAt } from './tempoSynth';

/** An analysis with just what Sureness reads. */
function analysis(time: number, over: { bpm?: number; sd?: number; confidence?: number; beat?: boolean } = {}): Analysis {
  const { bpm = 128, sd = 0.01, confidence = 0.9, beat = true } = over;
  return { time, beat, confidence, grid: { bpm, sd } } as unknown as Analysis;
}

/** Feeds one analysis every quarter second from `from` for `seconds`; returns whether it was sure at the end. */
function feed(sure: Sureness, from: number, seconds: number, clockBpm: number | null = 128, over: Parameters<typeof analysis>[1] = {}): boolean {
  let now = false;
  for (let t = from; t < from + seconds + 1e-9; t += 0.25) now = sure.update(analysis(t, over), clockBpm);
  return now;
}

describe('Sureness', () => {
  it('is not sure before it has SURE_FITS precise fits', () => {
    const sure = new Sureness();
    expect(feed(sure, 3, (SURE_FITS - 2) * 0.25)).toBe(false);
    expect(sure.update(analysis(3 + (SURE_FITS - 1) * 0.25), 128)).toBe(true);
  });

  it('is sure from steady, precise, confident fits that the beat clock agrees with', () => {
    const sure = new Sureness();
    expect(feed(sure, 3, SURE_SECONDS)).toBe(true);
    expect(sure.sure).toBe(true);
  });

  it('stays sure until reset, whatever comes after', () => {
    const sure = new Sureness();
    feed(sure, 3, SURE_SECONDS);
    expect(sure.update(analysis(20, { beat: false }), 140)).toBe(true);
    sure.reset();
    expect(sure.sure).toBe(false);
    expect(sure.update(analysis(21), 128)).toBe(false);
  });

  it('starts again when the beat clock takes a new tempo, and not when its count stays', () => {
    const sure = new Sureness();
    for (let t = 3; t < 3 + SURE_SECONDS; t += 0.25) sure.update(analysis(t), 128, 2);
    expect(sure.sure).toBe(true);
    expect(sure.update(analysis(8, { beat: false }), 128, 2)).toBe(true);
    expect(sure.update(analysis(8.25, { bpm: 135 }), 135, 3)).toBe(false);
    expect(sure.agreeing).toBe(1); // the fits of the old tempo are gone; this one counts
  });

  it('was sure through a new tempo taken by the clock, until reset', () => {
    const sure = new Sureness();
    expect(sure.wasSure).toBe(false);
    for (let t = 3; t < 3 + SURE_SECONDS; t += 0.25) sure.update(analysis(t), 128, 2);
    expect(sure.wasSure).toBe(true);
    sure.update(analysis(8.25, { bpm: 135 }), 135, 3);
    expect(sure.sure).toBe(false);
    expect(sure.wasSure).toBe(true);
    sure.reset();
    expect(sure.wasSure).toBe(false);
  });

  it('is not sure while the fits wander more than SURE_SPREAD BPM', () => {
    const sure = new Sureness();
    let got = false;
    for (let i = 0; i < 40; i++) got = sure.update(analysis(3 + i * 0.25, { bpm: 128 + (i % 2 ? SURE_SPREAD * 1.5 : 0) }), 128) || got;
    expect(got).toBe(false);
  });

  it('is not sure from imprecise fits, or from fits the detector has little confidence in', () => {
    expect(feed(new Sureness(), 3, 10, 128, { sd: SURE_SD * 2 })).toBe(false);
    expect(feed(new Sureness(), 3, 10, 128, { confidence: SURE_CONFIDENCE / 2 })).toBe(false);
  });

  it('does not count a beat that is heard but not precise or not confident, and keeps the run', () => {
    const sure = new Sureness();
    feed(sure, 3, 1.5); // 7 fits, short of SURE_FITS
    sure.update(analysis(4.75, { sd: SURE_SD * 2 }), 128);
    sure.update(analysis(5, { confidence: SURE_CONFIDENCE / 2 }), 128);
    expect(sure.update(analysis(5.25), 128)).toBe(false); // 8 fits
    expect(sure.update(analysis(5.5), 128)).toBe(false); // 9
    expect(sure.update(analysis(5.75), 128)).toBe(true); // 10, the two misses left out
  });

  it('skips an analysis that hears no beat, as the beat clock does: it neither counts nor breaks the run', () => {
    const sure = new Sureness();
    let at = -1;
    for (let i = 0; i < 40 && at < 0; i++) {
      const t = 3 + i * 0.25;
      if (sure.update(i % 3 === 1 ? analysis(t, { beat: false }) : analysis(t), 128)) at = t;
    }
    expect(at).toBeGreaterThan(0);
  });

  it('waits for the beat clock: not sure without one, or while it is more than a BPM from the fits', () => {
    expect(feed(new Sureness(), 3, 10, null)).toBe(false);
    expect(feed(new Sureness(), 3, 10, 130)).toBe(false);
    expect(feed(new Sureness(), 3, 10, 128.5)).toBe(true);
  });

  it('counts the fits that agree, one more per fit, and reads SURE_FITS only once sure', () => {
    const sure = new Sureness();
    expect(sure.agreeing).toBe(0);
    for (let i = 0; i < SURE_FITS - 1; i++) {
      sure.update(analysis(3 + i * 0.25), null); // no beat clock yet: the fits count, sureness waits
      expect(sure.agreeing).toBe(i + 1);
    }
    sure.update(analysis(3 + (SURE_FITS - 1) * 0.25), null);
    expect(sure.sure).toBe(false);
    expect(sure.agreeing).toBe(SURE_FITS - 1); // ten agree, but the tenth dot is sureness
    expect(sure.update(analysis(3 + SURE_FITS * 0.25), 128)).toBe(true);
    expect(sure.agreeing).toBe(SURE_FITS);
    sure.reset();
    expect(sure.agreeing).toBe(0);
  });

  it('counts only the biggest group of fits within SURE_SPREAD of each other', () => {
    const sure = new Sureness();
    const bpms = [128, 130, 128.02, 130.02, 128.04, 140, 128.06];
    bpms.forEach((bpm, i) => sure.update(analysis(3 + i * 0.25, { bpm }), null));
    expect(sure.agreeing).toBe(4); // 128, 128.02, 128.04, 128.06
  });

  it('forgets fits older than SURE_SECONDS', () => {
    const sure = new Sureness();
    feed(sure, 3, 1); // 5 fits...
    // ...then nothing for a long time: those are gone, so 5 more are not enough
    expect(feed(sure, 30, 1)).toBe(false);
  });
});

describe('Sureness on the synthetic bench', () => {
  const sureOn = (name: string): { at: number | null; bpm: number; truth: number } => {
    const c = CASES.find((x) => x.name === name)!;
    const clock = new BeatClock();
    const sure = new Sureness();
    let at: number | null = null;
    let bpm = 0;
    let truth = 0;
    run(c.spec, 0.25, (a, t) => {
      if (a) clock.update(a);
      if (at === null && sure.update(a, clock.beat === null ? null : clock.bpm)) {
        at = t;
        bpm = clock.bpm;
        truth = tempoAt(c.spec, t);
      }
    });
    return { at, bpm, truth };
  };

  it.each(['C jump 128 to 135 at 15 s', 'C jump 140 to 124 breakA'])(
    'listening on through %s, is sure of the first tempo, unsure once the clock takes the second, then sure of it',
    (name) => {
      const c = CASES.find((x) => x.name === name)!;
      const clock = new BeatClock();
      const sure = new Sureness();
      const states: { t: number; sure: boolean }[] = [];
      run(c.spec, 0.25, (a, t) => {
        if (a) clock.update(a);
        states.push({ t, sure: sure.update(a, clock.beat === null ? null : clock.bpm, clock.changes) });
      });
      const at = c.spec.change!.at;
      expect(states.some((s) => s.t < at && s.sure)).toBe(true);
      expect(states.some((s) => s.t > at && !s.sure)).toBe(true);
      expect(states.at(-1)!.sure).toBe(true);
      expect(Math.abs(clock.bpm - c.spec.change!.bpm)).toBeLessThan(0.1);
    },
    60_000,
  );

  it.each(['4floor 128', 'breakA 130', 'snare only 130', 'H half-time 140', 'S shuffle 128 (triplet 16ths)'])(
    'is sure within 10 s of %s, at its tempo',
    (name) => {
      const s = sureOn(name);
      expect(s.at).not.toBeNull();
      expect(s.at!).toBeLessThan(10);
      expect(Math.abs(s.bpm - s.truth)).toBeLessThan(0.1);
    },
    60_000,
  );
});
