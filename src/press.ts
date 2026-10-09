/**
 * A press held long enough to ask the microphone to listen (tempo source Detect, continuous listen off): a tap, a click or
 * a key held for LISTEN_HOLD_MS. Pure: every method takes the time in milliseconds.
 */

/** A press held longer than this is a request to listen. */
export const LISTEN_HOLD_MS = 500;

export class HoldWatch {
  private owner: string | undefined;
  private downAt = 0;
  private fired = false;

  /** A press begins. `owner` names what is held (a pointer id, a key); a press while another is held is not watched. */
  down(owner: string, now: number): void {
    if (this.owner !== undefined) return;
    this.owner = owner;
    this.downAt = now;
    this.fired = false;
  }

  /** The press ends; held less than LISTEN_HOLD_MS it was a plain press. */
  up(owner: string): void {
    if (this.owner === owner) this.owner = undefined;
  }

  /** Whether a press is being held now. */
  get held(): boolean {
    return this.owner !== undefined;
  }

  /** True once per press, from LISTEN_HOLD_MS after it began while it is still held. Call it every frame. */
  due(now: number): boolean {
    if (this.owner === undefined || this.fired || now - this.downAt < LISTEN_HOLD_MS) return false;
    this.fired = true;
    return true;
  }
}
