import { describe, expect, it } from 'vitest';
import { ONE_ROW_WIDTH, drawerOpen, isCompact } from './drawer';

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
