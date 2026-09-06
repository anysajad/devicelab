import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  ErrorCode,
  isRequestMessage,
  isResponseMessage,
  isEventMessage,
  isValidViewport,
  isValidUrl,
  createErrorResponse,
  createSuccessResponse,
} from '../src/protocol/types.js';

describe('Protocol', () => {
  describe('PROTOCOL_VERSION', () => {
    it('is defined', () => {
      expect(PROTOCOL_VERSION).toBe('1.0.0');
    });
  });

  describe('isRequestMessage', () => {
    it('accepts valid hello request', () => {
      expect(
        isRequestMessage({
          id: 1,
          method: 'hello',
          params: { protocolVersion: '1.0.0' },
        })
      ).toBe(true);
    });

    it('accepts valid ping request', () => {
      expect(isRequestMessage({ id: 1, method: 'ping' })).toBe(true);
    });

    it('accepts string id', () => {
      expect(isRequestMessage({ id: 'abc', method: 'ping' })).toBe(true);
    });

    it('rejects null', () => {
      expect(isRequestMessage(null)).toBe(false);
    });

    it('rejects undefined', () => {
      expect(isRequestMessage(undefined)).toBe(false);
    });

    it('rejects string', () => {
      expect(isRequestMessage('hello')).toBe(false);
    });

    it('rejects missing method', () => {
      expect(isRequestMessage({ id: 1 })).toBe(false);
    });

    it('accepts any method string', () => {
      expect(isRequestMessage({ id: 1, method: 'unknown' })).toBe(true);
    });

    it('rejects missing id', () => {
      expect(isRequestMessage({ method: 'ping' })).toBe(false);
    });
  });

  describe('isResponseMessage', () => {
    it('accepts success response', () => {
      expect(
        isResponseMessage({ id: 1, result: { success: true } })
      ).toBe(true);
    });

    it('accepts error response', () => {
      expect(
        isResponseMessage({
          id: 1,
          error: { code: 1000, message: 'Error' },
        })
      ).toBe(true);
    });

    it('rejects missing id', () => {
      expect(isResponseMessage({ result: {} })).toBe(false);
    });
  });

  describe('isEventMessage', () => {
    it('accepts valid event', () => {
      expect(
        isEventMessage({ event: 'session.lifecycle', data: {} })
      ).toBe(true);
    });

    it('rejects missing event', () => {
      expect(isEventMessage({ data: {} })).toBe(false);
    });
  });

  describe('isValidViewport', () => {
    it('accepts valid viewport', () => {
      expect(isValidViewport({ width: 375, height: 667 })).toBe(true);
    });

    it('accepts minimum dimensions', () => {
      expect(isValidViewport({ width: 1, height: 1 })).toBe(true);
    });

    it('accepts maximum dimensions', () => {
      expect(isValidViewport({ width: 10000, height: 10000 })).toBe(true);
    });

    it('rejects zero width', () => {
      expect(isValidViewport({ width: 0, height: 667 })).toBe(false);
    });

    it('rejects zero height', () => {
      expect(isValidViewport({ width: 375, height: 0 })).toBe(false);
    });

    it('rejects negative width', () => {
      expect(isValidViewport({ width: -1, height: 667 })).toBe(false);
    });

    it('rejects oversized width', () => {
      expect(isValidViewport({ width: 10001, height: 667 })).toBe(false);
    });

    it('rejects non-integer width', () => {
      expect(isValidViewport({ width: 375.5, height: 667 })).toBe(false);
    });

    it('rejects NaN', () => {
      expect(isValidViewport({ width: NaN, height: 667 })).toBe(false);
    });

    it('rejects Infinity', () => {
      expect(isValidViewport({ width: Infinity, height: 667 })).toBe(false);
    });

    it('rejects non-object', () => {
      expect(isValidViewport('375x667')).toBe(false);
    });

    it('rejects null', () => {
      expect(isValidViewport(null)).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('accepts http URL', () => {
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('accepts https URL', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
    });

    it('accepts IP address', () => {
      expect(isValidUrl('http://127.0.0.1:3000')).toBe(true);
    });

    it('rejects ftp URL', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
    });

    it('rejects file URL', () => {
      expect(isValidUrl('file:///path/to/file')).toBe(false);
    });

    it('rejects invalid URL', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('createErrorResponse', () => {
    it('creates error response', () => {
      const response = createErrorResponse(
        1,
        ErrorCode.INVALID_MESSAGE,
        'Invalid'
      );
      expect(response).toEqual({
        id: 1,
        error: {
          code: ErrorCode.INVALID_MESSAGE,
          message: 'Invalid',
        },
      });
    });

    it('includes details when provided', () => {
      const response = createErrorResponse(
        1,
        ErrorCode.INVALID_PARAMS,
        'Invalid',
        { field: 'width' }
      );
      expect(response.error?.details).toEqual({ field: 'width' });
    });
  });

  describe('createSuccessResponse', () => {
    it('creates success response', () => {
      const response = createSuccessResponse(1, { success: true });
      expect(response).toEqual({
        id: 1,
        result: { success: true },
      });
    });
  });
});
