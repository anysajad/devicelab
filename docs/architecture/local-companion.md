# Local Companion

**Status:** Phase 2B-1 (BrowserPreviewBackend control plane)

## Why the companion exists

DeviceLab's current iframe-based preview cannot render sites that refuse to be embedded via `X-Frame-Options` or CSP `frame-ancestors`. The companion provides a Playwright-backed browser instance that can render any website, delivered over a local WebSocket connection.

## Architecture

```
┌─────────────────────────┐     WebSocket (JSON RPC)     ┌──────────────────────────┐
│   DeviceLab Web UI      │ ◄─────────────────────────► │   Companion Process      │
│   (BrowserPreviewBackend)│     ws://127.0.0.1:PORT      │   (Node.js + Playwright) │
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

- ❌ Screenshot frame delivery (Phase 2B-2)
- ❌ Canvas rendering (Phase 2B-2)
- ❌ Mouse/keyboard input (Phase 2B-3)
- ❌ DPR emulation
- ❌ Authentication profiles/storageState
- ❌ Multi-preview optimization

### Why Screenshot Delivery is Deferred

Phase 2B-1 focuses on proving the control plane works end-to-end. Screenshot delivery requires:

1. Canvas element for rendering
2. Frame capture in companion
3. Base64 encoding and transmission
4. Image decoding and canvas drawing

These will be implemented in Phase 2B-2 after the control plane is validated.

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
