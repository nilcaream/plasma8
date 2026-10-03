import { describe, expect, it } from 'vitest';
import { TapClock } from './clock';
import { beatInputs } from './drive';
import { pulse } from './envelope';

describe('beatInputs', () => {
  it('gives the algorithms the slider value as it is before the first tap, the same as after', () => {
    const free = new TapClock(0);
    const before = free.read(1100);
    expect(before.synced).toBe(false);

    const tapped = new TapClock(0);
    for (let t = 0; t <= 1000; t += 500) tapped.tap(t);
    const after = tapped.read(1100);
    expect(after.synced).toBe(true);

    for (const intensity of [0, 0.5, 1]) {
      const a = beatInputs(before, intensity);
      const b = beatInputs(after, intensity);
      expect(a.intensity).toBe(intensity);
      expect(b.intensity).toBe(intensity);
      expect(a.beatPulse).toBeCloseTo(pulse(before.beatPhase, intensity), 12);
      expect(a.barPulse).toBeCloseTo(pulse(before.barPhase, intensity), 12);
    }
  });
});
