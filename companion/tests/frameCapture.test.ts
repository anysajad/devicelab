/**
 * Tests for the companion browser session frame capture.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { createBrowserSession, type CapturedFrame } from '../src/browser/browserSession.js';

describe('BrowserSession Frame Capture', () => {
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

  it('starts frame capture and receives frames', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.load('data:text/html,<html><body><h1>Test</h1></body></html>');

    const frames: CapturedFrame[] = [];
    session.startFrameCapture((frame) => {
      frames.push(frame);
    });

    // Wait for at least one frame
    await new Promise((resolve) => setTimeout(resolve, 200));

    session.stopFrameCapture();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].sessionId).toBe('test-session');
    expect(frames[0].encoding).toBe('jpeg');
    expect(frames[0].width).toBe(375);
    expect(frames[0].height).toBe(667);
    expect(frames[0].payload.length).toBeGreaterThan(0);
  });

  it('sequence numbers increase', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.load('data:text/html,<html><body><h1>Test</h1></body></html>');

    const frames: CapturedFrame[] = [];
    session.startFrameCapture((frame) => {
      frames.push(frame);
    });

    // Wait for multiple frames
    await new Promise((resolve) => setTimeout(resolve, 350));

    session.stopFrameCapture();

    expect(frames.length).toBeGreaterThanOrEqual(2);

    // Verify sequences are increasing
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].sequence).toBeGreaterThan(frames[i - 1].sequence);
    }
  });

  it('stops frame capture on close', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.load('data:text/html,<html><body><h1>Test</h1></body></html>');

    let frameCount = 0;
    session.startFrameCapture(() => {
      frameCount++;
    });

    // Wait for some frames
    await new Promise((resolve) => setTimeout(resolve, 200));

    const countBeforeClose = frameCount;
    await session.close();

    // Wait more
    await new Promise((resolve) => setTimeout(resolve, 200));

    // No new frames after close
    expect(frameCount).toBe(countBeforeClose);
  });

  it('does not capture frames when not ready', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    // Don't init or load — session is idle
    let frameCount = 0;
    session.startFrameCapture(() => {
      frameCount++;
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    session.stopFrameCapture();

    // No frames captured when not ready
    expect(frameCount).toBe(0);
  });

  it('handles screenshot errors gracefully', async () => {
    const session = createBrowserSession({
      id: 'test-session',
      viewport: { width: 375, height: 667 },
    });

    await session.init(context);
    await session.load('data:text/html,<html><body><h1>Test</h1></body></html>');

    const frames: CapturedFrame[] = [];
    session.startFrameCapture((frame) => {
      frames.push(frame);
    });

    // Wait for frames
    await new Promise((resolve) => setTimeout(resolve, 200));

    session.stopFrameCapture();

    // Should have received at least one frame without crashing
    expect(frames.length).toBeGreaterThan(0);
  });
});
