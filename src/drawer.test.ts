import { describe, expect, it } from 'vitest';
import { ONE_ROW_WIDTH, drawerOpen, isCompact, packRows } from './drawer';

describe('packRows', () => {
  it('puts each panel in the first row it fits in, so narrow panels share a row a wide one left room in', () => {
    // a 370 px row with 10 px gaps, the top row full: 150 goes up beside 160, and 120 beside 140 and 70
    expect(packRows([140, 70, 160, 230, 230, 370, 150, 120], 370, 10, 344)).toEqual([1, 1, 2, 3, 4, 5, 2, 1]);
  });

  it('fills the top row after what it holds before starting the rows below', () => {
    expect(packRows([100, 200, 50], 1000, 10, 700)).toEqual([0, 1, 0]);
  });

  it('gives a panel wider than a row a row of its own, and keeps half a pixel spare', () => {
    expect(packRows([400, 30], 370, 10, 344)).toEqual([1, 2]);
    expect(packRows([360], 370, 10, 0)).toEqual([1]);
    expect(packRows([359.5], 370, 10, 0)).toEqual([0]);
  });
});

describe('isCompact', () => {
  it('is every width the one-row panel does not fit in', () => {
    expect(isCompact(320)).toBe(true);
    expect(isCompact(1180)).toBe(true);
    expect(isCompact(ONE_ROW_WIDTH - 1)).toBe(true);
  });

  it('is not Full HD, nor anything wider than the one row needs', () => {
    expect(isCompact(ONE_ROW_WIDTH)).toBe(false);
    expect(isCompact(1920)).toBe(false);
    expect(isCompact(2560)).toBe(false);
  });
});

describe('drawerOpen', () => {
  it('is flipped by the key while the panel is up', () => {
    expect(drawerOpen(false, true, true)).toBe(true);
    expect(drawerOpen(true, true, true)).toBe(false);
  });

  it('stays as it is when nothing was pressed and the panel is up', () => {
    expect(drawerOpen(true, false, true)).toBe(true);
    expect(drawerOpen(false, false, true)).toBe(false);
  });

  it('is shut whenever the panel is gone, pressed or not', () => {
    expect(drawerOpen(true, false, false)).toBe(false);
    expect(drawerOpen(true, true, false)).toBe(false);
    expect(drawerOpen(false, true, false)).toBe(false);
  });
});
