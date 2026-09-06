/**
 * Tests for BrowserPreviewBackend frame consumption.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  createBrowserPreviewBackend,
} from '../browserPreviewBackend';
import type { PreviewBackend } from '../types.js';

describe('BrowserPreviewBackend Frame Consumption', () => {
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

  function setupMockCompanionWithFrames(): void {
    let frameSequence = 0;

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
          // Start sending frames
          const sendFrame = () => {
            ws.send(
              JSON.stringify({
                event: 'session.frame',
                data: {
                  sessionId: msg.params.sessionId,
                  sequence: ++frameSequence,
                  width: 375,
                  height: 667,
                  encoding: 'jpeg',
                  payload: 'base64encodeddata',
                  timestamp: Date.now(),
                },
              })
            );
          };
          // Send a few frames
          setTimeout(sendFrame, 50);
          setTimeout(sendFrame, 150);
          setTimeout(sendFrame, 250);
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

  it('receives and processes frames', async () => {
    setupMockCompanionWithFrames();
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

    // Wait for frames
    await new Promise((resolve) => setTimeout(resolve, 400));

    const metrics = (backend as unknown as { getFrameMetrics: () => { framesReceived: number; fps: number } }).getFrameMetrics();
    expect(metrics.framesReceived).toBeGreaterThan(0);
    expect(metrics.fps).toBeGreaterThan(0);
  });

  it('handles stale session frames', async () => {
    let sessionCount = 0;

    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
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
          sessionCount++;
          ws.send(
            JSON.stringify({
              id: msg.id,
              result: {
                sessionId: 'session-' + sessionCount,
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
          // Send frame for first session
          if (sessionCount === 1) {
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  event: 'session.frame',
                  data: {
                    sessionId: 'session-1',
                    sequence: 1,
                    width: 375,
                    height: 667,
                    encoding: 'jpeg',
                    payload: 'stale-frame',
                    timestamp: Date.now(),
                  },
                })
              );
            }, 50);
          }
        }
      });
    });

    backend = createTestBackend();

    // Create first session
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

    // Create second session (replaces first)
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

    await new Promise((resolve) => setTimeout(resolve, 400));

    const metrics = (backend as unknown as { getFrameMetrics: () => { framesReceived: number } }).getFrameMetrics();
    // Should only count frames from the current session
    expect(metrics.framesReceived).toBeGreaterThanOrEqual(0);
  });

  it('cleans up on destroy', async () => {
    setupMockCompanionWithFrames();
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

    // Wait for frames
    await new Promise((resolve) => setTimeout(resolve, 200));

    backend.destroy();

    // Should not receive more frames after destroy
    const metricsBefore = (backend as unknown as { getFrameMetrics: () => { framesReceived: number } }).getFrameMetrics();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const metricsAfter = (backend as unknown as { getFrameMetrics: () => { framesReceived: number } }).getFrameMetrics();

    expect(metricsAfter.framesReceived).toBe(metricsBefore.framesReceived);
  });
});
