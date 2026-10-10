import { describe, expect, it } from 'vitest';
import type { FrameInputs } from '../algorithm';
import { drawKnobs } from '../knobs';
import { MazeFlips, STATE_SIZE } from '../mazeFlips';
import { createRng } from '../rng';
import { MAZE_KNOBS, MAZE_MOVING, drawMazeMoving, drawMazeParams, mazeFlipping } from './maze';
import source from './maze.frag?raw';

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
  it('move one of palD and the line width, and never flip: the flips are events of their own', () => {
    const rng = createRng(12);
    for (let i = 0; i < 100; i++) {
      const keys = drawMazeMoving(rng).map((m) => m.key);
      expect([['palD.0', 'palD.1', 'palD.2'], ['width']]).toContainEqual(keys.sort());
    }
  });

  it('never list a value that multiplies the running time', () => {
    const entries = MAZE_MOVING.flatMap((l) => l.entries);
    for (const key of ['panSpeed', 'colourDrift', 'panAngle', 'cells', 'offset']) expect(entries).not.toContain(key);
  });
});

describe('mazeFlipping', () => {
  it('starts the turn on the beat and lands it half a beat later, at every intensity', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(3));
    for (const intensity of [0.2, 1]) {
      const step = mazeFlipping(new MazeFlips(createRng(3)));
      step(v, frame(intensity, 4.9), [], false);
      expect(step(v, frame(intensity, 5), [], false).u_turn).toBe(0);
      expect(step(v, frame(intensity, 5.25), [], false).u_turn).toBeCloseTo(0.5, 9);
      expect(step(v, frame(intensity, 5.5), [], false).u_turn).toBe(1);
      expect(step(v, frame(intensity, 5.9), [], false).u_turn).toBe(1);
    }
  });

  it('flips nothing new while the moves are held', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(4));
    const flips = new MazeFlips(createRng(4));
    const step = mazeFlipping(flips);
    step(v, frame(1, 0.5), [], true);
    for (let b = 1; b < 8; b++) {
      step(v, frame(1, b), [], true);
      expect(flips.turning).toEqual([]);
    }
  });

  it('flips about clustersAt1 clusters a beat at intensity 1, over the tiles on screen', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(6));
    const flips = new MazeFlips(createRng(6));
    const step = mazeFlipping(flips);
    step(v, frame(1, 0.5), [], false);
    let tiles = 0;
    for (let b = 1; b <= 50; b++) {
      step(v, frame(1, b), [], false);
      tiles += flips.turning.length;
    }
    // ten clusters of 1 to 9 tiles (5 on average), fewer where two overlap
    expect(tiles / 50).toBeGreaterThan(20);
    expect(tiles / 50).toBeLessThan(60);
  });
});

describe('maze.frag', () => {
  it('wraps the flips\' grid at the size the flips keep it', () => {
    expect(source).toContain(`mod(cell, ${STATE_SIZE}.0)`);
  });
});
