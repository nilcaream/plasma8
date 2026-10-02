import { describe, expect, it } from 'vitest';
import { isTapKey, isTapPointer } from './input';

const key = (over: Partial<Parameters<typeof isTapKey>[0]> = {}) => ({
  key: ' ',
  repeat: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...over,
});

describe('isTapKey', () => {
  it('accepts an ordinary key press', () => {
    expect(isTapKey(key())).toBe(true);
    expect(isTapKey(key({ key: 'a' }))).toBe(true);
    expect(isTapKey(key({ key: 'Enter' }))).toBe(true);
  });

  it('ignores key repeat', () => {
    expect(isTapKey(key({ repeat: true }))).toBe(false);
  });

  it('ignores shortcuts, modifiers alone, Tab and Escape', () => {
    expect(isTapKey(key({ key: 'r', ctrlKey: true }))).toBe(false);
    expect(isTapKey(key({ key: 'l', metaKey: true }))).toBe(false);
    expect(isTapKey(key({ key: 'F4', altKey: true }))).toBe(false);
    expect(isTapKey(key({ key: 'Shift' }))).toBe(false);
    expect(isTapKey(key({ key: 'Tab' }))).toBe(false);
    expect(isTapKey(key({ key: 'Escape' }))).toBe(false);
  });
});

describe('isTapPointer', () => {
  it('accepts a touch and a left mouse button', () => {
    expect(isTapPointer({ pointerType: 'touch', button: 0, isPrimary: true })).toBe(true);
    expect(isTapPointer({ pointerType: 'mouse', button: 0, isPrimary: true })).toBe(true);
  });

  it('ignores the right mouse button and a second finger', () => {
    expect(isTapPointer({ pointerType: 'mouse', button: 2, isPrimary: true })).toBe(false);
    expect(isTapPointer({ pointerType: 'touch', button: 0, isPrimary: false })).toBe(false);
  });
});
