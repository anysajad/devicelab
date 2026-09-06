/**
 * Production Live View Validation
 * Phase 2B-2.1
 *
 * This test validates the production live-view pipeline using the companion's
 * own test infrastructure. Run from the companion directory.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCompanionServer } from '../src/server.js';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

async function sendRequest(
  ws: WebSocket,
  method: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const id = `req-${Date.now()}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout for ${method}`)), 15_000);
    const handler = (data: unknown) => {
      const msg = JSON.parse(String(data));
      if (msg.id === id) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params: { ...params, token } }));
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Production Live View Validation', () => {
  let server: Awaited<ReturnType<typeof createCompanionServer>>;
  let port: number;
  let token: string;

  beforeAll(async () => {
    server = await createCompanionServer({ port: 0 });
    await server.start();
    port = server.port;
    token = server.token;
  });

  afterAll(async () => {
    await server.stop();
  });

  // =========================================================================
  // 1. Production measurements
  // =========================================================================

  describe('1. Production measurements', () => {
    it('measures real FPS and frame size', async () => {
      const ws = await connect(port, token);

      try {
        // Connect and create session
        const hello = await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' });
        expect(hello.result).toBeDefined();

        const create = await sendRequest(ws, 'session.create', { viewport: { width: 375, height: 667 } }, token);
        expect(create.result).toBeDefined();
        const sessionId = (create.result as { sessionId: string }).sessionId;

        // Load page
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' });

        // Collect frames for 5 seconds
        const frames: Record<string, unknown>[] = [];
        const startTime = Date.now();

        ws.on('message', (data) => {
          const msg = JSON.parse(String(data));
          if (msg.event === 'session.frame' && msg.data?.sessionId === sessionId) {
            frames.push(msg.data);
          }
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        const elapsed = Date.now() - startTime;
        const fps = frames.length / (elapsed / 1000);

        console.log('\n=== Production Measurements ===');
        console.log(`Duration: ${elapsed}ms`);
        console.log(`Frames received: ${frames.length}`);
        console.log(`FPS: ${fps.toFixed(1)}`);

        if (frames.length > 0) {
          const firstFrame = frames[0] as { payload: string; width: number; height: number };
          const frameSizeKB = (firstFrame.payload.length * 3) / 4 / 1024;
          console.log(`Frame size: ${frameSizeKB.toFixed(1)} KB`);
          console.log(`Viewport: ${firstFrame.width}x${firstFrame.height}`);
        }

        // Validate measurements
        expect(frames.length).toBeGreaterThan(0);
        expect(fps).toBeGreaterThan(0);

        // Close session
        await sendRequest(ws, 'session.close', { sessionId });
      } finally {
        ws.close();
      }
    }, 15_000);
  });

  // =========================================================================
  // 2. Visual correctness — viewport validation
  // =========================================================================

  describe('2. Viewport correctness', () => {
    async function testViewport(viewport: { width: number; height: number }) {
      const ws = await connect(port, token);

      try {
        await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' });

        const create = await sendRequest(ws, 'session.create', { viewport });
        const sessionId = (create.result as { sessionId: string }).sessionId;

        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' });

        // Collect one frame
        const frame = await new Promise<Record<string, unknown>>((resolve) => {
          const handler = (data: unknown) => {
            const msg = JSON.parse(String(data));
            if (msg.event === 'session.frame' && msg.data?.sessionId === sessionId) {
              ws.off('message', handler);
              resolve(msg.data);
            }
          };
          ws.on('message', handler);
        });

        expect(frame.width).toBe(viewport.width);
        expect(frame.height).toBe(viewport.height);

        await sendRequest(ws, 'session.close', { sessionId });
      } finally {
        ws.close();
      }
    }

    it('phone portrait 375x667', async () => {
      await testViewport({ width: 375, height: 667 });
    }, 10_000);

    it('phone landscape 667x375', async () => {
      await testViewport({ width: 667, height: 375 });
    }, 10_000);

    it('desktop 1280x720', async () => {
      await testViewport({ width: 1280, height: 720 });
    }, 10_000);

    it('custom 1024x768', async () => {
      await testViewport({ width: 1024, height: 768 });
    }, 10_000);
  });

  // =========================================================================
  // 3. Multi-preview isolation
  // =========================================================================

  describe('3. Multi-preview isolation', () => {
    it('two sessions have independent frame streams', async () => {
      const ws1 = await connect(port, token);
      const ws2 = await connect(port, token);

      try {
        // Create two sessions
        await sendRequest(ws1, 'hello', { protocolVersion: '1.0.0' }, token);
        await sendRequest(ws2, 'hello', { protocolVersion: '1.0.0' }, token);

        const create1 = await sendRequest(ws1, 'session.create', { viewport: { width: 375, height: 667 } }, token);
        const create2 = await sendRequest(ws2, 'session.create', { viewport: { width: 1280, height: 720 } }, token);

        const session1 = (create1.result as { sessionId: string }).sessionId;
        const session2 = (create2.result as { sessionId: string }).sessionId;

        // Load pages
        await sendRequest(ws1, 'session.load', { sessionId: session1, url: 'https://example.com' }, token);
        await sendRequest(ws2, 'session.load', { sessionId: session2, url: 'https://example.com' }, token);

        // Collect frames from both
        const frames1: Record<string, unknown>[] = [];
        const frames2: Record<string, unknown>[] = [];

        ws1.on('message', (data) => {
          const msg = JSON.parse(String(data));
          if (msg.event === 'session.frame' && msg.data?.sessionId === session1) {
            frames1.push(msg.data);
          }
        });

        ws2.on('message', (data) => {
          const msg = JSON.parse(String(data));
          if (msg.event === 'session.frame' && msg.data?.sessionId === session2) {
            frames2.push(msg.data);
          }
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Both should have received frames
        expect(frames1.length).toBeGreaterThan(0);
        expect(frames2.length).toBeGreaterThan(0);

        // Viewports should be different
        const f1 = frames1[0] as { width: number; height: number };
        const f2 = frames2[0] as { width: number; height: number };
        expect(f1.width).toBe(375);
        expect(f2.width).toBe(1280);

        // Cleanup
        await sendRequest(ws1, 'session.close', { sessionId: session1 }, token);
        await sendRequest(ws2, 'session.close', { sessionId: session2 }, token);
      } finally {
        ws1.close();
        ws2.close();
      }
    }, 15_000);
  });

  // =========================================================================
  // 4. Navigation and reload
  // =========================================================================

  describe('4. Navigation and reload', () => {
    it('handles reload correctly', async () => {
      const ws = await connect(port, token);

      try {
        await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' });
        const create = await sendRequest(ws, 'session.create', { viewport: { width: 375, height: 667 } }, token);
        const sessionId = (create.result as { sessionId: string }).sessionId;

        // Load initial page
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' });

        // Collect initial frames
        const frames1: Record<string, unknown>[] = [];
        ws.on('message', (data) => {
          const msg = JSON.parse(String(data));
          if (msg.event === 'session.frame' && msg.data?.sessionId === sessionId) {
            frames1.push(msg.data);
          }
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
        const count1 = frames1.length;

        // Reload
        await sendRequest(ws, 'session.reload', { sessionId });

        // Wait for more frames
        await new Promise(resolve => setTimeout(resolve, 2000));
        const count2 = frames1.length;

        // Should have received more frames after reload
        expect(count2).toBeGreaterThan(count1);

        await sendRequest(ws, 'session.close', { sessionId });
      } finally {
        ws.close();
      }
    }, 15_000);
  });

  // =========================================================================
  // 5. Cleanup and resource lifecycle
  // =========================================================================

  describe('5. Cleanup and resource lifecycle', () => {
    it('destroys cleanly without errors', async () => {
      const ws = await connect(port, token);

      try {
        await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' });
        const create = await sendRequest(ws, 'session.create', { viewport: { width: 375, height: 667 } }, token);
        const sessionId = (create.result as { sessionId: string }).sessionId;

        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' });

        // Wait for some frames
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Close session
        const close = await sendRequest(ws, 'session.close', { sessionId });
        expect(close.result).toBeDefined();

        // Session should be gone
        const state = await sendRequest(ws, 'session.getState', { sessionId });
        expect(state.error).toBeDefined();
      } finally {
        ws.close();
      }
    }, 10_000);

    it('handles invalid token gracefully', async () => {
      const ws = await connect(port, 'invalid-token-12345');

      try {
        await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' }, 'invalid-token-12345');

        const create = await sendRequest(ws, 'session.create', { viewport: { width: 375, height: 667 } }, 'invalid-token-12345');
        expect(create.error).toBeDefined();
      } finally {
        ws.close();
      }
    }, 10_000);
  });

  // =========================================================================
  // 6. Performance validation
  // =========================================================================

  describe('6. Performance validation', () => {
    it('sustains stable FPS over 5 seconds', async () => {
      const ws = await connect(port, token);

      try {
        await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' });
        const create = await sendRequest(ws, 'session.create', { viewport: { width: 375, height: 667 } }, token);
        const sessionId = (create.result as { sessionId: string }).sessionId;

        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' });

        // Collect frames for 5 seconds
        const frames: Record<string, unknown>[] = [];
        const startTime = Date.now();

        ws.on('message', (data) => {
          const msg = JSON.parse(String(data));
          if (msg.event === 'session.frame' && msg.data?.sessionId === sessionId) {
            frames.push(msg.data);
          }
        });

        await new Promise(resolve => setTimeout(resolve, 5000));

        const elapsed = Date.now() - startTime;
        const avgFps = frames.length / (elapsed / 1000);

        console.log('\n=== Performance Validation ===');
        console.log(`Duration: ${elapsed}ms`);
        console.log(`Total frames: ${frames.length}`);
        console.log(`Average FPS: ${avgFps.toFixed(1)}`);

        if (frames.length > 0) {
          const firstFrame = frames[0] as { payload: string };
          const frameSizeKB = (firstFrame.payload.length * 3) / 4 / 1024;
          console.log(`Avg frame size: ${frameSizeKB.toFixed(1)} KB`);
        }

        // FPS should be in reasonable range
        expect(avgFps).toBeGreaterThan(3);
        expect(avgFps).toBeLessThan(20);

        // Should have received many frames
        expect(frames.length).toBeGreaterThanOrEqual(10);

        await sendRequest(ws, 'session.close', { sessionId });
      } finally {
        ws.close();
      }
    }, 15_000);
  });
});
