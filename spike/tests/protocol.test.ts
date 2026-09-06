import { describe, expect, it } from 'vitest';
import {
  isClientMessage,
  isConnectMessage,
  isNavigateMessage,
  isViewportMessage,
  isPointerMessage,
  isWheelMessage,
  isDisconnectMessage,
} from '../companion/protocol.js';
import type { ClientMessage } from '../companion/protocol.js';
import {
  canvasToPage,
  pageToCanvas,
  convertWheelDelta,
} from '../companion/coordinates.js';

describe('protocol message validation', () => {
  it('accepts valid connect message', () => {
    const msg = { type: 'connect' };
    expect(isClientMessage(msg)).toBe(true);
    expect(isConnectMessage(msg as ClientMessage)).toBe(true);
  });

  it('accepts connect with token', () => {
    const msg = { type: 'connect', token: 'abc123' };
    expect(isClientMessage(msg)).toBe(true);
    expect(isConnectMessage(msg as ClientMessage)).toBe(true);
  });

  it('accepts valid navigate message', () => {
    const msg = { type: 'navigate', url: 'https://example.com' };
    expect(isClientMessage(msg)).toBe(true);
    expect(isNavigateMessage(msg as ClientMessage)).toBe(true);
  });

  it('accepts valid viewport message', () => {
    const msg = { type: 'viewport', width: 375, height: 667 };
    expect(isClientMessage(msg)).toBe(true);
    expect(isViewportMessage(msg as ClientMessage)).toBe(true);
  });

  it('accepts valid pointer message', () => {
    const msg = { type: 'pointer', kind: 'down', x: 10, y: 20, button: 0 };
    expect(isClientMessage(msg)).toBe(true);
    expect(isPointerMessage(msg as ClientMessage)).toBe(true);
  });

  it('accepts valid wheel message', () => {
    const msg = { type: 'wheel', x: 0, y: 0, deltaX: 0, deltaY: 100 };
    expect(isClientMessage(msg)).toBe(true);
    expect(isWheelMessage(msg as ClientMessage)).toBe(true);
  });

  it('accepts valid disconnect message', () => {
    const msg = { type: 'disconnect' };
    expect(isClientMessage(msg)).toBe(true);
    expect(isDisconnectMessage(msg as ClientMessage)).toBe(true);
  });

  it('rejects null', () => {
    expect(isClientMessage(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isClientMessage(undefined)).toBe(false);
  });

  it('rejects string', () => {
    expect(isClientMessage('hello')).toBe(false);
  });

  it('rejects object with missing type', () => {
    expect(isClientMessage({})).toBe(false);
  });

  it('rejects object with unknown type', () => {
    expect(isClientMessage({ type: 'unknown' })).toBe(false);
  });

  it('rejects object with numeric type', () => {
    expect(isClientMessage({ type: 42 })).toBe(false);
  });

  it('pointer kind discriminator works correctly', () => {
    const down = { type: 'pointer', kind: 'down', x: 0, y: 0 };
    const up = { type: 'pointer', kind: 'up', x: 0, y: 0 };
    const move = { type: 'pointer', kind: 'move', x: 0, y: 0 };

    expect(isPointerMessage(down as ClientMessage)).toBe(true);
    expect(isPointerMessage(up as ClientMessage)).toBe(true);
    expect(isPointerMessage(move as ClientMessage)).toBe(true);
  });
});

describe('coordinate conversion', () => {
  const viewport = { width: 375, height: 667 };

  it('canvasToPage returns identity in spike (1:1 mapping)', () => {
    expect(canvasToPage(100, 200, viewport, 1, 1)).toEqual({ x: 100, y: 200 });
  });

  it('canvasToPage preserves coordinates at various positions', () => {
    expect(canvasToPage(0, 0, viewport, 1, 1)).toEqual({ x: 0, y: 0 });
    expect(canvasToPage(374, 666, viewport, 1, 1)).toEqual({ x: 374, y: 666 });
    expect(canvasToPage(187.5, 333.5, viewport, 1, 1)).toEqual({
      x: 187.5,
      y: 333.5,
    });
  });

  it('pageToCanvas is inverse of canvasToPage', () => {
    const page = canvasToPage(50, 100, viewport, 1, 1);
    const canvas = pageToCanvas(page.x, page.y, viewport, 1, 1);
    expect(canvas).toEqual({ x: 50, y: 100 });
  });

  it('convertWheelDelta returns delta unchanged in spike', () => {
    expect(convertWheelDelta(100, viewport, 1, 1)).toBe(100);
    expect(convertWheelDelta(-50, viewport, 1, 1)).toBe(-50);
    expect(convertWheelDelta(0, viewport, 1, 1)).toBe(0);
  });
});
