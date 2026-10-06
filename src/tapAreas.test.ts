import { describe, expect, it } from 'vitest';
import { TAP_AREA_PAD_PX, insideAny, padded } from './tapAreas';

const box = { left: 100, top: 200, right: 280, bottom: 244 };

describe('padded', () => {
  it('grows the box by the pad on every side', () => {
    expect(padded(box)).toEqual({
      left: 100 - TAP_AREA_PAD_PX,
      top: 200 - TAP_AREA_PAD_PX,
      right: 280 + TAP_AREA_PAD_PX,
      bottom: 244 + TAP_AREA_PAD_PX,
    });
    expect(padded(box, 0)).toEqual(box);
    expect(padded(box)).toEqual({ left: 88, top: 188, right: 292, bottom: 256 }); // 12 px: a thumb's width beside a control
  });

  it('leaves a box with no size empty, so a closed menu excludes nothing', () => {
    expect(padded({ left: 0, top: 0, right: 0, bottom: 0 })).toBeUndefined();
    expect(padded({ left: 5, top: 5, right: 5, bottom: 50 })).toBeUndefined();
  });
});

describe('a tap in an area', () => {
  const areas = [padded(box)!, padded({ left: 20, top: 20, right: 120, bottom: 120 })!];

  it('is inside an element\'s box and in the pad around it', () => {
    expect(insideAny(areas, 150, 220)).toBe(true);
    expect(insideAny(areas, 100 - TAP_AREA_PAD_PX, 200)).toBe(true);
    expect(insideAny(areas, 280 + TAP_AREA_PAD_PX - 1, 244 + TAP_AREA_PAD_PX - 1)).toBe(true);
  });

  it('is outside beyond the pad', () => {
    expect(insideAny(areas, 100 - TAP_AREA_PAD_PX - 1, 220)).toBe(false);
    expect(insideAny(areas, 280 + TAP_AREA_PAD_PX, 220)).toBe(false);
    expect(insideAny(areas, 150, 200 - TAP_AREA_PAD_PX - 1)).toBe(false);
    expect(insideAny(areas, 150, 244 + TAP_AREA_PAD_PX)).toBe(false);
    expect(insideAny(areas, 600, 600)).toBe(false);
  });

  it('is inside any one of several areas', () => {
    expect(insideAny(areas, 30, 30)).toBe(true);
    expect(insideAny([], 30, 30)).toBe(false);
  });
});
