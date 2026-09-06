/**
 * Authentication for the local companion.
 *
 * Trust model:
 * - Companion runs on localhost only
 * - Random per-process token generated on startup
 * - Token required for all WebSocket connections
 * - Token never logged or exposed to filesystem
 */

import { randomBytes } from 'crypto';

const TOKEN_LENGTH = 32; // 256 bits

export interface AuthConfig {
  readonly token: string;
}

/**
 * Generate a cryptographically random authentication token.
 */
export function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * Create auth configuration with a new random token.
 */
export function createAuthConfig(): AuthConfig {
  return { token: generateToken() };
}

/**
 * Validate a token against the expected value.
 */
export function validateToken(
  provided: string | undefined,
  expected: string
): boolean {
  if (!provided) return false;
  // Constant-time comparison to prevent timing attacks
  if (provided.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < provided.length; i++) {
    result |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}
