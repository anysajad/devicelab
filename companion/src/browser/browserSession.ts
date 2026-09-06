/**
 * Browser session abstraction.
 *
 * Manages:
 * - Page lifecycle
 * - Navigation
 * - Screenshot capture loop
 * - State reporting
 * - Clean cleanup
 *
 * Each session is an isolated browser context with one page.
 */

import type { BrowserContext, Page } from 'playwright';
import type { SessionLifecycle } from '../protocol/types.js';

export interface BrowserSessionConfig {
  readonly id: string;
  readonly viewport: { width: number; height: number };
  readonly deviceScaleFactor?: number;
}

export interface BrowserSessionState {
  readonly sessionId: string;
  readonly lifecycle: SessionLifecycle;
  readonly url: string | null;
  readonly viewport: { width: number; height: number };
  readonly title: string | null;
  readonly error: string | null;
}

/** Frame captured from the browser session. */
export interface CapturedFrame {
  readonly sessionId: string;
  readonly sequence: number;
  readonly width: number;
  readonly height: number;
  readonly encoding: 'jpeg';
  /** Base64-encoded image data. */
  readonly payload: string;
  readonly timestamp: number;
}

/** Callback for frame events. */
export type FrameCallback = (frame: CapturedFrame) => void;

export interface BrowserSession {
  readonly id: string;
  /** Initialize the session with a browser context. */
  init(context: BrowserContext): Promise<void>;
  /** Navigate to a URL. */
  load(url: string): Promise<void>;
  /** Reload the current page. */
  reload(): Promise<void>;
  /** Get current state. */
  getState(): BrowserSessionState;
  /** Close the session and clean up resources. */
  close(): Promise<void>;
  /** Subscribe to state changes. */
  subscribe(listener: (state: BrowserSessionState) => void): () => void;
  /** Start the screenshot capture loop. */
  startFrameCapture(onFrame: FrameCallback): void;
  /** Stop the screenshot capture loop. */
  stopFrameCapture(): void;
}

const NAVIGATION_TIMEOUT = 15_000;

/** Default JPEG quality for screenshots. */
const DEFAULT_JPEG_QUALITY = 60;

/** Default target FPS for screenshots. */
const DEFAULT_TARGET_FPS = 10;

/** Interval between screenshots in ms. */
const FRAME_INTERVAL_MS = Math.floor(1000 / DEFAULT_TARGET_FPS);

/**
 * Create a new browser session.
 */
export function createBrowserSession(
  config: BrowserSessionConfig
): BrowserSession {
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let lifecycle: SessionLifecycle = 'idle';
  let url: string | null = null;
  let title: string | null = null;
  let error: string | null = null;
  let sequence = 0;
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let frameCallback: FrameCallback | null = null;
  let capturing = false;
  const listeners = new Set<(state: BrowserSessionState) => void>();

  function emit(): void {
    const state = getState();
    for (const listener of listeners) {
      listener(state);
    }
  }

  function setLifecycle(value: SessionLifecycle): void {
    lifecycle = value;
    emit();
  }

  async function init(ctx: BrowserContext): Promise<void> {
    context = ctx;
    page = await context.newPage();

    // Track page events
    page.on('load', () => {
      if (lifecycle === 'loading') {
        setLifecycle('ready');
      }
    });

    page.on('crash', () => {
      error = 'Page crashed';
      setLifecycle('error');
      stopFrameCapture();
    });

    setLifecycle('ready');
  }

  async function load(targetUrl: string): Promise<void> {
    if (!page) {
      throw new Error('Session not initialized');
    }

    url = targetUrl;
    error = null;
    setLifecycle('loading');

    try {
      await page.goto(targetUrl, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT,
      });

      // Get page title if available
      try {
        title = await page.title();
      } catch {
        title = null;
      }

      setLifecycle('ready');
    } catch (err) {
      error = String(err);
      setLifecycle('error');
      throw err;
    }
  }

  async function reload(): Promise<void> {
    if (!page) {
      throw new Error('Session not initialized');
    }

    if (!url) {
      throw new Error('No URL loaded');
    }

    error = null;
    setLifecycle('loading');

    try {
      await page.reload({ timeout: NAVIGATION_TIMEOUT });

      try {
        title = await page.title();
      } catch {
        title = null;
      }

      setLifecycle('ready');
    } catch (err) {
      error = String(err);
      setLifecycle('error');
      throw err;
    }
  }

  function getState(): BrowserSessionState {
    return {
      sessionId: config.id,
      lifecycle,
      url,
      viewport: config.viewport,
      title,
      error,
    };
  }

  async function captureFrame(): Promise<void> {
    if (!page || capturing || lifecycle !== 'ready') {
      return;
    }

    capturing = true;

    try {
      const buffer = await page.screenshot({
        type: 'jpeg',
        quality: DEFAULT_JPEG_QUALITY,
      });

      const frame: CapturedFrame = {
        sessionId: config.id,
        sequence: ++sequence,
        width: config.viewport.width,
        height: config.viewport.height,
        encoding: 'jpeg',
        payload: buffer.toString('base64'),
        timestamp: Date.now(),
      };

      frameCallback?.(frame);
    } catch (err) {
      // Screenshot failed — don't crash the loop, just skip this frame
      console.error(`[${config.id}] Screenshot failed:`, err);
    } finally {
      capturing = false;
    }
  }

  function startFrameCapture(onFrame: FrameCallback): void {
    if (frameTimer) {
      return; // Already capturing
    }

    frameCallback = onFrame;
    frameTimer = setInterval(captureFrame, FRAME_INTERVAL_MS);

    // Capture first frame immediately
    captureFrame();
  }

  function stopFrameCapture(): void {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }
    frameCallback = null;
    capturing = false;
  }

  async function close(): Promise<void> {
    stopFrameCapture();
    setLifecycle('closed');

    if (page) {
      await page.close().catch(() => {});
      page = null;
    }

    if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    listeners.clear();
  }

  function subscribe(
    listener: (state: BrowserSessionState) => void
  ): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    id: config.id,
    init,
    load,
    reload,
    getState,
    close,
    subscribe,
    startFrameCapture,
    stopFrameCapture,
  };
}
