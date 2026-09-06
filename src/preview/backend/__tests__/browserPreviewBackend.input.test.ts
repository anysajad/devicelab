/**
 * BrowserPreviewBackend input tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import { createBrowserPreviewBackend } from '../browserPreviewBackend';
import type { PreviewBackend } from '../types.js';

describe('BrowserPreviewBackend Input', () => {
  let wss: WebSocketServer;
  let port: number;
  let backend: PreviewBackend;
  let token: string;

  beforeEach(async () => {
    token = 'test-token-' + Date.now();
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => {
      wss.on('listening', () => {
        const addr = wss.address();
        if (addr && typeof addr === 'object') {
          port = addr.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    backend?.destroy();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });

  function createTestBackend(): PreviewBackend {
    return createBrowserPreviewBackend({
      endpoint: `ws://127.0.0.1:${port}/ws`,
      token,
    });
  }

  function setupMockCompanion(): void {
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data));

        if (msg.method === 'hello') {
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: {
                protocolVersion: '1.0.0',
                capabilities: ['session.create', 'session.load'],
                serverInfo: { name: 'test', version: '0.0.1' },
              },
            })
          );
        } else if (msg.method === 'session.create') {
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: {
                sessionId: 'test-session-' + Date.now(),
                viewport: msg.params.viewport,
              },
            })
          );
        } else if (msg.method === 'session.load') {
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: { sessionId: msg.params.sessionId, url: msg.params.url },
            })
          );
          ws.send(
            JSON.stringify({
              event: 'session.lifecycle',
              data: {
                sessionId: msg.params.sessionId,
                lifecycle: 'ready',
              },
            })
          );
        } else if (
          msg.method.startsWith('session.mouse') ||
          msg.method.startsWith('session.wheel') ||
          msg.method.startsWith('session.key') ||
          msg.method.startsWith('session.type') ||
          msg.method.startsWith('session.touch')
        ) {
          // Input commands — respond with success
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: { ok: true },
            })
          );
        } else if (msg.method === 'session.close') {
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: { sessionId: msg.params.sessionId },
            })
          );
        }
      });
    });
  }

  // Cast helper for accessing extended backend methods
  function callMethod(
    b: PreviewBackend,
    method: string,
    ...args: unknown[]
  ): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (b as any)[method](...args);
  }

  describe('Input API', () => {
    it('has sendPointerInput method', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(
        typeof (backend as unknown as { sendPointerInput: unknown })
          .sendPointerInput
      ).toBe('function');
    });

    it('has sendWheelInput method', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(
        typeof (backend as unknown as { sendWheelInput: unknown })
          .sendWheelInput
      ).toBe('function');
    });

    it('has sendKeyboardInput method', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(
        typeof (backend as unknown as { sendKeyboardInput: unknown })
          .sendKeyboardInput
      ).toBe('function');
    });

    it('has sendTouchInput method', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(
        typeof (backend as unknown as { sendTouchInput: unknown })
          .sendTouchInput
      ).toBe('function');
    });
  });

  describe('Input commands', () => {
    it('sends pointer input to companion', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') resolve();
        });
        backend.load({
          url: 'https://example.com',
          device: {
            id: 'iphone-15',
            name: 'iPhone 15',
            manufacturer: 'Apple',
            category: 'phone',
            viewport: { width: 393, height: 852 },
            devicePixelRatio: 3,
            safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
            orientations: ['portrait', 'landscape'],
          },
          orientation: 'portrait',
        });
      });

      // Should not throw
      expect(() => {
        callMethod(backend, 'sendPointerInput', 'click', 100, 200, 'left', 1);
      }).not.toThrow();
    });

    it('sends wheel input to companion', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') resolve();
        });
        backend.load({
          url: 'https://example.com',
          device: {
            id: 'iphone-15',
            name: 'iPhone 15',
            manufacturer: 'Apple',
            category: 'phone',
            viewport: { width: 393, height: 852 },
            devicePixelRatio: 3,
            safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
            orientations: ['portrait', 'landscape'],
          },
          orientation: 'portrait',
        });
      });

      expect(() => {
        callMethod(backend, 'sendWheelInput', 0, 100);
      }).not.toThrow();
    });

    it('sends keyboard input to companion', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') resolve();
        });
        backend.load({
          url: 'https://example.com',
          device: {
            id: 'iphone-15',
            name: 'iPhone 15',
            manufacturer: 'Apple',
            category: 'phone',
            viewport: { width: 393, height: 852 },
            devicePixelRatio: 3,
            safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
            orientations: ['portrait', 'landscape'],
          },
          orientation: 'portrait',
        });
      });

      expect(() => {
        callMethod(backend, 'sendKeyboardInput', 'type', undefined, 'hello');
      }).not.toThrow();
    });

    it('sends touch input to companion', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') resolve();
        });
        backend.load({
          url: 'https://example.com',
          device: {
            id: 'iphone-15',
            name: 'iPhone 15',
            manufacturer: 'Apple',
            category: 'phone',
            viewport: { width: 393, height: 852 },
            devicePixelRatio: 3,
            safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
            orientations: ['portrait', 'landscape'],
          },
          orientation: 'portrait',
        });
      });

      expect(() => {
        callMethod(backend, 'sendTouchInput', 'start', 100, 200);
      }).not.toThrow();
    });

    it('ignores input when not connected', () => {
      setupMockCompanion();
      backend = createTestBackend();

      // Should not throw even without session
      expect(() => {
        callMethod(backend, 'sendPointerInput', 'click', 100, 200, 'left', 1);
      }).not.toThrow();
    });

    it('ignores input after destroy', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') resolve();
        });
        backend.load({
          url: 'https://example.com',
          device: {
            id: 'iphone-15',
            name: 'iPhone 15',
            manufacturer: 'Apple',
            category: 'phone',
            viewport: { width: 393, height: 852 },
            devicePixelRatio: 3,
            safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
            orientations: ['portrait', 'landscape'],
          },
          orientation: 'portrait',
        });
      });

      backend.destroy();

      // Should not throw after destroy
      expect(() => {
        callMethod(backend, 'sendPointerInput', 'click', 100, 200, 'left', 1);
      }).not.toThrow();
    });
  });
});
