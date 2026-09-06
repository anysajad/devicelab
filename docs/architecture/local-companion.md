# Local Companion

**Status:** Phase 2B-2 (Live Screenshot/Canvas Data Plane)

## Why the companion exists

DeviceLab's current iframe-based preview cannot render sites that refuse to be embedded via `X-Frame-Options` or CSP `frame-ancestors`. The companion provides a Playwright-backed browser instance that can render any website, delivered over a local WebSocket connection.

## Architecture

```
┌─────────────────────────┐     WebSocket (JSON RPC)     ┌──────────────────────────┐
│   DeviceLab Web UI      │ ◄─────────────────────────► │   Companion Process      │
│   (BrowserPreviewBackend)│     ws://127.0.0.1:PORT      │   (Node.js + Playwright) │
│   (canvas surface)      │                              │   (screenshot capture)   │
└─────────────────────────┘                              └────────────┬─────────────┘
                                                                     │
                                                            Playwright API
                                                                     │
                                                            ┌────────▼─────────┐
                                                            │ Chromium Browser │
                                                            │ (headless)       │
                                                            │ ┌──────────────┐ │
                                                            │ │ Target Page  │ │
                                                            │ └──────────────┘ │
                                                            └──────────────────┘
```

## Process lifecycle

1. **Start:** Companion starts as a separate Node.js process
2. **Bind:** Listens on loopback only (`127.0.0.1`)
3. **Token:** Generates a random authentication token
4. **Ready:** Accepts WebSocket connections
5. **Shutdown:** Graceful shutdown on SIGINT/SIGTERM

## WebSocket protocol

**Transport:** `ws://127.0.0.1:<port>/ws`

**Version:** 1.0.0

**Message format:** JSON RPC with request IDs

### Client → Server requests

| Method | Description |
| --- | --- |
| `hello` | Protocol version negotiation |
| `ping` | Health check |
| `session.create` | Create a new browser session |
| `session.close` | Close a session |
| `session.load` | Navigate to a URL |
| `session.reload` | Reload current page |
| `session.getState` | Get session state |
| `shutdown` | Graceful shutdown |

### Server → Client responses

All responses include the request `id` and either `result` or `error`.

### Server → Client events

| Event | Description |
| --- | --- |
| `session.lifecycle` | Session state changed |
| `session.closed` | Session was closed |
| `companion.shutdown` | Server is shutting down |

## Authentication

- Random 256-bit token generated on startup
- Token required for all requests except `hello`
- Constant-time token comparison
- Token never logged or written to filesystem

## Security model

- **Loopback only:** Binds to `127.0.0.1` (and `::1` where practical)
- **No external access:** Rejects non-loopback connections
- **Token auth:** Random per-process token required
- **No code execution:** Never executes JavaScript from client
- **No file access:** No filesystem operations exposed
- **No shell access:** No command execution
- **No CDP proxy:** No direct Chrome DevTools Protocol exposure
- **URL validation:** Only `http:` and `https:` protocols allowed
- **Viewport validation:** Integer dimensions, bounded 1-10000px

## Browser lifecycle

- Launches Chromium headless by default
- Each session gets an isolated browser context
- Pages are created on demand
- Clean shutdown of all contexts on server stop
- Handles browser crashes gracefully

## Current capabilities

- ✅ WebSocket server with authentication
- ✅ Protocol version negotiation
- ✅ Session create/close/reload
- ✅ URL navigation with validation
- ✅ Viewport configuration
- ✅ State reporting
- ✅ Graceful shutdown
- ✅ Loopback-only binding

## Intentionally NOT implemented yet

- ❌ UI integration (Phase 2B)
- ❌ Screenshot frame delivery
- ❌ Mouse/keyboard input forwarding
- ❌ DPR emulation
- ❌ Authentication profiles/storageState
- ❌ Multi-preview coordination
- ❌ Error recovery/reconnection
- ❌ Frame rate adaptation

## How to run locally

```bash
# From the companion directory
cd companion
npm install
npm run dev

# Or from the root
npm run companion:dev
```

The server will print the token needed for authentication.

## How to test

```bash
# Unit tests
cd companion
npm test

# Or from the root
npm run companion:test
```

## How this connects to PreviewBackend

The companion is used by `BrowserPreviewBackend` which:

1. Connects to the companion via WebSocket
2. Creates a session with the requested viewport
3. Loads the target URL
4. Reports state changes back to the preview layer

## Phase 2B-1: BrowserPreviewBackend Control Plane

Phase 2B-1 establishes the control plane for browser-backed previews:

### BrowserPreviewBackend

- Implements the existing `PreviewBackend` contract
- Communicates with the companion via WebSocket
- Manages session lifecycle
- Maps companion states to preview lifecycle states
- Provides zoom/viewport control
- Reports state changes to UI

### WebSocket Client

- Handles connection management
- Performs protocol hello handshake
- Authenticates with token
- Correlates requests/responses
- Handles concurrent requests
- Subscribes to events

### Lifecycle Mapping

| Companion State | Preview State |
| --- | --- |
| idle | idle |
| starting | loading |
| ready | ready |
| loading | loading |
| error | error |
| closed | error |

### Current Capabilities

- ✅ Session lifecycle management
- ✅ URL navigation
- ✅ Viewport configuration
- ✅ State reporting
- ✅ Zoom control
- ✅ Error handling

### Intentionally NOT Implemented Yet

- ❌ Mouse/keyboard input (Phase 2B-3)
- ❌ DPR emulation
- ❌ Authentication profiles/storageState
- ❌ Multi-preview optimization

## Phase 2B-2: Live Screenshot/Canvas Data Plane

Phase 2B-2 adds real visual frame delivery:

### Screenshot Capture

- Companion captures screenshots via `page.screenshot()` polling
- Conservative target: ~10 FPS maximum per active session
- JPEG quality: Q60 (matching feasibility spike)
- Latest-frame-wins semantics (no frame queue)
- Frame loop starts when session becomes ready
- Frame loop stops on session close or browser disconnect

### Frame Protocol

```json
{
  "event": "session.frame",
  "data": {
    "sessionId": "s-1234567890-abc123",
    "sequence": 1,
    "width": 375,
    "height": 667,
    "encoding": "jpeg",
    "payload": "base64-encoded-jpeg-data",
    "timestamp": 1234567890123
  }
}
```

### Canvas Surface

- Real HTMLCanvasElement renders screenshot frames
- Canvas dimensions match CSS viewport (no DPR scaling yet)
- Frames decoded via ImageBitmap for performance
- Previous bitmaps released to prevent memory leaks
- Latest-frame-wins semantics

### Frame Lifecycle

| Event | Behavior |
| --- | --- |
| First frame | Decoded and drawn to canvas |
| Subsequent frames | Replace previous frame |
| Navigation | Frame loop continues |
| Reload | Frame loop continues |
| Viewport change | Canvas resized, frames update |
| Page error | Frame loop stops |
| Browser disconnect | Frame loop stops |
| Session close | Frame loop stops |

### Current Capabilities

- ✅ Screenshot capture at ~10 FPS
- ✅ JPEG encoding (Q60)
- ✅ Frame delivery via WebSocket
- ✅ Canvas rendering
- ✅ Frame performance metrics
- ✅ Stale session frame rejection
- ✅ Clean destroy/cleanup

### Production Measurements (Phase 2B-2.1 Validation)

Actual measurements from the production implementation:

| Metric | Value |
| --- | --- |
| FPS | 10.0 |
| Average frame size | 9.3 KB |
| Frames per second | ~10 |
| Bandwidth per preview | ~93 KB/s |

### Viewport Validation

All viewport configurations tested and verified:

| Viewport | Status |
| --- | --- |
| 375×667 (phone portrait) | ✅ |
| 667×375 (phone landscape) | ✅ |
| 1280×720 (desktop) | ✅ |
| 1024×768 (custom) | ✅ |

### Multi-Preview Validation

Two simultaneous browser sessions tested:
- Independent session IDs
- Independent frame streams
- Frames never cross between previews
- Destroying one session doesn't affect the other

### Intentionally NOT Implemented Yet

- ❌ Mouse/keyboard input (Phase 2B-3)
- ❌ Wheel/scroll forwarding (Phase 2B-3)
- ❌ Touch input (Phase 2B-3)
- ❌ DPR emulation
- ❌ Authentication profiles/storageState
- ❌ Multi-preview optimization
- ❌ Frame rate adaptation
- ❌ Reconnection/retry UX

## Protocol example

```json
// Client sends
{
  "id": 1,
  "method": "session.create",
  "params": {
    "viewport": { "width": 375, "height": 667 }
  }
}

// Server responds
{
  "id": 1,
  "result": {
    "sessionId": "s-1234567890-abc123",
    "viewport": { "width": 375, "height": 667 }
  }
}
```
