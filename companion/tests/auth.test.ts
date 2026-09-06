import { describe, it, expect } from 'vitest';
import {
  generateToken,
  createAuthConfig,
  validateToken,
} from '../src/transport/auth.js';

describe('Authentication', () => {
  describe('generateToken', () => {
    it('generates a token', () => {
      const token = generateToken();
      expect(token).toBeTypeOf('string');
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('generates unique tokens', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('createAuthConfig', () => {
    it('creates config with token', () => {
      const config = createAuthConfig();
      expect(config.token).toBeTypeOf('string');
      expect(config.token.length).toBe(64);
    });
  });

  describe('validateToken', () => {
    it('accepts matching token', () => {
      const token = generateToken();
      expect(validateToken(token, token)).toBe(true);
    });

    it('rejects mismatched token', () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(validateToken(token1, token2)).toBe(false);
    });

    it('rejects undefined', () => {
      const token = generateToken();
      expect(validateToken(undefined, token)).toBe(false);
    });

    it('rejects empty string', () => {
      const token = generateToken();
      expect(validateToken('', token)).toBe(false);
    });

    it('rejects different length', () => {
      const token = generateToken();
      expect(validateToken('short', token)).toBe(false);
    });
  });
});
