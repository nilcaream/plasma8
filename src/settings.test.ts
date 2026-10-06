import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEY, loadSettings, sanitizeSettings, saveSettings } from './settings';

function fakeStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('DEFAULT_SETTINGS', () => {
  it('is what a first visit starts with: intensity 0.15, strobe 0.15, metronome off', () => {
    expect(DEFAULT_SETTINGS).toEqual({ intensity: 0.15, strobe: 0.15, metronome: false });
    expect(loadSettings(() => fakeStorage())).toEqual({ intensity: 0.15, strobe: 0.15, metronome: false });
  });

  it('is kept only for what was never saved: a saved value stays, a missing one takes the new default', () => {
    expect(loadSettings(() => fakeStorage('{"intensity":0.5,"strobe":0}'))).toEqual({ intensity: 0.5, strobe: 0, metronome: false });
    expect(loadSettings(() => fakeStorage('{"intensity":0.7}'))).toEqual({ intensity: 0.7, strobe: 0.15, metronome: false });
  });
});

describe('sanitizeSettings', () => {
  it('keeps valid values and clamps the sliders', () => {
    expect(sanitizeSettings({ intensity: 0.8, strobe: 0.3, metronome: true })).toEqual({
      intensity: 0.8,
      strobe: 0.3,
      metronome: true,
    });
    expect(sanitizeSettings({ intensity: 7, strobe: -1 })).toMatchObject({ intensity: 1, strobe: 0 });
  });

  it('replaces wrong types and non-objects with defaults', () => {
    expect(sanitizeSettings({ intensity: 'loud', strobe: NaN, metronome: 1 })).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(5)).toEqual(DEFAULT_SETTINGS);
  });

  it('has no place for a tempo', () => {
    expect(Object.keys(sanitizeSettings({ bpm: 90 }))).toEqual(['intensity', 'strobe', 'metronome']);
  });
});

describe('loadSettings and saveSettings', () => {
  it('round-trips through storage', () => {
    const storage = fakeStorage();
    saveSettings({ intensity: 0.9, strobe: 0.2, metronome: true }, () => storage);
    expect(loadSettings(() => storage)).toEqual({ intensity: 0.9, strobe: 0.2, metronome: true });
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
