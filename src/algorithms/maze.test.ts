import { describe, expect, it } from 'vitest';
import type { FrameInputs } from '../algorithm';
import { hitTime } from '../crossfader';
import { drawKnobs } from '../knobs';
import { movingStroke } from '../moving';
import { createRng } from '../rng';
import { GROUP_SHAPES, MAZE_KNOBS, MAZE_MOVING, TURN_BEATS, drawMazeMoving, drawMazeParams, groupShare, mazeTurns } from './maze';

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

describe('groupShare', () => {
  it('groups no tile up to its start, then more in a straight line, and every tile at intensity 1', () => {
    expect(groupShare(0, 0.25)).toBe(0);
    expect(groupShare(0.25, 0.25)).toBe(0);
    expect(groupShare(0.5, 0.25)).toBeCloseTo(1 / 3, 9);
    expect(groupShare(1, 0.25)).toBe(1);
    expect(groupShare(1, 1)).toBe(0);
  });

  it('has a group shape for every whole value of its knob, 2x2 by default', () => {
    const knob = MAZE_KNOBS.find((k) => k.key === 'groupShape')!;
    expect(knob.wide).toEqual([0, GROUP_SHAPES.length - 1]);
    expect(GROUP_SHAPES[drawKnobs(MAZE_KNOBS, createRng(1)).groupShape!]).toBe('2x2');
  });
});

describe('mazeTurns', () => {
  it('turns no tile while flip does not move: it rests where its value is', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(3));
    const turns = mazeTurns();
    for (const beats of [0, 1.5, 7.25]) expect(turns(v, frame(1, beats), [])).toMatchObject({ u_flipFrom: v.flip, u_flipTo: v.flip, u_turn: 0 });
  });

  it('gives the stroke flip is in while it moves, so the tiles it crosses land whole on the hit', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(4));
    const moving = drawMazeMoving(createRng(4));
    const flip = moving.find((m) => m.key === 'flip')!;
    const twin = drawMazeMoving(createRng(4)).find((m) => m.key === 'flip')!;
    const turns = mazeTurns();
    for (let n = 1; n < 12; n++) {
      const beats = hitTime(flip.voice, n) - 0.05;
      const s = movingStroke(twin, 1, beats, TURN_BEATS);
      expect(turns(v, frame(1, beats), moving)).toMatchObject({ u_flipFrom: s.from, u_flipTo: s.to, u_turn: s.done });
    }
  });

  it('turns a tile in the same beats at every intensity: half a beat, not faster when the intensity is up', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(4));
    for (const intensity of [0, 0.5, 1]) {
      const moving = drawMazeMoving(createRng(4));
      const flip = moving.find((m) => m.key === 'flip')!;
      const turns = mazeTurns();
      // a quarter of a beat before the hit the turn is half done, whatever the intensity
      const at = (n: number) => turns(v, frame(intensity, hitTime(flip.voice, n) - TURN_BEATS / 2), moving).u_turn;
      for (let n = 1; n < 6; n++) expect(at(n)).toBeCloseTo(0.5, 6);
    }
  });

  it('takes the share in groups when a stroke begins and holds it until it lands, so moving the slider never snaps a tile', () => {
    const v = drawKnobs(MAZE_KNOBS, createRng(5));
    const moving = drawMazeMoving(createRng(5));
    const flip = moving.find((m) => m.key === 'flip')!;
    const turns = mazeTurns();
    const hit = (n: number) => hitTime(flip.voice, n);
    expect(turns(v, frame(0, hit(2) + 0.01), moving)).toMatchObject({ u_groupFrom: 0, u_groupTo: 0 });
    // the slider goes to the top mid-stroke: this stroke keeps its share
    expect(turns(v, frame(1, hit(3) - 0.1), moving)).toMatchObject({ u_groupFrom: 0, u_groupTo: 0 });
    // the next stroke turns the tiles the new share groups otherwise
    expect(turns(v, frame(1, hit(3) + 0.01), moving)).toMatchObject({ u_groupFrom: 0, u_groupTo: 1 });
    expect(turns(v, frame(1, hit(4) + 0.01), moving)).toMatchObject({ u_groupFrom: 1, u_groupTo: 1 });
  });
});
