/**
 * Production companion protocol types.
 *
 * Versioned JSON RPC over WebSocket.
 * Designed for extensibility while keeping the foundation simple.
 */

// ---------------------------------------------------------------------------
// Protocol version
// ---------------------------------------------------------------------------

/** Current protocol version. */
export const PROTOCOL_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export enum ErrorCode {
  // Protocol errors (1xxx)
  INVALID_MESSAGE = 1000,
  INVALID_REQUEST_ID = 1001,
  UNSUPPORTED_PROTOCOL_VERSION = 1002,
  METHOD_NOT_FOUND = 1003,
  INVALID_PARAMS = 1004,

  // Authentication errors (2xxx)
  AUTH_REQUIRED = 2000,
  AUTH_INVALID_TOKEN = 2001,

  // Session errors (3xxx)
  SESSION_NOT_FOUND = 3000,
  SESSION_ALREADY_EXISTS = 3001,
  SESSION_CREATE_FAILED = 3002,
  SESSION_NAVIGATE_FAILED = 3003,

  // Browser errors (4xxx)
  BROWSER_NOT_AVAILABLE = 4000,
  BROWSER_LAUNCH_FAILED = 4001,
  BROWSER_DISCONNECTED = 4002,

  // Internal errors (5xxx)
  INTERNAL_ERROR = 5000,
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export type SessionLifecycle =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'loading'
  | 'error'
  | 'closed';

// ---------------------------------------------------------------------------
// Request/Response base types
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
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: unknown;
  };
}

export interface EventMessage {
  readonly event: string;
  readonly data?: unknown;
}

// ---------------------------------------------------------------------------
// Client → Server requests
// ---------------------------------------------------------------------------

export interface HelloRequest extends RequestMessage {
  readonly method: 'hello';
  readonly params: {
    readonly protocolVersion: string;
    readonly capabilities?: readonly string[];
  };
}

export interface PingRequest extends RequestMessage {
  readonly method: 'ping';
}

export interface CreateSessionRequest extends RequestMessage {
  readonly method: 'session.create';
  readonly params: {
    readonly viewport: {
      readonly width: number;
      readonly height: number;
    };
    readonly deviceScaleFactor?: number;
  };
}

export interface CloseSessionRequest extends RequestMessage {
  readonly method: 'session.close';
  readonly params: {
    readonly sessionId: string;
  };
}

export interface LoadUrlRequest extends RequestMessage {
  readonly method: 'session.load';
  readonly params: {
    readonly sessionId: string;
    readonly url: string;
  };
}

export interface ReloadRequest extends RequestMessage {
  readonly method: 'session.reload';
  readonly params: {
    readonly sessionId: string;
  };
}

export interface GetStateRequest extends RequestMessage {
  readonly method: 'session.getState';
  readonly params: {
    readonly sessionId: string;
  };
}

export interface ShutdownRequest extends RequestMessage {
  readonly method: 'shutdown';
}

export type ClientRequest =
  | HelloRequest
  | PingRequest
  | CreateSessionRequest
  | CloseSessionRequest
  | LoadUrlRequest
  | ReloadRequest
  | GetStateRequest
  | ShutdownRequest;

// ---------------------------------------------------------------------------
// Server → Client responses
// ---------------------------------------------------------------------------

export interface HelloResponse extends ResponseMessage {
  readonly result: {
    readonly protocolVersion: string;
    readonly capabilities: readonly string[];
    readonly serverInfo: {
      readonly name: string;
      readonly version: string;
    };
  };
}

export interface PingResponse extends ResponseMessage {
  readonly result: {
    readonly timestamp: number;
  };
}

export interface CreateSessionResponse extends ResponseMessage {
  readonly result: {
    readonly sessionId: string;
    readonly viewport: {
      readonly width: number;
      readonly height: number;
    };
  };
}

export interface CloseSessionResponse extends ResponseMessage {
  readonly result: {
    readonly sessionId: string;
  };
}

export interface LoadUrlResponse extends ResponseMessage {
  readonly result: {
    readonly sessionId: string;
    readonly url: string;
  };
}

export interface ReloadResponse extends ResponseMessage {
  readonly result: {
    readonly sessionId: string;
  };
}

export interface GetStateResponse extends ResponseMessage {
  readonly result: {
    readonly sessionId: string;
    readonly lifecycle: SessionLifecycle;
    readonly url: string | null;
    readonly viewport: {
      readonly width: number;
      readonly height: number;
    };
    readonly title: string | null;
    readonly error: string | null;
  };
}

export interface ShutdownResponse extends ResponseMessage {
  readonly result: {
    readonly message: string;
  };
}

// ---------------------------------------------------------------------------
// Server → Client events
// ---------------------------------------------------------------------------

export interface SessionLifecycleEvent extends EventMessage {
  readonly event: 'session.lifecycle';
  readonly data: {
    readonly sessionId: string;
    readonly lifecycle: SessionLifecycle;
    readonly error?: string;
  };
}

export interface SessionClosedEvent extends EventMessage {
  readonly event: 'session.closed';
  readonly data: {
    readonly sessionId: string;
    readonly reason?: string;
  };
}

export interface CompanionShutdownEvent extends EventMessage {
  readonly event: 'companion.shutdown';
  readonly data: {
    readonly reason?: string;
  };
}

export type ServerEvent =
  | SessionLifecycleEvent
  | SessionClosedEvent
  | CompanionShutdownEvent;

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

export type ServerMessage = ResponseMessage | ServerEvent;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export function isRequestMessage(value: unknown): value is RequestMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.id === 'string' || typeof msg.id === 'number') {
    if (typeof msg.method === 'string') {
      return true;
    }
  }
  return false;
}

export function isResponseMessage(value: unknown): value is ResponseMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.id === 'string' || typeof msg.id === 'number') {
    if ('result' in msg || 'error' in msg) {
      return true;
    }
  }
  return false;
}

export function isEventMessage(value: unknown): value is EventMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.event === 'string') {
    return true;
  }
  return false;
}

export function isValidViewport(
  viewport: unknown
): viewport is { width: number; height: number } {
  if (typeof viewport !== 'object' || viewport === null) return false;
  const v = viewport as Record<string, unknown>;
  if (typeof v.width !== 'number' || typeof v.height !== 'number') return false;
  if (!Number.isInteger(v.width) || !Number.isInteger(v.height)) return false;
  if (v.width < 1 || v.height < 1) return false;
  if (v.width > 10000 || v.height > 10000) return false;
  if (!Number.isFinite(v.width) || !Number.isFinite(v.height)) return false;
  return true;
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function createErrorResponse(
  id: RequestId,
  code: ErrorCode,
  message: string,
  details?: unknown
): ResponseMessage {
  return {
    id,
    error: { code, message, details },
  };
}

export function createSuccessResponse(
  id: RequestId,
  result: unknown
): ResponseMessage {
  return { id, result };
}
