/**
 * How many picture heights the screen shows. The picture is as tall as the screen is high, so on a screen taller than wide it would
 * be cut at the sides; where the panel is compact (src/drawer.ts) the shorter side sets the scale instead and the picture is as
 * tall as the screen is wide, the whole of it in view. On a wide screen it is 1.
 */
export function viewScale(width: number, height: number, compact: boolean): number {
  return compact ? Math.max(1, height / width) : 1;
}
