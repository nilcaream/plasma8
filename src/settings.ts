/** The settings remembered in this browser. The tempo is never one of them. */

import { DEFAULT_RANGE, isBarLength, pushRange, type BarLength } from './visualLength';

/** Where the tempo comes from: the user's taps, or the microphone's detection. */
export type TempoSource = 'tap' | 'detect';

/** What `plays` holds when the changes pick the algorithm. */
export const CHANGES = 'changes';

export interface Settings {
  /** 0 soft … 1 hard. */
  intensity: number;
  /** 0 = off. */
  strobe: number;
  source: TempoSource;
  /** Detect only: the microphone always listens; off, a long press starts it and it stops when the tempo is sure. */
  continuous: boolean;
  /** The range a visual's length in bars is drawn from; max is never below min. */
  minBars: BarLength;
  maxBars: BarLength;
  /** CHANGES, or the name of the one algorithm that plays, in a new variant of itself at every change. */
  plays: string;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  intensity: 0.15,
  strobe: 0.15,
  source: 'tap',
  continuous: false,
  minBars: DEFAULT_RANGE.min,
  maxBars: DEFAULT_RANGE.max,
  plays: CHANGES,
};

export const STORAGE_KEY = 'plasma8.settings';

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Turns whatever was stored into valid settings; anything wrong falls back to its default. */
export function sanitizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'object' || raw === null) return out;
  const o = raw as Record<string, unknown>;
  if (typeof o.intensity === 'number' && Number.isFinite(o.intensity)) out.intensity = clamp01(o.intensity);
  if (typeof o.strobe === 'number' && Number.isFinite(o.strobe)) out.strobe = clamp01(o.strobe);
  if (o.source === 'tap' || o.source === 'detect') out.source = o.source;
  if (typeof o.continuous === 'boolean') out.continuous = o.continuous;
  if (isBarLength(o.minBars)) out.minBars = o.minBars;
  if (isBarLength(o.maxBars)) out.maxBars = o.maxBars;
  if (out.maxBars < out.minBars) out.maxBars = out.minBars;
  if (typeof o.plays === 'string' && o.plays !== '') out.plays = o.plays;
  return out;
}

/**
 * What pressing a panel button changes. A button carries the name of its setting and its value (`source` `tap`, `continuous`
 * `on`, `min` `4`, `plays` `tunnel`); undefined for one this does not know. Min and max push each other (src/visualLength.ts).
 */
export function settingPatch(s: Settings, setting: string, value: string): Partial<Settings> | undefined {
  switch (setting) {
    case 'source':
      return value === 'tap' || value === 'detect' ? { source: value } : undefined;
    case 'continuous':
      return value === 'on' || value === 'off' ? { continuous: value === 'on' } : undefined;
    case 'min':
    case 'max': {
      const bars = Number(value);
      if (!isBarLength(bars)) return undefined;
      const range = pushRange({ min: s.minBars, max: s.maxBars }, setting, bars);
      return { minBars: range.min, maxBars: range.max };
    }
    case 'plays':
      return value === '' ? undefined : { plays: value };
    default:
      return undefined;
  }
}

type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem'>;

const browserStorage: StorageGetter = () => localStorage;

/** Never throws: private windows, blocked site data and bad JSON all give the defaults. */
export function loadSettings(getStorage: StorageGetter = browserStorage): Settings {
  try {
    const text = getStorage().getItem(STORAGE_KEY);
    return sanitizeSettings(text === null ? null : JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Never throws; a failed save is silent because the page works without it. */
export function saveSettings(settings: Settings, getStorage: StorageGetter = browserStorage): void {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // nothing to do: settings just do not survive this load
  }
}
