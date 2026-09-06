import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  createCompanionClient,
  type CompanionClient,
  type ClientEvent,
} from '../browserCompanionClient';

describe('CompanionClient', () => {
  let wss: WebSocketServer;
  let port: number;
  let client: CompanionClient;

  beforeEach(async () => {
    // Start a mock WebSocket server
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
    client?.disconnect();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  });

  function createTestClient(): CompanionClient {
    return createCompanionClient({
      endpoint: `ws://127.0.0.1:${port}/ws`,
      token: 'test-token',
      connectTimeout: 5000,
      requestTimeout: 5000,
    });
  }

  describe('connection', () => {
    it('connects to server', async () => {
      client = createTestClient();

      // Handle hello request
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
          }
        });
      });

      await client.connect();
      expect(client.state).toBe('connected');
    });

    it('rejects connection timeout', async () => {
      client = createCompanionClient({
        endpoint: `ws://127.0.0.1:${port}/ws`,
        token: 'test-token',
        connectTimeout: 100,
      });

      // Don't handle any messages
      await expect(client.connect()).rejects.toThrow();
    });

    it('disconnects cleanly', async () => {
      client = createTestClient();

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
          }
        });
      });

      await client.connect();
      expect(client.state).toBe('connected');

      await client.disconnect();
      expect(client.state).toBe('disconnected');
    });
  });

  describe('requests', () => {
    it('sends requests with authentication', async () => {
      client = createTestClient();

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
          } else if (msg.method === 'ping') {
            // Verify token was sent
            expect(msg.params?.token).toBe('test-token');
            ws.send(
              JSON.stringify({
                id: msg.id,
                result: { timestamp: Date.now() },
              })
            );
          }
        });
      });

      await client.connect();
      const response = await client.request('ping');
      expect(response.result).toBeDefined();
    });

    it('correlates responses correctly', async () => {
      client = createTestClient();

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
          } else if (msg.method === 'getData') {
            // Return different data based on params
            ws.send(
              JSON.stringify({
                id: msg.id,
                result: { value: msg.params?.value },
              })
            );
          }
        });
      });

      await client.connect();

      const [res1, res2] = await Promise.all([
        client.request('getData', { value: 'a' }),
        client.request('getData', { value: 'b' }),
      ]);

      expect((res1.result as { value: string }).value).toBe('a');
      expect((res2.result as { value: string }).value).toBe('b');
    });

    it('handles structured errors', async () => {
      client = createTestClient();

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
          } else {
            ws.send(
              JSON.stringify({
                id: msg.id,
                error: {
                  code: 1000,
                  message: 'Invalid message',
                },
              })
            );
          }
        });
      });

      await client.connect();
      const response = await client.request('unknown');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(1000);
    });

    it('rejects requests when not connected', async () => {
      client = createTestClient();
      await expect(client.request('ping')).rejects.toThrow('Not connected');
    });
  });

  describe('events', () => {
    it('emits lifecycle events', async () => {
      client = createTestClient();
      const events: ClientEvent[] = [];

      client.on((event) => {
        events.push(event);
      });

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
            // Send lifecycle event
            ws.send(
              JSON.stringify({
                event: 'session.lifecycle',
                data: {
                  sessionId: 'test-session',
                  lifecycle: 'ready',
                },
              })
            );
          }
        });
      });

      await client.connect();
      await client.request('session.create', {
        viewport: { width: 375, height: 667 },
      });

      // Wait for event to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      const lifecycleEvents = events.filter((e) => e.type === 'lifecycle');
      expect(lifecycleEvents.length).toBeGreaterThan(0);
    });

    it('emits shutdown events', async () => {
      client = createTestClient();
      const events: ClientEvent[] = [];

      client.on((event) => {
        events.push(event);
      });

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
            // Send shutdown event
            ws.send(
              JSON.stringify({
                event: 'companion.shutdown',
                data: { reason: 'Test shutdown' },
              })
            );
          }
        });
      });

      await client.connect();

      // Wait for event to be processed
      await new Promise((resolve) => setTimeout(resolve, 50));

      const shutdownEvents = events.filter((e) => e.type === 'shutdown');
      expect(shutdownEvents.length).toBe(1);
    });
  });

  describe('concurrent requests', () => {
    it('handles multiple outstanding requests', async () => {
      client = createTestClient();

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
          } else {
            // Delay response to test concurrency
            setTimeout(() => {
              ws.send(
                JSON.stringify({
                  id: msg.id,
                  result: { id: msg.id },
                })
              );
            }, 50);
          }
        });
      });

      await client.connect();

      const promises = Array.from({ length: 5 }, (_, i) =>
        client.request('test', { index: i })
      );

      const responses = await Promise.all(promises);
      expect(responses).toHaveLength(5);

      // Each response should have a unique ID
      const ids = responses.map((r) => (r.result as { id: string }).id);
      expect(new Set(ids).size).toBe(5);
    });
  });
});
