import { describe, expect, it } from 'vitest';
import { PANEL_MS, inBand, lastTouch, metronomeShown, panelShown } from './band';

describe('inBand', () => {
  it('is every height above the band bottom, so the panels and the gaps between them alike', () => {
    expect(inBand(0, 88)).toBe(true);
    expect(inBand(40, 88)).toBe(true);
    expect(inBand(87.9, 88)).toBe(true);
  });

  it('is not the page below the band', () => {
    expect(inBand(88, 88)).toBe(false);
    expect(inBand(400, 88)).toBe(false);
  });
});

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

  it('does not fade while the microphone listens or the pointer is in the band: the count starts when they stop', () => {
    // the microphone listens from 0 to 20 s, the panel last touched at 1 s; a frame every 100 ms
    let touched = 1000;
    for (let now = 0; now <= 20000; now += 100) {
      touched = lastTouch(touched, now, true, false);
      expect(panelShown(touched, now, false)).toBe(true);
    }
    expect(panelShown(lastTouch(touched, 20000 + PANEL_MS - 1, false, false), 20000 + PANEL_MS - 1, false)).toBe(true);
    expect(panelShown(lastTouch(touched, 20000 + PANEL_MS, false, false), 20000 + PANEL_MS, false)).toBe(false);
    // the pointer sits in the band for a minute, then leaves
    touched = -Infinity;
    for (let now = 0; now <= 60000; now += 100) {
      touched = lastTouch(touched, now, false, true);
      expect(panelShown(touched, now, false)).toBe(true);
    }
    expect(panelShown(lastTouch(touched, 60000 + PANEL_MS, false, false), 60000 + PANEL_MS, false)).toBe(false);
  });

  it('keeps a later real touch: the count runs from the last touch or from the close, whichever is later', () => {
    expect(lastTouch(30000, 10000, true, false)).toBe(30000);
    expect(lastTouch(5000, 10000, true, false)).toBe(10000);
    expect(lastTouch(5000, 10000, false, false)).toBe(5000);
  });

  it('lasts 5 seconds', () => {
    expect(PANEL_MS).toBe(5000);
  });
});
