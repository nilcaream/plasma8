import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, PLAYABLE, STORAGE_KEY, SYNC_MAX, loadSettings, sanitizeSettings, saveSettings, settingPatch, type Settings } from './settings';

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const FIRST_VISIT: Settings = {
  intensity: 0.15,
  strobe: 0.15,
  source: 'tap',
  continuous: false,
  minBars: 2,
  maxBars: 4,
  sync: 0,
  plays: PLAYABLE,
};

describe('DEFAULT_SETTINGS', () => {
  it('is what a first visit starts with: tap, continuous off, 2 to 4 bars, sync 0, every algorithm lit', () => {
    expect(DEFAULT_SETTINGS).toEqual(FIRST_VISIT);
    expect(loadSettings(() => fakeStorage())).toEqual(FIRST_VISIT);
  });

  it('is kept only for what was never saved: a saved value stays, a missing one takes the new default', () => {
    expect(loadSettings(() => fakeStorage('{"intensity":0.5,"strobe":0}'))).toEqual({ ...FIRST_VISIT, intensity: 0.5, strobe: 0 });
    expect(loadSettings(() => fakeStorage('{"intensity":0.7}'))).toEqual({ ...FIRST_VISIT, intensity: 0.7 });
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid values and clamps the sliders', () => {
    expect(sanitizeSettings({ intensity: 0.8, strobe: 0.3 })).toMatchObject({ intensity: 0.8, strobe: 0.3 });
    expect(sanitizeSettings({ intensity: 7, strobe: -1 })).toMatchObject({ intensity: 1, strobe: 0 });
  });

  it('keeps the tempo source, continuous listen, the range of lengths and what plays', () => {
    const saved = { source: 'detect', continuous: true, minBars: 1, maxBars: 16, sync: 23, plays: ['tunnel'] };
    expect(sanitizeSettings(saved)).toMatchObject(saved);
  });

  it('keeps the lit algorithms in the order of the buttons, drops unknown names, and lights all when none is left', () => {
    expect(sanitizeSettings({ plays: ['julia-kaleidoscope', 'plasma', 'plasma', 'nope'] }).plays).toEqual(['plasma', 'julia-kaleidoscope']);
    expect(sanitizeSettings({ plays: [] }).plays).toEqual(PLAYABLE);
    expect(sanitizeSettings({ plays: ['nope'] }).plays).toEqual(PLAYABLE);
  });

  it('keeps the sync a whole number of milliseconds from 0 to SYNC_MAX', () => {
    expect(sanitizeSettings({ sync: 20.4 }).sync).toBe(20);
    expect(sanitizeSettings({ sync: 400 }).sync).toBe(SYNC_MAX);
    expect(sanitizeSettings({ sync: -5 }).sync).toBe(0);
    expect(sanitizeSettings({ sync: 'late' }).sync).toBe(0);
  });

  it('replaces wrong types and non-objects with defaults', () => {
    expect(sanitizeSettings({ intensity: 'loud', strobe: NaN })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ source: 'clap', continuous: 'yes', minBars: 3, maxBars: '4', plays: 7 })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ plays: 'tunnel' })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(5)).toEqual(DEFAULT_SETTINGS);
  });

  it('never lets max be below min, whatever was saved', () => {
    expect(sanitizeSettings({ minBars: 8, maxBars: 2 })).toMatchObject({ minBars: 8, maxBars: 8 });
    expect(sanitizeSettings({ minBars: 16 })).toMatchObject({ minBars: 16, maxBars: 16 });
  });

  it('has no place for a tempo or for the metronome setting an older version saved', () => {
    expect(Object.keys(sanitizeSettings({ bpm: 90, metronome: true })).sort()).toEqual(
      ['continuous', 'intensity', 'maxBars', 'minBars', 'plays', 'source', 'strobe', 'sync'],
    );
  });
});

describe('settingPatch', () => {
  it('sets the tempo source and continuous listen from a button', () => {
    expect(settingPatch(DEFAULT_SETTINGS, 'source', 'detect')).toEqual({ source: 'detect' });
    expect(settingPatch(DEFAULT_SETTINGS, 'continuous', 'on')).toEqual({ continuous: true });
    expect(settingPatch(DEFAULT_SETTINGS, 'continuous', 'off')).toEqual({ continuous: false });
  });

  it('switches an algorithm off and on again, and keeps the lit ones in the order of the buttons', () => {
    const off = settingPatch(DEFAULT_SETTINGS, 'plays', 'plasma');
    expect(off).toEqual({ plays: ['tunnel', 'domain-warped-noise', 'julia-kaleidoscope'] });
    const again = settingPatch({ ...DEFAULT_SETTINGS, ...off }, 'plays', 'plasma');
    expect(again).toEqual({ plays: PLAYABLE });
  });

  it('does nothing when the last lit algorithm is pressed, so one always plays', () => {
    const one = { ...DEFAULT_SETTINGS, plays: ['tunnel'] };
    expect(settingPatch(one, 'plays', 'tunnel')).toBeUndefined();
    expect(settingPatch(one, 'plays', 'julia-kaleidoscope')).toEqual({ plays: ['tunnel', 'julia-kaleidoscope'] });
  });

  it('moves max along when min is pressed above it, and min when max is pressed below it', () => {
    expect(settingPatch(DEFAULT_SETTINGS, 'min', '8')).toEqual({ minBars: 8, maxBars: 8 });
    expect(settingPatch(DEFAULT_SETTINGS, 'min', '1')).toEqual({ minBars: 1, maxBars: 4 });
    expect(settingPatch(DEFAULT_SETTINGS, 'max', '1')).toEqual({ minBars: 1, maxBars: 1 });
    expect(settingPatch(DEFAULT_SETTINGS, 'max', '16')).toEqual({ minBars: 2, maxBars: 16 });
    expect(settingPatch(DEFAULT_SETTINGS, 'min', '4')).toEqual({ minBars: 4, maxBars: 4 });
  });

  it('knows nothing of a value or a setting that is not on the panel', () => {
    expect(settingPatch(DEFAULT_SETTINGS, 'source', 'clap')).toBeUndefined();
    expect(settingPatch(DEFAULT_SETTINGS, 'continuous', 'maybe')).toBeUndefined();
    expect(settingPatch(DEFAULT_SETTINGS, 'min', '3')).toBeUndefined();
    expect(settingPatch(DEFAULT_SETTINGS, 'max', 'x')).toBeUndefined();
    expect(settingPatch(DEFAULT_SETTINGS, 'plays', '')).toBeUndefined();
    expect(settingPatch(DEFAULT_SETTINGS, 'plays', 'changes')).toBeUndefined();
    expect(settingPatch(DEFAULT_SETTINGS, 'volume', '11')).toBeUndefined();
  });
});

describe('loadSettings and saveSettings', () => {
  const everything: Settings = { intensity: 0.9, strobe: 0.2, source: 'detect', continuous: true, minBars: 4, maxBars: 8, sync: 20, plays: ['plasma'] };

  it('round-trips through storage', () => {
    const storage = fakeStorage();
    saveSettings(everything, () => storage);
    expect(loadSettings(() => storage)).toEqual(everything);
  });

  it('remembers a change of the panel across a reload', () => {
    const storage = fakeStorage();
    const first = loadSettings(() => storage);
    Object.assign(first, settingPatch(first, 'source', 'detect'), settingPatch(first, 'min', '8'), settingPatch(first, 'plays', 'tunnel'));
    saveSettings(first, () => storage);
    expect(loadSettings(() => storage)).toMatchObject({ source: 'detect', minBars: 8, maxBars: 8, plays: ['plasma', 'domain-warped-noise', 'julia-kaleidoscope'] });
  });

  it('reads a store an older version wrote with the metronome in it, and leaves the metronome out', () => {
    const read = loadSettings(() => fakeStorage('{"intensity":0.4,"strobe":0.6,"metronome":true}'));
    expect(read).toEqual({ ...FIRST_VISIT, intensity: 0.4, strobe: 0.6 });
    expect('metronome' in read).toBe(false);
  });

  it('gives the defaults when nothing is stored or the JSON is broken', () => {
    expect(loadSettings(() => fakeStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(() => fakeStorage('{not json'))).toEqual(DEFAULT_SETTINGS);
  });

  it('survives storage that throws, on the accessor and on every call', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    expect(loadSettings(blocked)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, blocked)).not.toThrow();
    const full = {
      getItem: () => {
        throw new Error('x');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(loadSettings(() => full)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(DEFAULT_SETTINGS, () => full)).not.toThrow();
  });
});
