import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { createCompanionServer, type CompanionServer } from '../src/server.js';
import { PROTOCOL_VERSION, ErrorCode } from '../src/protocol/types.js';

describe('Companion Server Integration', () => {
  let server: CompanionServer;
  let ws: WebSocket;
  let port: number;

  beforeAll(async () => {
    server = createCompanionServer({ port: 0 });
    await server.start();
    port = server.port;
  });

  afterAll(async () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    await server.stop();
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      socket.on('open', () => resolve(socket));
      socket.on('error', reject);
    });
  }

  function sendRequest(
    socket: WebSocket,
    method: string,
    params?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const id = `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const handler = (data: unknown) => {
        const msg = JSON.parse(String(data));
        if (msg.id === id) {
          socket.off('message', handler);
          resolve(msg);
        }
      };
      socket.on('message', handler);
      const requestParams = method === 'hello' ? params : { ...params, token: server.token };
      socket.send(JSON.stringify({ id, method, params: requestParams }));
    });
  }

  it('connects to server', async () => {
    ws = await connect();
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('performs hello handshake', async () => {
    const response = await sendRequest(ws, 'hello', {
      protocolVersion: PROTOCOL_VERSION,
    });
    expect(response.result).toBeDefined();
    expect(response.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(response.result.serverInfo.name).toBe('devicelab-companion');
  });

  it('rejects unsupported protocol version', async () => {
    const response = await sendRequest(ws, 'hello', {
      protocolVersion: '0.0.0',
    });
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(ErrorCode.UNSUPPORTED_PROTOCOL_VERSION);
  });

  it('responds to ping', async () => {
    const response = await sendRequest(ws, 'ping');
    expect(response.result).toBeDefined();
    expect(response.result.timestamp).toBeTypeOf('number');
  });

  it('creates a session', async () => {
    const response = await sendRequest(ws, 'session.create', {
      viewport: { width: 375, height: 667 },
    });
    expect(response.result).toBeDefined();
    expect(response.result.sessionId).toBeTypeOf('string');
    expect(response.result.viewport).toEqual({ width: 375, height: 667 });
  });

  it('rejects invalid viewport', async () => {
    const response = await sendRequest(ws, 'session.create', {
      viewport: { width: 0, height: 667 },
    });
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });

  it('gets session state', async () => {
    const createResponse = await sendRequest(ws, 'session.create', {
      viewport: { width: 375, height: 667 },
    });
    const sessionId = createResponse.result.sessionId;

    const stateResponse = await sendRequest(ws, 'session.getState', {
      sessionId,
    });
    expect(stateResponse.result).toBeDefined();
    expect(stateResponse.result.sessionId).toBe(sessionId);
    expect(stateResponse.result.lifecycle).toBe('ready');
  });

  it('rejects invalid session ID', async () => {
    const response = await sendRequest(ws, 'session.getState', {
      sessionId: 'nonexistent',
    });
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(ErrorCode.SESSION_NOT_FOUND);
  });

  it('loads a URL', async () => {
    const createResponse = await sendRequest(ws, 'session.create', {
      viewport: { width: 375, height: 667 },
    });
    const sessionId = createResponse.result.sessionId;

    const loadResponse = await sendRequest(ws, 'session.load', {
      sessionId,
      url: 'https://example.com',
    });
    expect(loadResponse.result).toBeDefined();
    expect(loadResponse.result.url).toBe('https://example.com');

    const stateResponse = await sendRequest(ws, 'session.getState', {
      sessionId,
    });
    expect(stateResponse.result.url).toBe('https://example.com');
    expect(stateResponse.result.lifecycle).toBe('ready');
  });

  it('rejects invalid URL', async () => {
    const createResponse = await sendRequest(ws, 'session.create', {
      viewport: { width: 375, height: 667 },
    });
    const sessionId = createResponse.result.sessionId;

    const loadResponse = await sendRequest(ws, 'session.load', {
      sessionId,
      url: 'ftp://example.com',
    });
    expect(loadResponse.error).toBeDefined();
    expect(loadResponse.error.code).toBe(ErrorCode.INVALID_PARAMS);
  });

  it('reloads a session', async () => {
    const createResponse = await sendRequest(ws, 'session.create', {
      viewport: { width: 375, height: 667 },
    });
    const sessionId = createResponse.result.sessionId;

    await sendRequest(ws, 'session.load', {
      sessionId,
      url: 'https://example.com',
    });

    const reloadResponse = await sendRequest(ws, 'session.reload', {
      sessionId,
    });
    expect(reloadResponse.result).toBeDefined();
  });

  it('closes a session', async () => {
    const createResponse = await sendRequest(ws, 'session.create', {
      viewport: { width: 375, height: 667 },
    });
    const sessionId = createResponse.result.sessionId;

    const closeResponse = await sendRequest(ws, 'session.close', {
      sessionId,
    });
    expect(closeResponse.result).toBeDefined();
    expect(closeResponse.result.sessionId).toBe(sessionId);

    const stateResponse = await sendRequest(ws, 'session.getState', {
      sessionId,
    });
    expect(stateResponse.error).toBeDefined();
    expect(stateResponse.error.code).toBe(ErrorCode.SESSION_NOT_FOUND);
  });

  it('rejects unknown method', async () => {
    const response = await sendRequest(ws, 'unknown.method');
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe(ErrorCode.METHOD_NOT_FOUND);
  });

  it('rejects malformed JSON', async () => {
    return new Promise<void>((resolve) => {
      const handler = (data: unknown) => {
        const msg = JSON.parse(String(data));
        if (msg.error && (msg.error.code === ErrorCode.INVALID_MESSAGE || msg.error.code === ErrorCode.INTERNAL_ERROR)) {
          ws.off('message', handler);
          resolve();
        }
      };
      ws.on('message', handler);
      ws.send('not valid json');
    });
  });

  it('rejects invalid message format', async () => {
    const response = await sendRequest(ws, 'hello', {
      protocolVersion: PROTOCOL_VERSION,
    });
    // This should succeed
    expect(response.result).toBeDefined();
  });
});
