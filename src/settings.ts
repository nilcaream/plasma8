/** The settings remembered in this browser. The tempo is never one of them. */

export interface Settings {
  /** 0 soft … 1 hard. */
  intensity: number;
  /** 0 = off. */
  strobe: number;
  metronome: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = { intensity: 0.15, strobe: 0.15, metronome: false };

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
  if (typeof o.metronome === 'boolean') out.metronome = o.metronome;
  return out;
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
