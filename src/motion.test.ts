import { describe, expect, it } from 'vitest';
import { ALGORITHMS } from './algorithms';
import { drawKnob } from './knobs';
import { BarSteps, MotionClock, STEP_KNOBS, STEP_SHAPE, motionRate, motionTimeFor, stepEase, stepScale, stepShape } from './motion';
import { createRng } from './rng';

describe('motionRate', () => {
  it('is the designed speed at home, faster above and slower below', () => {
    expect(motionRate(0.65, 0.65)).toBe(1);
    expect(motionRate(0.9, 0)).toBeLessThan(0.4);
    expect(motionRate(0.35, 1)).toBeGreaterThan(1.9);
    expect(motionRate(0.5, 0.2)).toBeLessThan(motionRate(0.5, 0.3));
  });
});

describe('motionTimeFor', () => {
  it('gives a steady-speed algorithm its own clock and every other the shared one', () => {
    expect(motionTimeFor({ steadySpeed: true }, 7, 3)).toBe(3);
    expect(motionTimeFor({}, 7, 3)).toBe(7);
    expect(motionTimeFor({ steadySpeed: false }, 7, 3)).toBe(7);
  });

  it('is on for plasma alone', () => {
    expect(ALGORITHMS.filter((a) => a.steadySpeed).map((a) => a.name)).toEqual(['plasma']);
  });
});

describe('stepScale and stepEase', () => {
  it('keeps the largest step (120 degrees) within 45 degrees at low intensity, full only at 1', () => {
    for (const i of [0, 0.2, 0.4]) expect(120 * stepScale(i)).toBeLessThanOrEqual(45);
    expect(stepScale(0.9)).toBeLessThan(0.9);
    expect(stepScale(1)).toBe(1);
  });

  it('eases slowly at low intensity and quickly at high', () => {
    expect(stepEase(0)).toBe(0.5);
    expect(stepEase(1)).toBe(0.125);
  });
});

describe('MotionClock', () => {
  it('sums real seconds times the rate, and never goes back', () => {
    const clock = new MotionClock();
    clock.update(1, 1);
    expect(clock.update(1, 0.5)).toBeCloseTo(1.5, 10);
    expect(clock.update(-3, 1)).toBeCloseTo(1.5, 10);
  });
});

/** Runs the steps frame by frame (60 per bar) over `bars` bars from bar `first`, returning every value. */
function run(steps: BarSteps, first: number, bars: number, intensity: number): number[] {
  const out: number[] = [];
  for (let f = 0; f < bars * 60; f++) out.push(steps.update(first + Math.floor(f / 60), (f % 60) / 60, intensity));
  return out;
}

describe('BarSteps', () => {
  it('takes its steps in the shape it is given: size and ease at intensity 0 and 1', () => {
    const shape = { sizeSoft: 0.1, sizeHard: 0.5, easeSoft: 1, easeHard: 0.25 };
    expect(stepScale(0, shape)).toBe(0.1);
    expect(stepScale(1, shape)).toBe(0.5);
    expect(stepEase(1, shape)).toBe(0.25);
    const steps = new BarSteps();
    steps.shape = shape;
    const hard = run(steps, 0, 3, 1);
    // 15 frames (a quarter bar) into the step: landed at 0.5 a step
    expect(hard[75]).toBeCloseTo(0.5, 10);
    expect(hard.at(-1)).toBeCloseTo(1, 10);
    const soft = new BarSteps();
    soft.shape = shape;
    // eased over the whole bar at 0: halfway at half the bar
    expect(run(soft, 0, 2, 0)[90]! / 0.1).toBeCloseTo(0.5, 10);
  });

  it('reads its knobs, and the code\'s shape where an algorithm has none', () => {
    expect(stepShape({ stepSizeAt0: 0.1, stepSizeAt1: 0.4, stepEaseAt0: 0.9, stepEaseAt1: 0.3 }))
      .toEqual({ sizeSoft: 0.1, sizeHard: 0.4, easeSoft: 0.9, easeHard: 0.3 });
    expect(stepShape({})).toEqual(STEP_SHAPE);
    expect(stepShape(Object.fromEntries(STEP_KNOBS.map((k) => [k.key, drawKnob(k.draw, createRng(1))])))).toEqual(STEP_SHAPE);
  });

  it('takes no step in the first bar, then one scaled step at every bar start', () => {
    const values = run(new BarSteps(), 0, 4, 0);
    expect(values[59]).toBe(0);
    expect(values.at(-1)).toBeCloseTo(3 * stepScale(0), 10);
  });

  it('eases each step over the share of the bar the intensity gives', () => {
    const soft = run(new BarSteps(), 0, 2, 0);
    const hard = run(new BarSteps(), 0, 2, 1);
    // 15 frames (a quarter bar) into the step: hard has landed, soft is halfway
    expect(hard[75]).toBeCloseTo(1, 10);
    expect(soft[75]! / stepScale(0)).toBeCloseTo(0.5, 10);
  });

  it('never jumps when a fresh tap count sends the bars back to 0 mid-step', () => {
    const steps = new BarSteps();
    run(steps, 0, 1, 0);
    const mid = steps.update(1, 0.2, 0);
    expect(steps.update(0, 0, 0)).toBeCloseTo(mid, 10);
  });
});
