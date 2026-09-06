#!/usr/bin/env node
/**
 * Spike companion — a tiny Playwright browser service over WebSocket.
 *
 * This is NOT production. It proves the feasibility of:
 *   Playwright → CDP screencast → WS → canvas in DeviceLab
 *
 * Bind: loopback only, random port, optional token.
 * One browser, multiple pages (contexts) possible.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { chromium, type Browser, type Page, type CDPSession } from 'playwright';
import type {
  ClientMessage,
  ServerMessage,
  FrameMessage,
} from './protocol.js';
import {
  isClientMessage,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HOST = '127.0.0.1';
const PORT = parseInt(process.env.SPIKE_PORT ?? '0', 10);
const TOKEN = process.env.SPIKE_TOKEN ?? '';
const DEFAULT_VIEWPORT = { width: 375, height: 667 };
const FRAME_QUALITY = 60;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface FrameMetrics {
  framesReceived: number;
  totalFrameBytes: number;
  frameSizes: number[];
  timestamps: number[];
  fps: number;
  avgFrameSize: number;
}

function createMetrics(): FrameMetrics {
  return {
    framesReceived: 0,
    totalFrameBytes: 0,
    frameSizes: [],
    timestamps: [],
    fps: 0,
    avgFrameSize: 0,
  };
}

function recordFrame(m: FrameMetrics, size: number, ts: number): void {
  m.framesReceived++;
  m.totalFrameBytes += size;
  m.frameSizes.push(size);
  m.timestamps.push(ts);
  if (m.frameSizes.length > 100) {
    m.frameSizes.shift();
    m.timestamps.shift();
  }
  const oneSecAgo = ts - 1000;
  const recent = m.timestamps.filter((t) => t > oneSecAgo);
  m.fps = recent.length;
  m.avgFrameSize = m.frameSizes.reduce((a, b) => a + b, 0) / m.frameSizes.length;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  page: Page;
  cdp: CDPSession;
  viewport: { width: number; height: number };
  metrics: FrameMetrics;
  screencastActive: boolean;
  frameIndex: number;
}

let browser: Browser | null = null;
const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendMsg(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, message: string): void {
  sendMsg(ws, { type: 'error', message });
}

/** Convert canvas coordinates → Playwright page coordinates. Spike uses 1:1. */
function canvasToPage(x: number, y: number): { x: number; y: number } {
  return { x, y };
}

// ---------------------------------------------------------------------------
// Screencast
// ---------------------------------------------------------------------------

async function startScreencast(s: Session): Promise<void> {
  if (s.screencastActive) return;
  try {
    await s.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: FRAME_QUALITY,
      maxWidth: s.viewport.width,
      maxHeight: s.viewport.height,
      everyNthFrame: 1,
    });
    s.screencastActive = true;
  } catch (err) {
    console.error(`[${s.id}] startScreencast failed:`, err);
  }
}

async function stopScreencast(s: Session): Promise<void> {
  if (!s.screencastActive) return;
  try {
    await s.cdp.send('Page.stopScreencast');
    s.screencastActive = false;
  } catch { /* best-effort */ }
}

function onScreencastFrame(s: Session, ws: WebSocket, params: { data: string; sessionId: number }): void {
  const ts = Date.now();
  const sizeBytes = Math.ceil((params.data.length * 3) / 4);
  recordFrame(s.metrics, sizeBytes, ts);
  s.frameIndex++;
  const msg: FrameMessage = {
    type: 'frame',
    data: params.data,
    timestamp: ts,
    frameIndex: s.frameIndex,
  };
  sendMsg(ws, msg);
  // Acknowledge to get next frame
  s.cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

async function createSession(
  ws: WebSocket,
  viewport: { width: number; height: number },
  url?: string
): Promise<Session | null> {
  if (!browser) {
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
        ],
      });
    } catch (err) {
      sendError(ws, 'Failed to launch browser: ' + String(err));
      return null;
    }
  }

  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Page.enable');

  const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session: Session = {
    id: sessionId,
    page,
    cdp,
    viewport,
    metrics: createMetrics(),
    screencastActive: false,
    frameIndex: 0,
  };
  sessions.set(sessionId, session);

  cdp.on('Page.screencastFrame', (params) => {
    onScreencastFrame(session, ws, params);
  });

  if (url) {
    sendMsg(ws, { type: 'lifecycle', status: 'loading' });
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
      sendMsg(ws, { type: 'lifecycle', status: 'ready' });
    } catch (err) {
      sendMsg(ws, { type: 'lifecycle', status: 'error', error: String(err) });
    }
  }

  await startScreencast(session);
  sendMsg(ws, { type: 'ready', sessionId, viewport });
  // Wait for first frame
  await new Promise((r) => setTimeout(r, 200));

  return session;
}

async function destroySession(s: Session): Promise<void> {
  await stopScreencast(s);
  try { await s.cdp.detach(); } catch { /* best-effort */ }
  try { await s.page.close(); } catch { /* best-effort */ }
  sessions.delete(s.id);
}

async function shutdown(): Promise<void> {
  console.log('Shutting down...');
  for (const s of sessions.values()) await destroySession(s);
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function handleMessage(ws: WebSocket, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'connect': {
      if (TOKEN && msg.token !== TOKEN) {
        sendError(ws, 'Invalid token');
        ws.close(4001, 'Unauthorized');
        return;
      }
      await createSession(ws, DEFAULT_VIEWPORT);
      break;
    }
    case 'navigate': {
      const s = Array.from(sessions.values())[0];
      if (!s) { sendError(ws, 'No active session'); return; }
      sendMsg(ws, { type: 'lifecycle', status: 'loading' });
      try {
        await s.page.goto(msg.url, { waitUntil: 'load', timeout: 15_000 });
        sendMsg(ws, { type: 'lifecycle', status: 'ready' });
        await stopScreencast(s);
        await new Promise((r) => setTimeout(r, 100));
        await startScreencast(s);
      } catch (err) {
        sendMsg(ws, { type: 'lifecycle', status: 'error', error: String(err) });
      }
      break;
    }
    case 'viewport': {
      const s = Array.from(sessions.values())[0];
      if (!s) { sendError(ws, 'No active session'); return; }
      s.viewport = { width: msg.width, height: msg.height };
      await s.page.setViewportSize({ width: msg.width, height: msg.height });
      await stopScreencast(s);
      await new Promise((r) => setTimeout(r, 50));
      await startScreencast(s);
      break;
    }
    case 'pointer': {
      const s = Array.from(sessions.values())[0];
      if (!s) return;
      const { x, y } = canvasToPage(msg.x, msg.y);
      const btn = msg.button === 0 ? 'left' : msg.button === 2 ? 'right' : 'middle';
      if (msg.kind === 'down') {
        await s.page.mouse.move(x, y);
        await s.page.mouse.down({ button: btn });
      } else if (msg.kind === 'up') {
        await s.page.mouse.up({ button: btn });
      } else if (msg.kind === 'move') {
        await s.page.mouse.move(x, y);
      }
      break;
    }
    case 'wheel': {
      const s = Array.from(sessions.values())[0];
      if (!s) return;
      await s.page.mouse.wheel(msg.deltaX, msg.deltaY);
      break;
    }
    case 'disconnect': {
      for (const s of sessions.values()) await destroySession(s);
      ws.close(1000, 'Disconnected');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/status') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ status: 'running', sessions: sessions.size, browser: !!browser }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const remote = req.socket.remoteAddress ?? '';
    if (!remote.includes('127.0.0.1') && !remote.includes('::1')) {
      sendError(ws, 'Only loopback connections allowed');
      ws.close(4003, 'Not loopback');
      return;
    }

    console.log('Client connected');

    ws.on('message', async (data) => {
      try {
        const parsed: unknown = JSON.parse(String(data));
        if (!isClientMessage(parsed)) { sendError(ws, 'Invalid message type'); return; }
        await handleMessage(ws, parsed);
      } catch (err) {
        sendError(ws, 'Failed to process message: ' + String(err));
      }
    });

    ws.on('close', () => console.log('Client disconnected'));
    ws.on('error', (err) => console.error('WebSocket error:', err));
  });

  httpServer.listen(PORT, HOST, () => {
    const addr = httpServer.address();
    if (addr && typeof addr === 'object') {
      const port = addr.port;
      console.log(`Spike companion listening on ws://${HOST}:${port}/ws`);
      if (TOKEN) console.log(`Token: ${TOKEN}`);
      console.log(`PORT=${port}`);
    }
  });

  const graceful = async () => { await shutdown(); httpServer.close(); process.exit(0); };
  process.on('SIGINT', graceful);
  process.on('SIGTERM', graceful);
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });