import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  createBrowserPreviewBackend,
} from '../browserPreviewBackend';
import type { PreviewBackend } from '../types';

describe('BrowserPreviewBackend', () => {
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
    wss.on('connection', (ws: import('ws').WebSocket) => {
      ws.on('message', (data: import('ws').WebSocket.Data) => {
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
          // Send lifecycle event
          ws.send(
            JSON.stringify({
              event: 'session.lifecycle',
              data: {
                sessionId: msg.params.sessionId,
                lifecycle: 'ready',
              },
            })
          );
        } else if (msg.method === 'session.reload') {
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: { sessionId: msg.params.sessionId },
            })
          );
          // Send lifecycle event
          ws.send(
            JSON.stringify({
              event: 'session.lifecycle',
              data: {
                sessionId: msg.params.sessionId,
                lifecycle: 'ready',
              },
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

  describe('initial state', () => {
    it('starts in idle state', () => {
      setupMockCompanion();
      backend = createTestBackend();
      const state = backend.getState();
      expect(state.lifecycle).toBe('idle');
      expect(state.config.url).toBe('');
      expect(state.error).toBeNull();
    });

    it('has correct kind', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(backend.kind).toBe('browser');
    });

    it('returns null surface', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(backend.getSurface()).toBeNull();
    });

    it('returns pending inspection access', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(backend.getInspectionAccess()).toEqual({ status: 'pending' });
    });

    it('returns null screenshot source', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(backend.getScreenshotSource()).toBeNull();
    });
  });

  describe('load', () => {
    it('transitions to loading state', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      const stateChanges: string[] = [];
      backend.subscribe((state) => {
        stateChanges.push(state.lifecycle);
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

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(stateChanges).toContain('loading');
    });

    it('transitions to ready when page loads', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') {
            resolve();
          }
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

      expect(backend.getState().lifecycle).toBe('ready');
      expect(backend.getState().config.url).toBe('https://example.com');
    });

    it('handles load errors', async () => {
      // Setup companion that returns error
      wss.on('connection', (ws: import('ws').WebSocket) => {
        ws.on('message', (data: import('ws').WebSocket.Data) => {
          const msg = JSON.parse(String(data));
          if (msg.method === 'hello') {
            ws.send(
              JSON.stringify({
                id: msg.id,
                result: {
                  protocolVersion: '1.0.0',
                  capabilities: [],
                  serverInfo: { name: 'test', version: '0.0.1' },
                },
              })
            );
          } else if (msg.method === 'session.create') {
            ws.send(
              JSON.stringify({
                id: msg.id,
                result: { sessionId: 'test-session', viewport: { width: 375, height: 667 } },
              })
            );
          } else if (msg.method === 'session.load') {
            ws.send(
              JSON.stringify({
                id: msg.id,
                error: { code: 3003, message: 'Navigation failed' },
              })
            );
          }
        });
      });

      backend = createTestBackend();

      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'error') {
            resolve();
          }
        });

        backend.load({
          url: 'https://invalid-url',
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

      expect(backend.getState().lifecycle).toBe('error');
      expect(backend.getState().error).toContain('Navigation failed');
    });
  });

  describe('reload', () => {
    it('reloads after initial load', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      // First load
      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') {
            resolve();
          }
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

      // Reload
      const reloadPromise = new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') {
            resolve();
          }
        });
      });

      backend.reload();
      await reloadPromise;

      expect(backend.getState().lifecycle).toBe('ready');
    });
  });

  describe('zoom', () => {
    it('starts in fit mode', () => {
      setupMockCompanion();
      backend = createTestBackend();
      expect(backend.getState().zoomMode).toBe('fit');
    });

    it('switches to manual mode on setZoom', () => {
      setupMockCompanion();
      backend = createTestBackend();
      backend.setZoom(1.5);
      expect(backend.getState().zoomMode).toBe('manual');
      expect(backend.getState().effectiveZoom).toBe(1.5);
    });

    it('zoomIn increases zoom', () => {
      setupMockCompanion();
      backend = createTestBackend();
      backend.zoomIn();
      expect(backend.getState().effectiveZoom).toBe(1.25);
    });

    it('zoomOut decreases zoom', () => {
      setupMockCompanion();
      backend = createTestBackend();
      backend.setZoom(1.5);
      backend.zoomOut();
      expect(backend.getState().effectiveZoom).toBe(1.25);
    });

    it('clamps zoom values', () => {
      setupMockCompanion();
      backend = createTestBackend();
      backend.setZoom(10);
      expect(backend.getState().effectiveZoom).toBe(4);
      backend.setZoom(0);
      expect(backend.getState().effectiveZoom).toBe(0.25);
    });

    it('setZoomMode switches mode', () => {
      setupMockCompanion();
      backend = createTestBackend();
      backend.setZoomMode('manual');
      expect(backend.getState().zoomMode).toBe('manual');
      backend.setZoomMode('fit');
      expect(backend.getState().zoomMode).toBe('fit');
    });
  });

  describe('destroy', () => {
    it('cleans up resources', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      // Load to create session
      await new Promise<void>((resolve) => {
        backend.subscribe((state) => {
          if (state.lifecycle === 'ready') {
            resolve();
          }
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

      // Should not throw on subsequent operations
      expect(() => backend.reload()).not.toThrow();
      expect(() => backend.getState()).not.toThrow();
    });

    it('handles double destroy', () => {
      setupMockCompanion();
      backend = createTestBackend();
      backend.destroy();
      expect(() => backend.destroy()).not.toThrow();
    });
  });

  describe('subscriptions', () => {
    it('notifies listeners on state changes', async () => {
      setupMockCompanion();
      backend = createTestBackend();

      const states: string[] = [];
      const unsub = backend.subscribe((state) => {
        states.push(state.lifecycle);
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

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(states).toContain('loading');
      expect(states).toContain('ready');

      unsub();

      // Should not notify after unsubscribe
      const statesAfterUnsub = states.length;
      backend.reload();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(states.length).toBe(statesAfterUnsub);
    });
  });

  describe('connection failure', () => {
  it('handles connection errors', async () => {
    backend = createBrowserPreviewBackend({
      endpoint: 'ws://127.0.0.1:99999/ws',
      token: 'test-token',
    });

    await new Promise<void>((resolve) => {
      backend.subscribe((state) => {
        if (state.lifecycle === 'error') {
          resolve();
        }
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

    expect(backend.getState().lifecycle).toBe('error');
    expect(backend.getState().error).toContain('Failed to create session');
  });
  });
});
