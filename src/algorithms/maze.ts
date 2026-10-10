import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { GAIN_RANGE, VOICES, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { TRAVEL_AT_0 } from '../crossfader';
import { drawBounds, drawKnobs, fixed, int, range, triple, unit, vec, type Knob, type Values } from '../knobs';
import { drawLists, listLabels, movingStroke, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type ShaderParams } from '../shaderAlgorithm';
import source from './maze.frag?raw';

export const MAZE_NAME = 'maze';

/** The groups of neighbouring tiles that turn as one, by the groupShape knob; maze.frag's groupOf draws them in this order. */
export const GROUP_SHAPES = ['single', '2x2', 'domino', 'L and single', 'plus', '3x3'] as const;
const TOGETHER = 'how tiles turn together';

/** How long a tile's quarter turn takes, in beats, at every intensity: the stroke a moving value takes at intensity 0. */
export const TURN_BEATS = TRAVEL_AT_0;

/**
 * The share of the tiles that turn in groups at an intensity: none up to `from`, then more in a straight line, all at 1.
 * Below it every tile turns on its own, as single tiles.
 */
export function groupShare(intensity: number, from: number): number {
  if (from >= 1) return 0;
  return Math.min(1, Math.max(0, (intensity - from) / (1 - from)));
}

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
  // fixed in code: which tiles turn together (GROUP_SHAPES), and the intensity where they start to
  { ...fixed('groupShape', 1, [0, GROUP_SHAPES.length - 1], TOGETHER), whole: true },
  fixed('groupFrom', 0.25, [0, 1], TOGETHER),
];

/** Every uniform but the turn of the tiles, which `mazeTurns` gives each frame. */
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
    u_groupShape: v.groupShape!,
  };
}

export const drawMazeParams = (rng: Rng): ShaderParams => mazeParams(drawKnobs(MAZE_KNOBS, rng));

/**
 * The turn of the tiles, one instance's own each frame: the stroke flip is in, so the shader turns the tiles it crosses
 * together and each lands whole on the hit, in TURN_BEATS whatever the intensity. The intensity sets how many tiles turn in
 * groups instead (`groupShare`): the share is taken when a stroke begins and holds until it lands, and a tile the new share
 * groups otherwise turns in that stroke too, so moving the slider never snaps a tile. While flip does not move (Moves off, or
 * not ticked) it stands where its value is, and nothing turns.
 */
export function mazeTurns(): (v: Values, inputs: FrameInputs, moving: readonly MovingValue[]) => ShaderParams {
  let stroke: number | undefined;
  let groupFrom = 0;
  let groupTo = 0;
  return (v, inputs, moving) => {
    const flip = moving.find((m) => m.key === 'flip');
    const share = groupShare(inputs.intensity, v.groupFrom!);
    if (!flip) {
      stroke = undefined;
      return { u_flipFrom: v.flip!, u_flipTo: v.flip!, u_turn: 0, u_groupFrom: groupTo, u_groupTo: groupTo };
    }
    // the strokes are counted by flip's hits: stroke n lands on hit n + 1
    const voice = VOICES[flip.voice];
    const n = Math.floor((inputs.beats - voice.onset) / voice.period);
    if (stroke === undefined) groupFrom = groupTo = share;
    else if (n !== stroke) [groupFrom, groupTo] = [groupTo, share];
    stroke = n;
    const s = movingStroke(flip, inputs.intensity, inputs.beats, TURN_BEATS);
    return { u_flipFrom: s.from, u_flipTo: s.to, u_turn: s.done, u_groupFrom: groupFrom, u_groupTo: groupTo };
  };
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
    shaderAlgorithm(gl, MAZE_NAME, source, mazeParams, values, relativeAmountsOf, drawMazeMoving(rng, options?.bounds), mazeTurns()),
};
