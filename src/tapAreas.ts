/**
 * Areas of the page where a tap is never a tempo tap: the corner menu, the
 * tapping widget and the tempo wheel. Each is the element's box grown by
 * TAP_AREA_PAD_PX all round, so a thumb that lands beside a control does not
 * count either. The box is checked by position, not by what the event hit,
 * because the widget does not take events and the area stays while it is faded.
 * With ?debug each area is outlined.
 */

/** How far beyond its element's box an area reaches. */
export const TAP_AREA_PAD_PX = 12;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The box grown by `pad` on every side; a box with no size (a closed menu) stays empty. */
export function padded(box: Rect, pad = TAP_AREA_PAD_PX): Rect | undefined {
  if (!(box.right > box.left && box.bottom > box.top)) return undefined;
  return { left: box.left - pad, top: box.top - pad, right: box.right + pad, bottom: box.bottom + pad };
}

/** Whether the point is in any of the rects; the left and top edges count, the right and bottom do not. */
export function insideAny(rects: readonly Rect[], x: number, y: number): boolean {
  return rects.some((r) => x >= r.left && x < r.right && y >= r.top && y < r.bottom);
}

export interface AreaSpec {
  name: string;
  /** Ids of the elements whose boxes make up the area. */
  ids: readonly string[];
}

export class TapAreas {
  private readonly areas: { name: string; elements: HTMLElement[]; outlines: HTMLElement[] }[];

  constructor(
    specs: readonly AreaSpec[],
    private readonly debug: boolean,
  ) {
    this.areas = specs.map((s) => ({
      name: s.name,
      elements: s.ids.map((id) => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`missing element #${id}`);
        return el;
      }),
      outlines: [],
    }));
  }

  private rects(area: { elements: HTMLElement[] }): Rect[] {
    return area.elements.flatMap((el) => padded(el.getBoundingClientRect()) ?? []);
  }

  /** Whether a tap at this point of the page falls in one of the areas. */
  contains(x: number, y: number): boolean {
    return insideAny(this.areas.flatMap((a) => this.rects(a)), x, y);
  }

  /** Under ?debug, keeps an outline on every area; call once a frame. */
  update(): void {
    if (!this.debug) return;
    for (const area of this.areas) {
      area.elements.forEach((el, i) => {
        let outline = area.outlines[i];
        if (!outline) {
          outline = document.createElement('div');
          outline.className = 'tap-outline';
          document.body.appendChild(outline);
          area.outlines[i] = outline;
        }
        const r = padded(el.getBoundingClientRect());
        outline.style.display = r ? '' : 'none';
        if (r) {
          const width = r.right - r.left;
          const height = r.bottom - r.top;
          outline.style.left = `${r.left}px`;
          outline.style.top = `${r.top}px`;
          outline.style.width = `${width}px`;
          outline.style.height = `${height}px`;
          outline.dataset.label = `${area.name} ${Math.round(width)}x${Math.round(height)}: no taps`;
        }
      });
    }
  }
}
