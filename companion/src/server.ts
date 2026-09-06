/**
 * Main companion server.
 *
 * Orchestrates:
 * - Transport (WebSocket)
 * - Browser lifecycle
 * - Session management
 * - Request handling
 */

import { WebSocket } from 'ws';
import type { RequestMessage, ResponseMessage } from './protocol/types.js';
import {
  ErrorCode,
  PROTOCOL_VERSION,
  createErrorResponse,
  createSuccessResponse,
  isValidUrl,
  isValidViewport,
} from './protocol/types.js';
import {
  type Transport,
  type TransportConfig,
  createTransport,
} from './transport/websocket.js';
import { type AuthConfig, createAuthConfig } from './transport/auth.js';
import {
  createCompanionBrowser,
} from './browser/companionBrowser.js';
import {
  createBrowserSession,
} from './browser/browserSession.js';

export interface CompanionServerConfig {
  readonly host?: string;
  readonly port?: number;
  readonly auth?: AuthConfig;
  readonly browser?: CompanionBrowserConfig;
}

interface CompanionBrowserConfig {
  readonly headless?: boolean;
  readonly args?: readonly string[];
}

export interface CompanionServer {
  readonly port: number;
  readonly token: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

const SERVER_NAME = 'devicelab-companion';
const SERVER_VERSION = '0.1.0';

/**
 * Create a new companion server.
 */
export function createCompanionServer(
  config: CompanionServerConfig = {}
): CompanionServer {
  const auth = config.auth ?? createAuthConfig();
  const browser = createCompanionBrowser(config.browser);
  const sessions = new Map<string, BrowserSession>();

  let transport: Transport | null = null;

  function generateSessionId(): string {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  async function handleRequest(
    ws: WebSocket,
    msg: RequestMessage
  ): Promise<ResponseMessage | null> {
    switch (msg.method) {
      case 'hello': {
        const params = msg.params as {
          protocolVersion: string;
          capabilities?: readonly string[];
        };

        if (params.protocolVersion !== PROTOCOL_VERSION) {
          return createErrorResponse(
            msg.id,
            ErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
            `Unsupported protocol version: ${params.protocolVersion}. Server supports: ${PROTOCOL_VERSION}`
          );
        }

        return createSuccessResponse(msg.id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: ['session.create', 'session.load', 'session.reload'],
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        });
      }

      case 'ping': {
        return createSuccessResponse(msg.id, {
          timestamp: Date.now(),
        });
      }

      case 'session.create': {
        const params = msg.params as {
          viewport: { width: number; height: number };
          deviceScaleFactor?: number;
        };

        if (!isValidViewport(params.viewport)) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            'Invalid viewport dimensions'
          );
        }

        try {
          const sessionId = generateSessionId();
          const session = createBrowserSession({
            id: sessionId,
            viewport: params.viewport,
            deviceScaleFactor: params.deviceScaleFactor,
          });

          const context = await browser.createContext({
            viewport: params.viewport,
            deviceScaleFactor: params.deviceScaleFactor,
          });

          await session.init(context);
          sessions.set(sessionId, session);

          return createSuccessResponse(msg.id, {
            sessionId,
            viewport: params.viewport,
          });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_CREATE_FAILED,
            `Failed to create session: ${String(err)}`
          );
        }
      }

      case 'session.close': {
        const params = msg.params as { sessionId: string };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        await session.close();
        sessions.delete(params.sessionId);

        return createSuccessResponse(msg.id, {
          sessionId: params.sessionId,
        });
      }

      case 'session.load': {
        const params = msg.params as { sessionId: string; url: string };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        if (!isValidUrl(params.url)) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            'Invalid URL. Only http: and https: protocols are supported.'
          );
        }

        try {
          await session.load(params.url);
          return createSuccessResponse(msg.id, {
            sessionId: params.sessionId,
            url: params.url,
          });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NAVIGATE_FAILED,
            `Failed to navigate: ${String(err)}`
          );
        }
      }

      case 'session.reload': {
        const params = msg.params as { sessionId: string };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.reload();
          return createSuccessResponse(msg.id, {
            sessionId: params.sessionId,
          });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NAVIGATE_FAILED,
            `Failed to reload: ${String(err)}`
          );
        }
      }

      case 'session.getState': {
        const params = msg.params as { sessionId: string };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        const state = session.getState();
        return createSuccessResponse(msg.id, state);
      }

      case 'shutdown': {
        // Broadcast shutdown event
        transport?.broadcast({
          event: 'companion.shutdown',
          data: { reason: 'Server shutting down' },
        });

        // Schedule shutdown after sending response
        setTimeout(() => {
          stop().then(() => process.exit(0));
        }, 100);

        return createSuccessResponse(msg.id, {
          message: 'Server shutting down',
        });
      }

      default: {
        return createErrorResponse(
          msg.id,
          ErrorCode.METHOD_NOT_FOUND,
          `Unknown method: ${msg.method}`
        );
      }
    }
  }

  async function start(): Promise<void> {
    const transportConfig: TransportConfig = {
      host: config.host ?? '127.0.0.1',
      port: config.port ?? 0,
      auth,
    };

    transport = createTransport(transportConfig, handleRequest);
    await transport.start();

    console.log(`Companion listening on ws://${transportConfig.host}:${transport.port}/ws`);
    console.log(`Token: ${auth.token}`);
  }

  async function stop(): Promise<void> {
    // Close all sessions
    for (const session of sessions.values()) {
      await session.close();
    }
    sessions.clear();

    // Close browser
    await browser.close();

    // Stop transport
    if (transport) {
      await transport.stop();
      transport = null;
    }
  }

  return {
    get port() {
      return transport?.port ?? 0;
    },
    get token() {
      return auth.token;
    },
    start,
    stop,
  };
}
