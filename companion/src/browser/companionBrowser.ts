/**
 * Playwright browser lifecycle abstraction.
 *
 * Manages:
 * - Chromium launch/shutdown
 * - Browser process health
 * - Context creation
 * - Clean shutdown
 *
 * Does NOT leak Playwright-specific types to the protocol layer.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';

export interface CompanionBrowserConfig {
  readonly headless?: boolean;
  readonly args?: readonly string[];
}

export interface CompanionBrowser {
  /** Launch the browser if not already running. */
  launch(): Promise<void>;
  /** Create a new isolated browser context. */
  createContext(options?: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
  }): Promise<BrowserContext>;
  /** Close the browser and all contexts. */
  close(): Promise<void>;
  /** Whether the browser is currently running. */
  isRunning(): boolean;
}

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-web-security',
];

/**
 * Create a new companion browser instance.
 */
export function createCompanionBrowser(
  config: CompanionBrowserConfig = {}
): CompanionBrowser {
  let browser: Browser | null = null;

  async function launch(): Promise<void> {
    if (browser) return;

    browser = await chromium.launch({
      headless: config.headless ?? true,
      args: [...DEFAULT_ARGS, ...(config.args ?? [])],
    });

    // Handle unexpected browser disconnect
    browser.on('disconnected', () => {
      console.error('Browser disconnected unexpectedly');
      browser = null;
    });
  }

  async function createContext(options?: {
    viewport?: { width: number; height: number };
    deviceScaleFactor?: number;
  }): Promise<BrowserContext> {
    if (!browser) {
      await launch();
    }

    if (!browser) {
      throw new Error('Browser not available');
    }

    return browser.newContext({
      viewport: options?.viewport ?? { width: 375, height: 667 },
      deviceScaleFactor: options?.deviceScaleFactor ?? 1,
    });
  }

  async function close(): Promise<void> {
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }
  }

  function isRunning(): boolean {
    return browser !== null && browser.isConnected();
  }

  return {
    launch,
    createContext,
    close,
    isRunning,
  };
}
