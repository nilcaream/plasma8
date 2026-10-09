import { describe, expect, it } from 'vitest';
import { HoldWatch, LISTEN_HOLD_MS } from './press';

describe('HoldWatch', () => {
  it('holds for half a second', () => {
    expect(LISTEN_HOLD_MS).toBe(500);
  });

  it('is due once a press has been held longer than LISTEN_HOLD_MS, and only once', () => {
    const hold = new HoldWatch();
    hold.down('pointer 1', 1000);
    expect(hold.due(1000 + LISTEN_HOLD_MS - 1)).toBe(false);
    expect(hold.due(1000 + LISTEN_HOLD_MS)).toBe(true);
    expect(hold.due(1000 + LISTEN_HOLD_MS + 16)).toBe(false);
    expect(hold.due(5000)).toBe(false);
  });

  it('is never due for a press let go early', () => {
    const hold = new HoldWatch();
    hold.down('key KeyA', 0);
    hold.up('key KeyA');
    expect(hold.held).toBe(false);
    expect(hold.due(10_000)).toBe(false);
  });

  it('is due again for the next long press', () => {
    const hold = new HoldWatch();
    hold.down('pointer 1', 0);
    expect(hold.due(600)).toBe(true);
    hold.up('pointer 1');
    hold.down('pointer 1', 2000);
    expect(hold.due(2100)).toBe(false);
    expect(hold.due(2600)).toBe(true);
  });

  it('watches the first press only: a second finger or key neither starts nor ends the hold', () => {
    const hold = new HoldWatch();
    hold.down('pointer 1', 0);
    hold.down('pointer 2', 300);
    hold.up('pointer 2');
    expect(hold.held).toBe(true);
    expect(hold.due(500)).toBe(true);
  });

  it('ignores the release of something it was not watching', () => {
    const hold = new HoldWatch();
    hold.up('pointer 9');
    hold.down('pointer 1', 0);
    hold.up('key Space');
    expect(hold.held).toBe(true);
  });
});
