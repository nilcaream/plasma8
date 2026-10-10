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
  /** A step that has taken beat `n`, its flip made a rotation whatever was drawn. */
  const rotatingFrom = (n: number, intensity: number) => {
    const v = drawKnobs(MAZE_KNOBS, createRng(3));
    const flips = new MazeFlips(createRng(3));
    const step = mazeFlipping(flips);
    step(v, frame(intensity, n - 0.1), [], false);
    step(v, frame(intensity, n), [], false);
    flips.transition = 'rotate';
    return (beats: number) => step(v, frame(intensity, beats), [], false).u_turn;
  };

  it('starts a rotation on the beat and lands it half a beat later, at every intensity', () => {
    for (const intensity of [0.2, 1]) {
      const turn = rotatingFrom(5, intensity);
      expect(turn(5)).toBe(0);
      expect(turn(5.25)).toBeCloseTo(0.875, 9);
      expect(turn(5.5)).toBe(1);
      expect(turn(5.9)).toBe(1);
    }
  });

  it('moves a tile most on the kick: over half the turn is done an eighth of a beat after it, so the flip is seen on the kick, not on the off-beat', () => {
    expect(rotatingFrom(7, 1)(7.125)).toBeGreaterThan(0.5);
  });

  it('draws the transition on every kick, a rotation or an instant change, each about half the time; an instant one is whole on the kick', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(8));
    const flips = new MazeFlips(createRng(8));
    const step = mazeFlipping(flips);
    step(v, frame(1, 0.5), [], false);
    let instant = 0;
    for (let b = 1; b <= 400; b++) {
      const turn = step(v, frame(1, b), [], false).u_turn;
      if (flips.transition === 'instant') {
        instant++;
        expect(turn).toBe(1);
      } else expect(turn).toBe(0);
    }
    expect(instant / 400).toBeGreaterThan(0.4);
    expect(instant / 400).toBeLessThan(0.6);
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

  it('flips at most 16 clusters a kick by default', () => {
    expect(drawKnobs(MAZE_KNOBS, createRng(1)).clustersAt1).toBe(16);
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
    // sixteen clusters of 1 to 16 tiles (about 10.6 on average, the bigger ones likelier), fewer where two overlap
    expect(tiles / 50).toBeGreaterThan(60);
    expect(tiles / 50).toBeLessThan(260);
  });
});

describe('maze.frag', () => {
  it('wraps the flips\' grid at the size the flips keep it', () => {
    expect(source).toContain(`mod(cell, ${STATE_SIZE}.0)`);
  });
});
