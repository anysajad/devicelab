/**
 * WebSocket client for the local companion.
 *
 * Handles:
 * - Connection management
 * - Authentication
 * - Protocol hello negotiation
 * - Request/response correlation
 * - Structured errors
 * - Event subscriptions
 * - Clean disconnect
 *
 * Does NOT leak raw WebSocket messages to consumers.
 */

import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// Protocol types (mirrored from companion for type safety)
// ---------------------------------------------------------------------------

export type RequestId = string | number;

export interface RequestMessage {
  readonly id: RequestId;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

export interface ResponseMessage {
  readonly id: RequestId;
  readonly result?: unknown;
  readonly error?: {
    readonly code: number;
    readonly message: string;
    readonly details?: unknown;
  };
}

export interface EventMessage {
  readonly event: string;
  readonly data?: unknown;
}

export type ServerMessage = ResponseMessage | EventMessage;

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

export interface CompanionClientConfig {
  /** WebSocket endpoint URL, e.g. ws://127.0.0.1:5199/ws */
  readonly endpoint: string;
  /** Authentication token */
  readonly token: string;
  /** Connection timeout in ms */
  readonly connectTimeout?: number;
  /** Request timeout in ms */
  readonly requestTimeout?: number;
}

// ---------------------------------------------------------------------------
// Client state
// ---------------------------------------------------------------------------

export type ClientState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'error';

// ---------------------------------------------------------------------------
// Client events
// ---------------------------------------------------------------------------

export type ClientEventType =
  | 'stateChange'
  | 'lifecycle'
  | 'closed'
  | 'shutdown';

export interface ClientEvent {
  readonly type: ClientEventType;
  readonly data?: unknown;
}

export type ClientEventListener = (event: ClientEvent) => void;

// ---------------------------------------------------------------------------
// Pending request tracking
// ---------------------------------------------------------------------------

interface PendingRequest {
  readonly resolve: (value: ResponseMessage) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Client interface
// ---------------------------------------------------------------------------

export interface CompanionClient {
  /** Current connection state */
  readonly state: ClientState;
  /** Connect to the companion */
  connect(): Promise<void>;
  /** Disconnect from the companion */
  disconnect(): Promise<void>;
  /** Send a request and wait for response */
  request(method: string, params?: Record<string, unknown>): Promise<ResponseMessage>;
  /** Subscribe to client events */
  on(listener: ClientEventListener): () => void;
  /** Get the session ID if authenticated */
  getSessionId(): string | null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_CONNECT_TIMEOUT = 10_000;
const DEFAULT_REQUEST_TIMEOUT = 30_000;
const PROTOCOL_VERSION = '1.0.0';

export function createCompanionClient(
  config: CompanionClientConfig
): CompanionClient {
  let ws: WebSocket | null = null;
  let state: ClientState = 'disconnected';
  let sessionId: string | null = null;
  const pending = new Map<RequestId, PendingRequest>();
  const listeners = new Set<ClientEventListener>();
  let requestCounter = 0;

  function setState(newState: ClientState): void {
    if (state !== newState) {
      state = newState;
      emit({ type: 'stateChange', data: { state: newState } });
    }
  }

  function emit(event: ClientEvent): void {
    for (const listener of listeners) {
      listener(event);
    }
  }

  function generateRequestId(): RequestId {
    return `req-${++requestCounter}`;
  }

  function handleMessage(data: WebSocket.Data): void {
    try {
      const msg: unknown = JSON.parse(String(data));

      // Check if it's a response
      if (typeof msg === 'object' && msg !== null && 'id' in msg) {
        const response = msg as ResponseMessage;
        const pendingRequest = pending.get(response.id);
        if (pendingRequest) {
          clearTimeout(pendingRequest.timer);
          pending.delete(response.id);
          pendingRequest.resolve(response);
        }
        return;
      }

      // Check if it's an event
      if (typeof msg === 'object' && msg !== null && 'event' in msg) {
        const event = msg as EventMessage;
        if (event.event === 'session.lifecycle') {
          emit({ type: 'lifecycle', data: event.data });
        } else if (event.event === 'session.closed') {
          emit({ type: 'closed', data: event.data });
        } else if (event.event === 'companion.shutdown') {
          emit({ type: 'shutdown', data: event.data });
        }
        return;
      }
    } catch {
      // Ignore malformed messages
    }
  }

  function handleClose(): void {
    // Reject all pending requests
    for (const [id, request] of pending) {
      clearTimeout(request.timer);
      request.reject(new Error('Connection closed'));
      pending.delete(id);
    }

    sessionId = null;
    setState('disconnected');
  }

  function handleError(): void {
    setState('error');
  }

  async function connect(): Promise<void> {
    if (state === 'connected' || state === 'authenticated') {
      return;
    }

    setState('connecting');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws?.close();
        reject(new Error('Connection timeout'));
      }, config.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT);

      try {
        ws = new WebSocket(config.endpoint);

        ws.on('open', async () => {
          try {
            // Perform hello handshake
            const response = await requestInternal('hello', {
              protocolVersion: PROTOCOL_VERSION,
            });

            if (response.error) {
              clearTimeout(timeout);
              ws?.close();
              reject(new Error(`Hello failed: ${response.error.message}`));
              return;
            }

            setState('connected');
            clearTimeout(timeout);
            resolve();
          } catch (err) {
            clearTimeout(timeout);
            ws?.close();
            reject(err);
          }
        });

        ws.on('message', handleMessage);

        ws.on('close', () => {
          clearTimeout(timeout);
          handleClose();
        });

        ws.on('error', (err: Error) => {
          clearTimeout(timeout);
          handleError();
          reject(err);
        });
      } catch (err) {
        clearTimeout(timeout);
        setState('error');
        reject(err);
      }
    });
  }

  async function disconnect(): Promise<void> {
    if (ws) {
      ws.close(1000, 'Client disconnecting');
      ws = null;
    }
    sessionId = null;
    setState('disconnected');
  }

  function requestInternal(
    method: string,
    params?: Record<string, unknown>
  ): Promise<ResponseMessage> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }

      const id = generateRequestId();
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT);

      pending.set(id, { resolve, reject, timer: timeout });

      const message: RequestMessage = {
        id,
        method,
        params: {
          ...params,
          token: config.token,
        },
      };

      ws.send(JSON.stringify(message));
    });
  }

  async function request(
    method: string,
    params?: Record<string, unknown>
  ): Promise<ResponseMessage> {
    if (state !== 'connected' && state !== 'authenticated') {
      throw new Error('Not connected');
    }

    return requestInternal(method, params);
  }

  function on(listener: ClientEventListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function getSessionId(): string | null {
    return sessionId;
  }

  return {
    get state() {
      return state;
    },
    connect,
    disconnect,
    request,
    on,
    getSessionId,
  };
}
