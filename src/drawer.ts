/**
 * The panel on a screen too narrow for its one row. The row needs ONE_ROW_WIDTH (the widths of the nine panels, the gaps and
 * the padding, as the page lays them out); below that the first row is the metronome on the left, the tapping widget in the
 * middle and a key on the right. Open, the key goes to the right end of the top row, the other panels fill the top row after
 * the tapping widget as far as they fit, and then the rows below it, each panel in the first row it fits in (`packRows`).
 * Every panel keeps its size either way. The rows are shut when the panel fades. The layout itself is in src/style.css,
 * under `html.compact`; the rows are given as each panel's flex `order`.
 */

/** The viewport width from which the one-row panel fits: 1775.5 px measured at 1920x1080 with the five What plays keys (1701.3 with four). */
export const ONE_ROW_WIDTH = 1776;

/** Whether a viewport `width` (CSS pixels) is too narrow for the one-row panel. */
export function isCompact(width: number): boolean {
  return width < ONE_ROW_WIDTH;
}

/** Whether the drawer is open after the key was pressed (`pressed`, which flips it) or after a look at whether the panel is still up (`shown`); a panel that is gone shuts it. */
export function drawerOpen(open: boolean, pressed: boolean, shown: boolean): boolean {
  return shown && (pressed ? !open : open);
}

/**
 * The row of each panel of the open drawer, in order: the first row it fits in, so a narrow panel fills the room a wide one
 * left on an earlier row. Row 0 is the top row, which holds `taken` px already (the metronome, the tapping widget and the key,
 * and the gaps between them); `width` is a row's inner width and `gap` the space between two panels. A panel too wide for any
 * row gets a row of its own. A fit leaves half a pixel spare, so the browser's own line breaking never disagrees.
 */
export function packRows(widths: readonly number[], width: number, gap: number, taken: number): number[] {
  const used: number[] = [taken];
  return widths.map((w) => {
    let row = used.findIndex((u) => u + gap + w <= width - 0.5);
    if (row < 0) {
      row = used.length;
      used.push(w);
    } else used[row]! += gap + w;
    return row;
  });
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

export class Drawer {
  private readonly bar = byId('bar');
  private readonly key = byId<HTMLButtonElement>('drawer-key');
  private readonly panels = [...byId('drawer').children] as HTMLElement[];
  private open = false;

  constructor() {
    const root = document.documentElement;
    const fit = (): void => {
      root.classList.toggle('compact', isCompact(window.innerWidth));
      this.arrange();
    };
    fit();
    window.addEventListener('resize', fit);
    this.key.addEventListener('click', () => this.set(drawerOpen(this.open, true, this.shown())));
    // the rows fade with the panel and are shut when it is gone (src/band.ts toggles `shown`)
    new MutationObserver(() => this.set(drawerOpen(this.open, false, this.shown()))).observe(this.bar, { attributes: true, attributeFilter: ['class'] });
  }

  private shown(): boolean {
    return this.bar.classList.contains('shown');
  }

  private set(open: boolean): void {
    this.open = open;
    this.bar.classList.toggle('drawer-open', open);
    this.key.setAttribute('aria-expanded', String(open));
    this.arrange();
  }

  /** Open and compact: each panel's row as its flex order (the top row 2, the key 3, row r 3 + r); otherwise the stylesheet's order. */
  private arrange(): void {
    for (const p of this.panels) p.style.order = '';
    if (!this.open || !document.documentElement.classList.contains('compact')) return;
    // measured with every panel below the top row (the stylesheet's order while open), so the top row is at its own widths
    const width = (el: Element): number => el.getBoundingClientRect().width;
    const style = getComputedStyle(this.bar);
    const inner = this.bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap);
    const taken = width(byId('metronome')) + gap + width(byId('tap-widget')) + gap + width(this.key);
    const rows = packRows(this.panels.map(width), inner, gap, taken);
    this.panels.forEach((p, i) => (p.style.order = String(rows[i] === 0 ? 2 : 3 + rows[i]!)));
  }
}
