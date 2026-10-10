/**
 * The panel on a screen too narrow for its one row. The row needs ONE_ROW_WIDTH (the widths of the nine panels, the gaps and
 * the padding, as the page lays them out); below that the first row is the metronome, the tapping widget and a key, and the
 * key opens the other panels in rows below it, as many to a row as fit. Every panel keeps its size either way. The rows are
 * shut when the panel fades. The layout itself is in src/style.css, under `html.compact`.
 */

/** The viewport width from which the one-row panel fits. */
export const ONE_ROW_WIDTH = 1701;

/** Whether a viewport `width` (CSS pixels) is too narrow for the one-row panel. */
export function isCompact(width: number): boolean {
  return width < ONE_ROW_WIDTH;
}

/** Whether the drawer is open after the key was pressed (`pressed`, which flips it) or after a look at whether the panel is still up (`shown`); a panel that is gone shuts it. */
export function drawerOpen(open: boolean, pressed: boolean, shown: boolean): boolean {
  return shown && (pressed ? !open : open);
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

export class Drawer {
  private readonly bar = byId('bar');
  private readonly key = byId<HTMLButtonElement>('drawer-key');
  private open = false;

  constructor() {
    const root = document.documentElement;
    const fit = (): void => {
      root.classList.toggle('compact', isCompact(window.innerWidth));
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
  }
}
