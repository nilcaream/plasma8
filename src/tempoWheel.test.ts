import { describe, expect, it } from 'vitest';
import { MAX_BPM, MIN_BPM } from './clock';
import { WHEEL_ROWS, WHEEL_ROW_PX, wheelNotch, wheelPosition, wheelRows } from './tempoWheel';

describe('wheelPosition', () => {
  it('moves one BPM per row of drag, up for faster', () => {
    expect(wheelPosition(120, 0)).toBe(120);
    expect(wheelPosition(120, -WHEEL_ROW_PX)).toBe(121);
    expect(wheelPosition(120, 3 * WHEEL_ROW_PX)).toBe(117);
    expect(wheelPosition(120, -WHEEL_ROW_PX / 2)).toBe(120.5);
  });

  it('stays between 60 and 180', () => {
    expect(wheelPosition(60, 10 * WHEEL_ROW_PX)).toBe(MIN_BPM);
    expect(wheelPosition(179, -10 * WHEEL_ROW_PX)).toBe(MAX_BPM);
    expect(wheelPosition(120, -1e6)).toBe(180);
    expect(wheelPosition(120, 1e6)).toBe(60);
  });

  it('rounds to the whole number it is set to', () => {
    expect(Math.round(wheelPosition(120, -0.4 * WHEEL_ROW_PX))).toBe(120);
    expect(Math.round(wheelPosition(120, -0.6 * WHEEL_ROW_PX))).toBe(121);
  });
});

describe('wheelNotch', () => {
  it('moves one BPM a notch, scroll up for faster like a drag up', () => {
    expect(wheelNotch(120, -100)).toBe(121);
    expect(wheelNotch(120, 100)).toBe(119);
  });

  it('ignores how far the notch scrolled and does nothing for none', () => {
    expect(wheelNotch(120, -1)).toBe(121);
    expect(wheelNotch(120, -480)).toBe(121);
    expect(wheelNotch(120, 0.5)).toBe(119);
    expect(wheelNotch(120, 0)).toBe(120);
  });

  it('lands on a whole number and stays between 60 and 180', () => {
    expect(wheelNotch(120.4, -100)).toBe(121);
    expect(wheelNotch(180, -100)).toBe(MAX_BPM);
    expect(wheelNotch(60, 100)).toBe(MIN_BPM);
  });
});

describe('wheelRows', () => {
  it('shows the number in the middle row, two each side, centred on a whole position', () => {
    const rows = wheelRows(132);
    expect(rows).toHaveLength(WHEEL_ROWS);
    expect(rows.map((r) => r.value)).toEqual([130, 131, 132, 133, 134]);
    expect(rows[2]!.y).toBe(0);
    expect(rows[2]!.opacity).toBe(1);
    expect(rows[0]!.opacity).toBeLessThan(rows[1]!.opacity);
  });

  it('slides the rows with a position between two numbers', () => {
    const rows = wheelRows(132.25);
    expect(rows[2]!.value).toBe(132);
    expect(rows[2]!.y).toBeCloseTo(-0.25 * WHEEL_ROW_PX, 8); // the 132 row has moved up as the wheel turned up
    expect(rows[3]!.y).toBeCloseTo(0.75 * WHEEL_ROW_PX, 8);
  });

  it('has no numbers past either end', () => {
    expect(wheelRows(60).map((r) => r.value)).toEqual([undefined, undefined, 60, 61, 62]);
    expect(wheelRows(180).map((r) => r.value)).toEqual([178, 179, 180, undefined, undefined]);
  });
});
