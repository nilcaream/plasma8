import { describe, expect, it } from 'vitest';
import { CLUSTER_SHAPES, MazeFlips, STATE_SIZE, attack, clusterCount, gridIndex, pickShape, rippleDelays, shapesAt, tileWindow, type FlipRule } from './mazeFlips';
import { createRng } from './rng';

const RULE: FlipRule = { clustersAt1: 10, tilesAt0: 2 };
const WINDOW = { x0: 0, x1: 30, y0: 0, y1: 16 };

describe('clusterCount', () => {
  it('flips no cluster at intensity 0 and clustersAt1 at 1', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      expect(clusterCount(0, RULE, rng)).toBe(0);
      expect(clusterCount(1, RULE, rng)).toBe(10);
    }
  });

  it('flips clustersAt1 · I a beat on average, so a low intensity still flips now and then', () => {
    const rng = createRng(2);
    let sum = 0;
    for (let i = 0; i < 4000; i++) sum += clusterCount(0.05, RULE, rng);
    expect(sum / 4000).toBeCloseTo(0.5, 1);
  });
});

describe('shapesAt and pickShape', () => {
  it('allows only clusters of up to tilesAt0 tiles at 0, up to 3x3 from 0.25, and every shape at 1, up to 4x4', () => {
    expect(shapesAt(0, RULE).map((s) => s.name)).toEqual(['single', 'domino']);
    expect(shapesAt(0.25, RULE).map((s) => s.name)).toEqual(['single', 'domino', 'L', '2x2', 'plus', '3x3']);
    expect(shapesAt(0.5, RULE).map((s) => s.name)).toEqual(['single', 'domino', 'L', '2x2', 'plus', '3x3']);
    expect(shapesAt(1, RULE)).toEqual(CLUSTER_SHAPES);
    expect(CLUSTER_SHAPES.map((s) => s.cells.length)).toEqual([1, 2, 3, 4, 5, 9, 13, 16]);
  });

  it('picks the bigger shapes likelier, so a cluster at 0.5 has over 5 tiles on average', () => {
    const rng = createRng(9);
    const shapes = shapesAt(0.5, RULE);
    let tiles = 0;
    for (let i = 0; i < 4000; i++) tiles += pickShape(shapes, rng).cells.length;
    expect(tiles / 4000).toBeGreaterThan(5);
  });
});

describe('MazeFlips', () => {
  it('turns nothing on the first frame, which is never on a beat', () => {
    const flips = new MazeFlips(createRng(3));
    flips.update(3.4, 1, WINDOW, RULE);
    expect(flips.turning).toEqual([]);
  });

  it('starts new clusters on every beat, and lands the last ones in the grid', () => {
    const flips = new MazeFlips(createRng(4));
    flips.update(0.5, 1, WINDOW, RULE);
    flips.update(1, 1, WINDOW, RULE);
    const first = [...flips.turning];
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((i) => flips.rest[i] === 0)).toBe(true);
    // the same beat again draws nothing new
    flips.update(1.3, 1, WINDOW, RULE);
    expect(flips.turning).toEqual(first);
    flips.update(2, 1, WINDOW, RULE);
    for (const i of first) if (!flips.turning.includes(i)) expect(flips.rest[i]).toBe(1);
  });

  it('flips the tiles of the clusters on screen only', () => {
    const flips = new MazeFlips(createRng(5));
    const window = { x0: 100, x1: 110, y0: 40, y1: 45 };
    flips.update(0.5, 1, window, RULE);
    for (let b = 1; b < 30; b++) {
      flips.update(b, 1, window, RULE);
      for (const i of flips.turning) {
        const x = i % STATE_SIZE;
        const y = Math.floor(i / STATE_SIZE);
        // a cluster reaches at most two tiles past its place
        expect(x).toBeGreaterThanOrEqual(98);
        expect(x).toBeLessThanOrEqual(112);
        expect(y).toBeGreaterThanOrEqual(38);
        expect(y).toBeLessThanOrEqual(47);
      }
    }
  });

  it('fills the grid as R the rest, G the tiles turning now and B how far each lies from its cluster\'s middle', () => {
    const flips = new MazeFlips(createRng(6));
    flips.update(0.5, 1, WINDOW, RULE);
    flips.update(1, 1, WINDOW, RULE);
    flips.update(2, 1, WINDOW, RULE);
    const out = new Uint8Array(STATE_SIZE * STATE_SIZE * 4);
    flips.fill(out);
    for (const i of flips.turning) {
      expect(out[4 * i + 1]).toBe(255);
      expect(out[4 * i + 2]).toBe(Math.round(flips.delays.get(i)! * 255));
    }
    expect(flips.turning.some((i) => out[4 * i + 2]! > 0)).toBe(true);
    const rested = flips.rest.findIndex((r) => r === 1);
    expect(out[4 * rested]).toBe(255);
  });

  it('draws only the transitions it is given: one, when one is forced', () => {
    const flips = new MazeFlips(createRng(7), ['card']);
    flips.update(0.5, 1, WINDOW, RULE);
    for (let b = 1; b < 20; b++) {
      flips.update(b, 1, WINDOW, RULE);
      expect(flips.transition).toBe('card');
    }
  });
});

describe('rippleDelays and attack', () => {
  it('puts the middle of a shape at 0 and its farthest tiles at 1', () => {
    expect(rippleDelays([[0, 0]])).toEqual([0]);
    const plus = rippleDelays(CLUSTER_SHAPES.find((s) => s.name === 'plus')!.cells);
    expect(Math.min(...plus)).toBe(0);
    expect(Math.max(...plus)).toBe(1);
  });

  it('is fastest at the start and whole at the end', () => {
    expect(attack(0)).toBe(0);
    expect(attack(0.25)).toBeGreaterThan(0.5);
    expect(attack(1)).toBe(1);
    expect(attack(2)).toBe(1);
  });
});

describe('gridIndex and tileWindow', () => {
  it('wraps a tile into the grid, below 0 too', () => {
    expect(gridIndex(0, 0)).toBe(0);
    expect(gridIndex(STATE_SIZE + 3, 1)).toBe(STATE_SIZE + 3);
    expect(gridIndex(-1, -1)).toBe(STATE_SIZE * STATE_SIZE - 1);
  });

  it('gives the tiles a picture shows, from its middle at pan·time + offset', () => {
    expect(tileWindow(10, [1, 0], [100, 50], 2, 320, 160, 1)).toEqual({ x0: 92, x1: 112, y0: 45, y1: 55 });
  });
});
