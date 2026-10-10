import type { AlgorithmDef, FrameInputs } from '../algorithm';
import { GAIN_RANGE, amountKnobs, relativeAmountsOf } from '../beatVoices';
import { drawBounds, drawKnobs, fixed, int, range, triple, unit, vec, type Knob, type Values } from '../knobs';
import { CLUSTER_SHAPES, MazeFlips, STATE_SIZE, tileWindow } from '../mazeFlips';
import { drawLists, listLabels, type MovingList, type MovingValue } from '../moving';
import type { Rng } from '../rng';
import { shaderAlgorithm, type DrawHook, type ShaderParams } from '../shaderAlgorithm';
import source from './maze.frag?raw';

export const MAZE_NAME = 'maze';

const FLIPS = 'how tiles flip on the beat';

/** The texture unit the flips' grid is bound to: units 0 and 1 hold the pictures a morph blends (src/stage.ts). */
const STATE_UNIT = 2;

/**
 * This run's own look: palette, tile drawing, tile size, line width, the pan and
 * where in the endless grid it starts. The beat flashes the picture, by the beat
 * voices, and flips clusters of tiles on every beat (src/mazeFlips.ts).
 * Listed the way the debug panel shows them: the values that may move, list by
 * list in the order of MAZE_MOVING; then the values that never move; then the beat voices.
 */
export const MAZE_KNOBS: readonly Knob[] = [
  // may move: list 1
  ...triple('palD', 0, 1, [0, 1]),
  range('width', 0.05, 0.1, [0.01, 0.25]),
  // never move
  // a tile starts turned while its own random number (0..1) is under flip. Near 0 or 1 nearly every tile lies the same way
  // and the maze reads as a regular pattern, so the draw keeps to the middle.
  range('flip', 0.2, 0.8, [0, 1]),
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
  // how hard each beat voice flashes this run (the moving values follow the voices too; the flips do not)
  ...amountKnobs(),
  // fixed in code: the flash gain
  fixed('flashGain', 1, GAIN_RANGE, 'follows the beat'),
  // fixed in code: the clusters that flip on a beat at intensity 1, and the most tiles a cluster has at intensity 0
  { ...fixed('clustersAt1', 16, [0, 40], FLIPS), whole: true },
  { ...fixed('tilesAt0', 2, [1, CLUSTER_SHAPES[CLUSTER_SHAPES.length - 1]!.cells.length], FLIPS), whole: true },
];

/** Every uniform but the flips, which `mazeFlipping` gives each frame. */
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
    u_flip: v.flip!,
  };
}

export const drawMazeParams = (rng: Rng): ShaderParams => mazeParams(drawKnobs(MAZE_KNOBS, rng));

/**
 * The flips each frame: they take the beat (none while the moves are held, Moves off) over the tiles on screen, and give
 * the eased share of the turn done since it started on the beat.
 */
export function mazeFlipping(flips: MazeFlips): (v: Values, inputs: FrameInputs, moving: readonly MovingValue[], held: boolean) => ShaderParams {
  return (v, inputs, _moving, held) => {
    const p = mazeParams(v);
    const window = tileWindow(v.cells!, p.u_pan as number[], p.u_offset as number[], inputs.time, inputs.width, inputs.height, inputs.view);
    flips.update(inputs.beats, inputs.intensity, window, { clustersAt1: v.clustersAt1!, tilesAt0: v.tilesAt0! }, held);
    return { u_turn: flips.done(inputs.beats) };
  };
}

/** The flips' grid as a texture of the instance's own: uploaded when it changed, bound for every draw. */
function flipsTexture(gl: WebGL2RenderingContext, flips: MazeFlips): DrawHook {
  const texture = gl.createTexture();
  const bytes = new Uint8Array(STATE_SIZE * STATE_SIZE * 2);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, STATE_SIZE, STATE_SIZE, 0, gl.RG, gl.UNSIGNED_BYTE, bytes);
  const samplers = new Map<WebGLProgram, WebGLUniformLocation | null>();
  return {
    bind: (gl, program) => {
      gl.activeTexture(gl.TEXTURE0 + STATE_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (flips.takeChanged()) {
        flips.fill(bytes);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, STATE_SIZE, STATE_SIZE, gl.RG, gl.UNSIGNED_BYTE, bytes);
      }
      if (!samplers.has(program)) samplers.set(program, gl.getUniformLocation(program, 'u_state'));
      gl.uniform1i(samplers.get(program)!, STATE_UNIT);
    },
    dispose: () => gl.deleteTexture(texture),
  };
}

/**
 * The values that may move: one list. An instance moves one of palD (all three of its values) and the line width.
 * Nothing outside the list moves; the flips are events of their own, not moving values.
 */
export const MAZE_MOVING: readonly MovingList[] = [
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
  create: (gl, values, rng, options) => {
    const moving = drawMazeMoving(rng, options?.bounds);
    const flips = new MazeFlips(rng);
    return shaderAlgorithm(gl, MAZE_NAME, source, mazeParams, values, relativeAmountsOf, moving, mazeFlipping(flips), flipsTexture(gl, flips));
  },
};
