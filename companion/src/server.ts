/**
 * Main companion server.
 *
 * Orchestrates:
 * - Transport (WebSocket)
 * - Browser lifecycle
 * - Session management
 * - Screenshot capture
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
  type BrowserSession,
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
const SERVER_VERSION = '0.2.0';

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

  /**
   * Start frame capture for a session and broadcast frames to all clients.
   */
  function startSessionFrameCapture(session: BrowserSession): void {
    session.startFrameCapture((frame) => {
      // Broadcast frame to all connected clients
      transport?.broadcast({
        event: 'session.frame',
        data: frame,
      });
    });
  }

  /**
   * Stop frame capture for a session.
   */
  function stopSessionFrameCapture(session: BrowserSession): void {
    session.stopFrameCapture();
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

          // Start frame capture for the new session
          startSessionFrameCapture(session);

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

        // Stop frame capture before closing
        stopSessionFrameCapture(session);
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

      // -----------------------------------------------------------------------
      // Input commands (Phase 2B-3)
      // -----------------------------------------------------------------------

      case 'session.mouseMove': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.mouseMove(params.x, params.y);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to move mouse: ${String(err)}`
          );
        }
      }

      case 'session.mouseDown': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
          button?: string;
          clickCount?: number;
          modifiers?: Record<string, boolean>;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.mouseDown(
            params.x,
            params.y,
            params.button as 'left' | 'right' | 'middle',
            params.clickCount,
            params.modifiers
          );
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to press mouse: ${String(err)}`
          );
        }
      }

      case 'session.mouseUp': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
          button?: string;
          clickCount?: number;
          modifiers?: Record<string, boolean>;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.mouseUp(
            params.x,
            params.y,
            params.button as 'left' | 'right' | 'middle',
            params.clickCount,
            params.modifiers
          );
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to release mouse: ${String(err)}`
          );
        }
      }

      case 'session.mouseClick': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
          button?: string;
          clickCount?: number;
          modifiers?: Record<string, boolean>;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.mouseClick(
            params.x,
            params.y,
            params.button as 'left' | 'right' | 'middle',
            params.clickCount,
            params.modifiers
          );
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to click: ${String(err)}`
          );
        }
      }

      case 'session.mouseDoubleClick': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
          button?: string;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.mouseDoubleClick(
            params.x,
            params.y,
            params.button as 'left' | 'right' | 'middle'
          );
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to double click: ${String(err)}`
          );
        }
      }

      case 'session.wheel': {
        const params = msg.params as {
          sessionId: string;
          deltaX: number;
          deltaY: number;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.wheel(params.deltaX, params.deltaY);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to scroll: ${String(err)}`
          );
        }
      }

      case 'session.keyDown': {
        const params = msg.params as {
          sessionId: string;
          key: string;
          code?: string;
          modifiers?: Record<string, boolean>;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.keyDown(params.key, params.code, params.modifiers);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to press key: ${String(err)}`
          );
        }
      }

      case 'session.keyUp': {
        const params = msg.params as {
          sessionId: string;
          key: string;
          code?: string;
          modifiers?: Record<string, boolean>;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.keyUp(params.key, params.code, params.modifiers);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to release key: ${String(err)}`
          );
        }
      }

      case 'session.type': {
        const params = msg.params as {
          sessionId: string;
          text: string;
          delay?: number;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        // Validate text length
        if (params.text.length > 10000) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            'Text too long (max 10000 characters)'
          );
        }

        try {
          await session.type(params.text, params.delay);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to type: ${String(err)}`
          );
        }
      }

      case 'session.touchStart': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.touchStart(params.x, params.y);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to start touch: ${String(err)}`
          );
        }
      }

      case 'session.touchMove': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.touchMove(params.x, params.y);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to move touch: ${String(err)}`
          );
        }
      }

      case 'session.touchEnd': {
        const params = msg.params as {
          sessionId: string;
          x: number;
          y: number;
        };
        const session = sessions.get(params.sessionId);

        if (!session) {
          return createErrorResponse(
            msg.id,
            ErrorCode.SESSION_NOT_FOUND,
            `Session not found: ${params.sessionId}`
          );
        }

        try {
          await session.touchEnd(params.x, params.y);
          return createSuccessResponse(msg.id, { ok: true });
        } catch (err) {
          return createErrorResponse(
            msg.id,
            ErrorCode.INVALID_PARAMS,
            `Failed to end touch: ${String(err)}`
          );
        }
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
    // Stop all frame captures and close sessions
    for (const session of sessions.values()) {
      stopSessionFrameCapture(session);
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
