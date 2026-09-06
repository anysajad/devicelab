/**
 * WebSocket transport layer for the companion.
 *
 * Handles:
 * - WebSocket server setup
 * - Connection management
 * - Authentication
 * - Message routing
 * - Error handling
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { RequestId } from '../protocol/types.js';
import {
  type RequestMessage,
  type ResponseMessage,
  type ServerMessage,
  isRequestMessage,
  createErrorResponse,
  ErrorCode,
} from '../protocol/types.js';
import { type AuthConfig, validateToken } from './auth.js';

export type MessageHandler = (
  ws: WebSocket,
  msg: RequestMessage
) => Promise<ResponseMessage | null>;

export interface TransportConfig {
  readonly host: string;
  readonly port: number;
  readonly auth: AuthConfig;
}

export interface Transport {
  readonly port: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  send(ws: WebSocket, msg: ServerMessage): void;
  broadcast(msg: ServerMessage): void;
}

/**
 * Create a new transport instance.
 */
export function createTransport(
  config: TransportConfig,
  handler: MessageHandler
): Transport {
  let httpServer: ReturnType<typeof createServer> | null = null;
  let wss: WebSocketServer | null = null;
  const clients = new Set<WebSocket>();

  function send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  async function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/status') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              status: 'running',
              clients: clients.size,
            })
          );
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      wss = new WebSocketServer({ server: httpServer, path: '/ws' });

      wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        // Validate loopback
        const remote = req.socket.remoteAddress ?? '';
        if (!remote.includes('127.0.0.1') && !remote.includes('::1')) {
          send(ws, {
            id: 0,
            error: {
              code: ErrorCode.AUTH_REQUIRED,
              message: 'Only loopback connections allowed',
            },
          });
          ws.close(4003, 'Not loopback');
          return;
        }

        clients.add(ws);

        ws.on('message', async (data) => {
          try {
            const parsed: unknown = JSON.parse(String(data));

            if (!isRequestMessage(parsed)) {
              send(ws, createErrorResponse(
                (parsed as Record<string, unknown>).id as RequestId ?? 0,
                ErrorCode.INVALID_MESSAGE,
                'Invalid message format'
              ));
              return;
            }

            // Validate authentication for non-hello messages
            if (parsed.method !== 'hello') {
              const token = (parsed.params as Record<string, unknown>)?.token as string | undefined;
              if (!validateToken(token, config.auth.token)) {
                send(ws, createErrorResponse(
                  parsed.id,
                  ErrorCode.AUTH_INVALID_TOKEN,
                  'Invalid or missing authentication token'
                ));
                return;
              }
            }

            const response = await handler(ws, parsed);
            if (response) {
              send(ws, response);
            }
          } catch (err) {
            send(ws, createErrorResponse(
              0,
              ErrorCode.INTERNAL_ERROR,
              'Failed to process message: ' + String(err)
            ));
          }
        });

        ws.on('close', () => {
          clients.delete(ws);
        });

        ws.on('error', (err) => {
          console.error('WebSocket error:', err);
          clients.delete(ws);
        });
      });

      httpServer.listen(config.port, config.host, () => {
        const addr = httpServer?.address();
        if (addr && typeof addr === 'object') {
          resolve();
        } else {
          reject(new Error('Failed to start server'));
        }
      });

      httpServer.on('error', reject);
    });
  }

  async function stop(): Promise<void> {
    // Close all clients
    for (const client of clients) {
      client.close(1000, 'Server shutting down');
    }
    clients.clear();

    // Close WebSocket server
    if (wss) {
      await new Promise<void>((resolve) => {
        wss!.close(() => resolve());
      });
      wss = null;
    }

    // Close HTTP server
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer!.close(() => resolve());
      });
      httpServer = null;
    }
  }

  return {
    get port() {
      const addr = httpServer?.address();
      if (addr && typeof addr === 'object') {
        return addr.port;
      }
      return config.port;
    },
    start,
    stop,
    send,
    broadcast,
  };
}
