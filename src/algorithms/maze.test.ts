import { describe, expect, it } from 'vitest';
import type { FrameInputs } from '../algorithm';
import { hitTime } from '../crossfader';
import { drawKnobs } from '../knobs';
import { movingStroke } from '../moving';
import { createRng } from '../rng';
import { MAZE_KNOBS, MAZE_MOVING, drawMazeMoving, drawMazeParams, tileTurns } from './maze';

const frame = (intensity: number, beats: number): FrameInputs =>
  ({ time: 0, beatPhase: 0, barPhase: 0, beatPulse: 0, barPulse: 0, beats, intensity, strobe: 0, bpm: 120, width: 320, height: 180, view: 1 });

describe('drawMazeParams', () => {
  it('draws the same parameters for the same seed, and others for another', () => {
    expect(drawMazeParams(createRng(5))).toEqual(drawMazeParams(createRng(5)));
    expect(drawMazeParams(createRng(5))).not.toEqual(drawMazeParams(createRng(6)));
  });

  it('draws a tile style of arcs or diagonals, a whole number that never moves', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 100; seed++) seen.add(drawMazeParams(createRng(seed)).u_style as number);
    expect([...seen].sort()).toEqual([0, 1]);
    expect(MAZE_MOVING.flatMap((l) => l.entries)).not.toContain('style');
  });

  it('pans at its drawn speed in its drawn direction', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(7));
    const p = drawMazeParams(createRng(7));
    expect(Math.hypot(...(p.u_pan as number[]))).toBeCloseTo(v.panSpeed!, 9);
  });
});

describe('the maze\'s moving values', () => {
  it('always move flip, and one of palD and the line width', () => {
    const rng = createRng(12);
    for (let i = 0; i < 100; i++) {
      const keys = drawMazeMoving(rng).map((m) => m.key);
      expect(keys).toContain('flip');
      const other = keys.filter((k) => k !== 'flip');
      expect([['palD.0', 'palD.1', 'palD.2'], ['width']]).toContainEqual(other.sort());
    }
  });

  it('never list a value that multiplies the running time', () => {
    const entries = MAZE_MOVING.flatMap((l) => l.entries);
    for (const key of ['panSpeed', 'colourDrift', 'panAngle', 'cells', 'offset']) expect(entries).not.toContain(key);
  });
});

describe('tileTurns', () => {
  it('turns no tile while flip does not move: it rests where its value is', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(3));
    for (const beats of [0, 1.5, 7.25]) expect(tileTurns(v, frame(1, beats), [])).toEqual({ u_flipFrom: v.flip, u_flipTo: v.flip, u_turn: 0 });
  });

  it('gives the stroke flip is in while it moves, so the tiles it crosses land whole on the hit', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(4));
    const moving = drawMazeMoving(createRng(4));
    const flip = moving.find((m) => m.key === 'flip')!;
    const twin = drawMazeMoving(createRng(4)).find((m) => m.key === 'flip')!;
    for (let n = 1; n < 12; n++) {
      const beats = hitTime(flip.voice, n) - 0.05;
      const s = movingStroke(twin, 1, beats);
      expect(tileTurns(v, frame(1, beats), moving)).toEqual({ u_flipFrom: s.from, u_flipTo: s.to, u_turn: s.done });
    }
  });
});
