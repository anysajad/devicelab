/**
 * Spike protocol types — intentionally tiny, NOT production.
 *
 * All messages are JSON strings over WebSocket.
 * Binary frame data is base64-encoded inside JSON for simplicity.
 */

// --- Client → Companion ---

export interface ConnectMessage {
  type: 'connect';
  token?: string;
}

export interface NavigateMessage {
  type: 'navigate';
  url: string;
}

export interface ViewportMessage {
  type: 'viewport';
  width: number;
  height: number;
}

export interface PointerMessage {
  type: 'pointer';
  kind: 'down' | 'up' | 'move';
  x: number;
  y: number;
  button?: number;
}

export interface WheelMessage {
  type: 'wheel';
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
}

export interface DisconnectMessage {
  type: 'disconnect';
}

export type ClientMessage =
  | ConnectMessage
  | NavigateMessage
  | ViewportMessage
  | PointerMessage
  | WheelMessage
  | DisconnectMessage;

// --- Companion → Client ---

export interface HelloMessage {
  type: 'hello';
  port: number;
}

export interface ReadyMessage {
  type: 'ready';
  sessionId: string;
  viewport: { width: number; height: number };
}

export interface FrameMessage {
  type: 'frame';
  data: string; // base64-encoded JPEG
  timestamp: number;
  frameIndex: number;
}

export interface LifecycleMessage {
  type: 'lifecycle';
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface MetricsMessage {
  type: 'metrics';
  fps: number;
  avgFrameSize: number;
  latency: number;
}

export type ServerMessage =
  | HelloMessage
  | ReadyMessage
  | FrameMessage
  | LifecycleMessage
  | ErrorMessage
  | MetricsMessage;

// --- Validation helpers ---

const VALID_CLIENT_TYPES = new Set([
  'connect',
  'navigate',
  'viewport',
  'pointer',
  'wheel',
  'disconnect',
]);

export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.type !== 'string') return false;
  return VALID_CLIENT_TYPES.has(msg.type);
}

export function isConnectMessage(msg: ClientMessage): msg is ConnectMessage {
  return msg.type === 'connect';
}

export function isNavigateMessage(msg: ClientMessage): msg is NavigateMessage {
  return msg.type === 'navigate';
}

export function isViewportMessage(msg: ClientMessage): msg is ViewportMessage {
  return msg.type === 'viewport';
}

export function isPointerMessage(msg: ClientMessage): msg is PointerMessage {
  return msg.type === 'pointer';
}

export function isWheelMessage(msg: ClientMessage): msg is WheelMessage {
  return msg.type === 'wheel';
}

export function isDisconnectMessage(
  msg: ClientMessage
): msg is DisconnectMessage {
  return msg.type === 'disconnect';
}