import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, int, range, triple, unit, vec, type Knob, type Values } from '../knobs';
import { drawLists, listLabels, movingStroke, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './maze.frag?raw';

export const MAZE_NAME = 'maze';

/**
 * This run's own look: palette, tile drawing, tile size, line width, the pan and
 * where in the endless grid it starts. The beat flashes the picture, by the beat
 * voices, and turns tiles by the moving value flip.
 * Listed the way the debug panel shows them: the values that may move, list by
 * list in the order of MAZE_MOVING; then the values that never move; then the beat voices.
 */
export const MAZE_KNOBS: readonly Knob[] = [
  // may move: list 1; a tile is turned while its own random number (0..1) is under flip, so a step turns that share of the
  // tiles. Near 0 or 1 nearly every tile lies the same way and the maze reads as a regular pattern, so the draw keeps to the middle.
  range('flip', 0.2, 0.8, [0, 1]),
  // may move: list 2
  ...triple('palD', 0, 1, [0, 1]),
  range('width', 0.05, 0.1, [0.01, 0.25]),
  // never move
  ...triple('palA', 0.45, 0.6, [0, 1]),
  ...triple('palB', 0.35, 0.5, [0, 1]),
  ...triple('palC', 0.6, 1.2, [0, 3]),
  // 0 two quarter arcs per tile, 1 one diagonal
  int('style', 0, 1, [0, 1]),
  range('cells', 8, 18, [3, 40]),
  range('panAngle', 0, 2 * Math.PI, [0, 2 * Math.PI]),
  // tiles per second; it multiplies the running time, so it never moves
  range('panSpeed', 0.15, 0.5, [0, 2]),
  range('cycles', 0.3, 1.2, [0, 4]),
  range('colourDrift', 0.01, 0.04, [0, 0.2]),
  range('offset.0', 0, 500, [0, 500]),
  range('offset.1', 0, 500, [0, 500]),
  // how hard each beat voice flashes this run (the moving values follow the voices too)
  ...amountKnobs(),
  // fixed in code: the flash gain
  fixed('flashGain', 1, GAIN_RANGE, 'follows the beat'),
];

/** Every uniform but the turn of the tiles, which `tileTurns` gives each frame. */
export function mazeParams(v: Values): ShaderParams {
  return {
    u_palA: vec(v, 'palA'),
    u_palB: vec(v, 'palB'),
    u_palC: vec(v, 'palC'),
    u_palD: vec(v, 'palD'),
    u_width: v.width!,
    u_style: v.style!,
    u_cells: v.cells!,
    u_pan: unit(v.panAngle!).map((c) => c * v.panSpeed!),
    u_offset: vec(v, 'offset', 2),
    u_cycles: v.cycles!,
    u_colourDrift: v.colourDrift!,
    u_flashGain: v.flashGain!,
  };
}

export const drawMazeParams = (rng: Rng): ShaderParams => mazeParams(drawKnobs(MAZE_KNOBS, rng));

/**
 * The turn of the tiles: the stroke flip is in, so the shader turns the tiles it crosses together and each lands
 * whole on the hit. While flip does not move (Moves off, or not ticked) it stands where its value is, and nothing turns.
 */
export function tileTurns(v: Values, inputs: FrameInputs, moving: readonly MovingValue[]): ShaderParams {
  const flip = moving.find((m) => m.key === 'flip');
  const s = flip ? movingStroke(flip, inputs.intensity, inputs.beats) : { from: v.flip!, to: v.flip!, done: 0 };
  return { u_flipFrom: s.from, u_flipTo: s.to, u_turn: s.done };
}

/**
 * The values that may move: two lists, each drawn on its own. An instance always
 * moves flip, and one of palD (all three of its values) and the line width.
 * Nothing outside the lists moves.
 */
export const MAZE_MOVING: readonly MovingList[] = [
  { pick: 1, entries: ['flip'] },
  { pick: 1, entries: ['palD', 'width'] },
];

const KEYS = MAZE_KNOBS.map((k) => k.key);
const boundsOf = (key: string): [number, number] => drawBounds(MAZE_KNOBS.find((k) => k.key === key)!.draw);

export const drawMazeMoving = (rng: Rng, bounds: (key: string) => readonly [number, number] = boundsOf): MovingValue[] =>
  drawLists(MAZE_MOVING, KEYS, bounds, rng);

export const maze: AlgorithmDef = {
  name: MAZE_NAME,
  home: 0.5,
  steadySpeed: true,
  knobs: MAZE_KNOBS,
  movable: listLabels(MAZE_MOVING, KEYS),
  create: (gl, values, rng, options) =>
    shaderAlgorithm(gl, MAZE_NAME, source, mazeParams, values, relativeAmountsOf, drawMazeMoving(rng, options?.bounds), tileTurns),
};
