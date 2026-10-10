import { describe, expect, it } from 'vitest';
import type { FrameInputs } from '../algorithm';
import { drawKnobs } from '../knobs';
import { MazeFlips, RIPPLE_SPREAD, STATE_SIZE, TRANSITIONS, WIPE_REACH } from '../mazeFlips';
import { createRng } from '../rng';
import { MAZE_KNOBS, MAZE_MOVING, drawMazeMoving, drawMazeParams, mazeFlipping, transitionsOf } from './maze';
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

  it('draws the transition on every kick, each kind about equally often, and every one starts on the kick', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(8));
    const flips = new MazeFlips(createRng(8));
    const step = mazeFlipping(flips);
    step(v, frame(1, 0.5), [], false);
    const seen = new Map<number, number>();
    const kicks = 1400;
    for (let b = 1; b <= kicks; b++) {
      const u = step(v, frame(1, b), [], false);
      expect(u.u_turn).toBe(0);
      expect(u.u_progress).toBe(0);
      seen.set(u.u_transition as number, (seen.get(u.u_transition as number) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual(TRANSITIONS.map((_, i) => i));
    for (const count of seen.values()) expect(count / kicks).toBeCloseTo(1 / TRANSITIONS.length, 1);
  });

  it('draws only the kinds named, unknown names passed over, and every kind when none is known', () => {
    expect(transitionsOf(['card'])).toEqual(['card']);
    expect(transitionsOf(['ripple', 'nope', 'card'])).toEqual(['card', 'ripple']);
    expect(transitionsOf(['nope'])).toEqual(TRANSITIONS);
    expect(transitionsOf(undefined)).toEqual(TRANSITIONS);
  });

  it('has no instant change: every kind takes the time of a turn', () => {
    expect(TRANSITIONS).not.toContain('instant');
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
    expect(source).toContain(`mod(c, ${STATE_SIZE}.0)`);
  });

  it('numbers the transitions as TRANSITIONS lists them, and ripples by the same spread', () => {
    TRANSITIONS.forEach((name, i) => expect(source).toContain(`const int T_${name.toUpperCase()} = ${i};`));
    expect(source).toContain(`const float RIPPLE_SPREAD = ${RIPPLE_SPREAD};`);
  });

  it('closes a card in step with the turn, fastest on the kick, and shows its edge so a diagonal does not merely lean', () => {
    const card = /kind == T_CARD\) \{([\s\S]*?)\n  \}/.exec(source)![1]!;
    // the width a straight line in the eased turn, as shrink's; cos(πt) of it closed slowly after the kick, then all at once
    expect(card).toContain('abs(1.0 - 2.0 * t)');
    expect(card).not.toContain('cos(');
    expect(card).toContain('box(q, vec2(0.5 * k, 0.5))');
  });

  it('grows a shrink\'s new drawing from the kick while the old one shrinks, not after it has gone', () => {
    const shrink = /kind == T_SHRINK\) \{([\s\S]*?)\n  \}/.exec(source)![1]!;
    expect(shrink).toContain('max(1.0 - t, THINNEST)');
    expect(shrink).toContain('max(t, THINNEST)');
    // one drawing at a time, switched half way through the turn, is what it was
    expect(shrink).not.toContain('rot2(b)');
  });

  it('fades a shrinking drawing out before it is gone, so neither is left as a dot when the flip lands or starts', () => {
    const shrink = /kind == T_SHRINK\) \{([\s\S]*?)\n  \}/.exec(source)![1]!;
    // a drawing scaled down to THINNEST keeps its line's width: a dot that stayed until the next kick
    expect(shrink).toContain('clamp((1.0 - t) / SHRINK_FADE, 0.0, 1.0)');
    expect(shrink).toContain('clamp(t / SHRINK_FADE, 0.0, 1.0)');
  });

  it('starts a wipe at the drawing, so it moves through the lines from the kick, and ends it past the farthest a tile\'s light reaches', () => {
    expect(source).toContain(`const float WIPE_REACH = ${WIPE_REACH};`);
    // from WIPE_REACH out it crossed 0.6 of a tile of nothing at its fastest, and only then the lines, all at once
    expect(source).toContain('mix(-from, from, t / WIPE_CROSS)');
    expect(source).toContain('mix(from, WIPE_REACH, (t - WIPE_CROSS) / (1.0 - WIPE_CROSS))');
    const haloFall = Number(/const float HALO_FALL = ([\d.]+);/.exec(source)![1]);
    const widest = MAZE_KNOBS.find((k) => k.key === 'width')!.wide[1];
    // half a tile, the widest line's round end, and its halo down to a twentieth of its light
    expect(WIPE_REACH).toBeGreaterThanOrEqual(0.5 + widest + Math.log(20) / haloFall);
    // its start, even for the widest line, lies inside where it ends
    expect(0.5 + 2 * widest).toBeLessThan(WIPE_REACH);
  });
});
