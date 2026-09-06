import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createBrowserSession } from '../src/browser/browserSession.js';
import { chromium, type Browser, type BrowserContext } from 'playwright';

describe('BrowserSession', () => {
  let browser: Browser;
  let context: BrowserContext;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 375, height: 667 },
    });
  });

  afterEach(async () => {
    await context.close();
    await browser.close();
  });

  it('creates session with initial state', () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    const state = session.getState();
    expect(state.sessionId).toBe('test-session');
    expect(state.lifecycle).toBe('idle');
    expect(state.url).toBeNull();
    expect(state.viewport).toEqual({ width: 375, height: 667 });
    expect(state.title).toBeNull();
    expect(state.error).toBeNull();
  });

  it('initializes with context', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);

    const state = session.getState();
    expect(state.lifecycle).toBe('ready');
  });

  it('loads a URL', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.load('https://example.com');

    const state = session.getState();
    expect(state.url).toBe('https://example.com');
    expect(state.lifecycle).toBe('ready');
  });

  it('reports error on invalid URL', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);

    await expect(
      session.load('https://this-domain-does-not-exist-12345.com')
    ).rejects.toThrow();

    const state = session.getState();
    expect(state.lifecycle).toBe('error');
    expect(state.error).toBeTypeOf('string');
  });

  it('subscribes to state changes', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    const states: string[] = [];
    session.subscribe((state) => {
      states.push(state.lifecycle);
    });

    await session.init(context);
    await session.load('https://example.com');

    expect(states).toContain('ready');
    expect(states).toContain('loading');
  });

  it('closes cleanly', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.close();

    const state = session.getState();
    expect(state.lifecycle).toBe('closed');
  });

  it('throws on load before init', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await expect(session.load('https://example.com')).rejects.toThrow(
      'Session not initialized'
    );
  });

  it('throws on reload before init', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await expect(session.reload()).rejects.toThrow('Session not initialized');
  });

  it('throws on reload without URL', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);

    await expect(session.reload()).rejects.toThrow('No URL loaded');
  });

  it('reloads after loading', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.load('https://example.com');
    await session.reload();

    const state = session.getState();
    expect(state.url).toBe('https://example.com');
    expect(state.lifecycle).toBe('ready');
  });
});
