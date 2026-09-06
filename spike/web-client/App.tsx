/**
 * Spike web client — standalone React app that connects to the companion
 * and displays live frames on a canvas.
 *
 * This is NOT part of the DeviceLab production UI.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ---------------------------------------------------------------------------
// Types (duplicated from companion/protocol.ts — keeping spike self-contained)
// ---------------------------------------------------------------------------

interface ServerMessage {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface Metrics {
  fps: number;
  framesReceived: number;
  avgFrameSize: number;
  latency: number;
  lastFrameTime: number;
}

// ---------------------------------------------------------------------------
// LiveView component — canvas that renders incoming frames
// ---------------------------------------------------------------------------

function LiveView({
  wsRef,
  viewportWidth,
  viewportHeight,
}: {
  wsRef: React.RefObject<WebSocket | null>;
  viewportWidth: number;
  viewportHeight: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metrics, setMetrics] = useState<Metrics>({
    fps: 0,
    framesReceived: 0,
    avgFrameSize: 0,
    latency: 0,
    lastFrameTime: 0,
  });
  const frameCountRef = useRef(0);
  const lastMetricsUpdate = useRef(Date.now());
  const fpsBufferRef = useRef<number[]>([]);

  // Canvas rendering loop — draws latest frame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let latestFrameData: string | null = null;
    let animFrame: number;

    function draw() {
      if (latestFrameData) {
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = 'data:image/jpeg;base64,' + latestFrameData;
        latestFrameData = null;
      }
      animFrame = requestAnimationFrame(draw);
    }

    // Listen for frames via a custom event
    function onFrame(e: CustomEvent) {
      latestFrameData = e.detail.data;
      const now = Date.now();
      fpsBufferRef.current.push(now);
      // Keep last second
      fpsBufferRef.current = fpsBufferRef.current.filter((t) => t > now - 1000);
      frameCountRef.current++;
      const latency = e.detail.timestamp ? now - e.detail.timestamp : 0;

      // Update metrics display every 500ms
      if (now - lastMetricsUpdate.current > 500) {
        lastMetricsUpdate.current = now;
        setMetrics({
          fps: fpsBufferRef.current.length,
          framesReceived: frameCountRef.current,
          avgFrameSize: Math.round((e.detail.data?.length ?? 0) * 0.75),
          latency,
          lastFrameTime: now,
        });
      }
    }

    window.addEventListener('spike-frame', onFrame as EventListener);
    animFrame = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('spike-frame', onFrame as EventListener);
      cancelAnimationFrame(animFrame);
    };
  }, []);

  // Interaction handlers — send input to companion
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !wsRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = viewportWidth / rect.width;
      const scaleY = viewportHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      wsRef.current.send(
        JSON.stringify({ type: 'pointer', kind: 'down', x, y, button: e.button })
      );
    },
    [wsRef, viewportWidth, viewportHeight]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !wsRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = viewportWidth / rect.width;
      const scaleY = viewportHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      wsRef.current.send(
        JSON.stringify({ type: 'pointer', kind: 'up', x, y, button: e.button })
      );
    },
    [wsRef, viewportWidth, viewportHeight]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !wsRef.current || e.buttons === 0) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = viewportWidth / rect.width;
      const scaleY = viewportHeight / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      wsRef.current.send(
        JSON.stringify({ type: 'pointer', kind: 'move', x, y, button: e.button })
      );
    },
    [wsRef, viewportWidth, viewportHeight]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (!wsRef.current) return;
      wsRef.current.send(
        JSON.stringify({
          type: 'wheel',
          x: 0,
          y: 0,
          deltaX: e.deltaX,
          deltaY: e.deltaY,
        })
      );
    },
    [wsRef]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <canvas
        ref={canvasRef}
        width={viewportWidth}
        height={viewportHeight}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
        style={{
          border: '1px solid #333',
          cursor: 'pointer',
          maxWidth: '100%',
          touchAction: 'none',
        }}
      />
      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#888' }}>
        {viewportWidth}×{viewportHeight} | FPS: {metrics.fps} |
        Frames: {metrics.framesReceived} |
        Avg size: {Math.round(metrics.avgFrameSize / 1024)}KB |
        Latency: {metrics.latency}ms
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App — manages WebSocket connection + UI
// ---------------------------------------------------------------------------

function App() {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [companionUrl, setCompanionUrl] = useState('');
  const [lifecycle, setLifecycle] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(375);
  const [viewportHeight, setViewportHeight] = useState(667);
  const [url, setUrl] = useState('about:blank');
  const [showSecond, setShowSecond] = useState(false);

  const connect = useCallback(() => {
    if (!companionUrl) return;
    setStatus('connecting');
    setError(null);

    const wsUrl = companionUrl.replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'connect' }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as ServerMessage;
        switch (msg.type) {
          case 'frame':
            window.dispatchEvent(
              new CustomEvent('spike-frame', { detail: msg })
            );
            break;
          case 'lifecycle':
            setLifecycle(String(msg.status));
            break;
          case 'error':
            setError(String(msg.message));
            break;
          case 'ready':
            setViewportWidth(Number(msg.viewportWidth) || viewportWidth);
            setViewportHeight(Number(msg.viewportHeight) || viewportHeight);
            break;
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => {
      setError('WebSocket connection failed');
      setStatus('disconnected');
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };
  }, [companionUrl, viewportWidth, viewportHeight]);

  const disconnect = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'disconnect' }));
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const navigate = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'navigate', url }));
  }, [url]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', background: '#111', color: '#eee', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>DeviceLab Spike Client</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={companionUrl}
          onChange={(e) => setCompanionUrl(e.target.value)}
          placeholder="ws://127.0.0.1:PORT"
          style={{ padding: 6, border: '1px solid #333', background: '#222', color: '#eee', borderRadius: 4, width: 280 }}
        />
        <button
          onClick={status === 'connected' ? disconnect : connect}
          style={{ padding: '6px 16px', border: '1px solid #53c4f7', background: status === 'connected' ? '#e94560' : 'transparent', color: '#53c4f7', borderRadius: 4, cursor: 'pointer' }}
        >
          {status === 'connected' ? 'Disconnect' : 'Connect'}
        </button>
        <span style={{ padding: 6, color: status === 'connected' ? '#4ade80' : '#888' }}>
          {status === 'connected' ? '● Connected' : status === 'connecting' ? '○ Connecting...' : '○ Disconnected'}
        </span>
      </div>

      {status === 'connected' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="URL to navigate"
            style={{ padding: 6, border: '1px solid #333', background: '#222', color: '#eee', borderRadius: 4, width: 400 }}
          />
          <button
            onClick={navigate}
            style={{ padding: '6px 16px', border: '1px solid #53c4f7', background: 'transparent', color: '#53c4f7', borderRadius: 4, cursor: 'pointer' }}
          >
            Navigate
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#888' }}>
            <input
              type="checkbox"
              checked={showSecond}
              onChange={(e) => setShowSecond(e.target.checked)}
            />
            Second preview
          </label>
        </div>
      )}

      {error && (
        <div style={{ padding: 8, marginBottom: 16, border: '1px solid #e94560', borderRadius: 4, color: '#e94560' }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 13, color: '#888' }}>
        Lifecycle: {lifecycle}
      </div>

      {status === 'connected' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <LiveView wsRef={wsRef} viewportWidth={viewportWidth} viewportHeight={viewportHeight} />
          {showSecond && (
            <LiveView wsRef={wsRef} viewportWidth={412} viewportHeight={915} />
          )}
        </div>
      )}
    </div>
  );
}

// Mount
const root = createRoot(document.getElementById('root')!);
root.render(<App />);