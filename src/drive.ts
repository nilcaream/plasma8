import type { ClockReading } from './clock';
import { pulse } from './envelope';

/** The beat as the algorithms take it each frame. */
export interface BeatInputs {
  beatPhase: number;
  barPhase: number;
  beatPulse: number;
  barPulse: number;
  beats: number;
  intensity: number;
}

/**
 * The clock's reading and the slider's intensity, as the algorithms take them.
 * The intensity goes through as it is, from the first frame: before the first
 * tap the clock free-runs, and that is the only difference.
 */
export function beatInputs(r: ClockReading, intensity: number): BeatInputs {
  return {
    beatPhase: r.beatPhase,
    barPhase: r.barPhase,
    beatPulse: pulse(r.beatPhase, intensity),
    barPulse: pulse(r.barPhase, intensity),
    beats: r.beats,
    intensity,
  };
}
