import { describe, expect, it } from 'vitest';
import { PANEL_MS, metronomeShown, panelShown } from './band';

describe('metronomeShown', () => {
  it('is up while the user taps, and also while the panel is up, whatever the taps', () => {
    expect(metronomeShown(true, false)).toBe(true);
    expect(metronomeShown(false, true)).toBe(true);
    expect(metronomeShown(true, true)).toBe(true);
    expect(metronomeShown(false, false)).toBe(false);
  });
});

describe('panelShown', () => {
  it('is up for PANEL_MS after the last touch and fades after', () => {
    expect(panelShown(1000, 1000, false)).toBe(true);
    expect(panelShown(1000, 1000 + PANEL_MS - 1, false)).toBe(true);
    expect(panelShown(1000, 1000 + PANEL_MS, false)).toBe(false);
  });

  it('stays up while a finger is down, however long', () => {
    expect(panelShown(1000, 1000 + 4 * PANEL_MS, true)).toBe(true);
  });

  it('is down before any touch', () => {
    expect(panelShown(-Infinity, 0, false)).toBe(false);
  });

  it('is up from the load and never fades when pinned (?debug), and fades as before when not', () => {
    expect(panelShown(-Infinity, 0, false, true)).toBe(true);
    expect(panelShown(1000, 1000 + 100 * PANEL_MS, false, true)).toBe(true);
    expect(panelShown(1000, 1000 + PANEL_MS, false, false)).toBe(false);
  });

  it('lasts 5 seconds', () => {
    expect(PANEL_MS).toBe(5000);
  });
});
