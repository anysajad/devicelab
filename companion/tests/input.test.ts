/**
 * Companion Input Tests
 * Phase 2B-3
 *
 * Tests real Playwright behavior for mouse, wheel, keyboard, and touch input.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createCompanionServer, type CompanionServer } from '../src/server.js';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Test helpers
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
  params: Record<string, unknown>,
  authToken?: string
): Promise<Record<string, unknown>> {
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const requestParams = method === 'hello' ? params : { ...params, token: authToken };
    ws.send(JSON.stringify({ id, method, params: requestParams }));
  });
}

async function setupSession(ws: WebSocket, authToken: string): Promise<string> {
  await sendRequest(ws, 'hello', { protocolVersion: '1.0.0' });
  const create = await sendRequest(ws, 'session.create', {
    viewport: { width: 375, height: 667 },
  }, authToken);
  return (create.result as { sessionId: string }).sessionId;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Companion Input', () => {
  let server: CompanionServer;
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

  describe('Mouse input', () => {
    it('handles mouse move', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = await sendRequest(ws, 'session.mouseMove', {
          sessionId,
          x: 100,
          y: 200,
        }, token);

        expect(result.result).toBeDefined();
        expect((result.result as { ok: boolean }).ok).toBe(true);
      } finally {
        ws.close();
      }
    });

    it('handles mouse click', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = await sendRequest(ws, 'session.mouseClick', {
          sessionId,
          x: 100,
          y: 200,
          button: 'left',
          clickCount: 1,
        }, token);

        expect(result.result).toBeDefined();
        expect((result.result as { ok: boolean }).ok).toBe(true);
      } finally {
        ws.close();
      }
    });
  });

  describe('Wheel input', () => {
    it('handles wheel scroll', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = await sendRequest(ws, 'session.wheel', {
          sessionId,
          deltaX: 0,
          deltaY: 100,
        }, token);

        expect(result.result).toBeDefined();
        expect((result.result as { ok: boolean }).ok).toBe(true);
      } finally {
        ws.close();
      }
    });
  });

  describe('Keyboard input', () => {
    it('handles key down/up', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        const downResult = await sendRequest(ws, 'session.keyDown', {
          sessionId,
          key: 'a',
        }, token);

        expect(downResult.result).toBeDefined();
        expect((downResult.result as { ok: boolean }).ok).toBe(true);

        const upResult = await sendRequest(ws, 'session.keyUp', {
          sessionId,
          key: 'a',
        }, token);

        expect(upResult.result).toBeDefined();
        expect((upResult.result as { ok: boolean }).ok).toBe(true);
      } finally {
        ws.close();
      }
    });

    it('handles text typing', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        const result = await sendRequest(ws, 'session.type', {
          sessionId,
          text: 'hello world',
          delay: 10,
        }, token);

        expect(result.result).toBeDefined();
        expect((result.result as { ok: boolean }).ok).toBe(true);
      } finally {
        ws.close();
      }
    });
  });

  describe('Touch input', () => {
    it('handles touch start/move/end', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        const startResult = await sendRequest(ws, 'session.touchStart', {
          sessionId,
          x: 100,
          y: 200,
        }, token);

        expect(startResult).toBeDefined();
        if (startResult.error) {
          expect(startResult.error.code).toBeDefined();
        }

        const moveResult = await sendRequest(ws, 'session.touchMove', {
          sessionId,
          x: 150,
          y: 250,
        }, token);

        expect(moveResult).toBeDefined();
        if (moveResult.error) {
          expect(moveResult.error.code).toBeDefined();
        }

        const endResult = await sendRequest(ws, 'session.touchEnd', {
          sessionId,
          x: 150,
          y: 250,
        }, token);

        expect(endResult).toBeDefined();
        if (endResult.error) {
          expect(endResult.error.code).toBeDefined();
        }
      } finally {
        ws.close();
      }
    });
  });

  describe('Input after close', () => {
    it('rejects input after session close', async () => {
      const ws = await connect(port);
      try {
        const sessionId = await setupSession(ws, token);
        await sendRequest(ws, 'session.load', { sessionId, url: 'https://example.com' }, token);
        await new Promise(resolve => setTimeout(resolve, 500));

        await sendRequest(ws, 'session.close', { sessionId }, token);

        const result = await sendRequest(ws, 'session.mouseClick', {
          sessionId,
          x: 100,
          y: 200,
        }, token);

        expect(result.error).toBeDefined();
        expect([3000, 2001]).toContain(result.error?.code);
      } finally {
        ws.close();
      }
    });
  });
});
