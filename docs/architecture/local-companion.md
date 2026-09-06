# Local Companion

**Status:** Phase 2B-3 (Interaction/Input Plane)

## Why the companion exists

DeviceLab's current iframe-based preview cannot render sites that refuse to be embedded via `X-Frame-Options` or CSP `frame-ancestors`. The companion provides a Playwright-backed browser instance that can render any website, delivered over a local WebSocket connection.

## Architecture

```
┌─────────────────────────┐     WebSocket (JSON RPC)     ┌──────────────────────────┐
│   DeviceLab Web UI      │ ◄─────────────────────────► │   Companion Process      │
│   (BrowserPreviewBackend)│     ws://127.0.0.1:PORT      │   (Node.js + Playwright) │
│   (canvas surface)      │                              │   (screenshot capture)   │
│   (input handling)      │                              │   (input forwarding)     │
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

## Input Architecture

### Coordinate System

Multiple coordinate spaces are involved:
1. Browser viewport CSS pixels (Playwright page coordinates)
2. Canvas internal pixel coordinates
3. Canvas displayed CSS dimensions
4. DeviceLab preview zoom
5. Pointer event client coordinates

The companion/Playwright page receives coordinates in **browser viewport CSS pixels**.

### Input Pipeline

```
Canvas pointer event
  → clientToViewport conversion
  → BrowserPreviewBackend.sendPointerInput()
  → BrowserCompanionClient.request()
  → WebSocket JSON message
  → Companion server
  → BrowserSession method
  → Playwright API call
  → Real page interaction
```

### Supported Input Types

- **Mouse:** move, down, up, click, double-click
- **Wheel:** vertical/horizontal scroll
- **Keyboard:** keyDown, keyUp, text typing
- **Touch:** start, move, end (basic support)

### Focus Management

- Canvas receives keyboard input when focused
- Clicking canvas focuses it
- No global keyboard capture from DeviceLab UI
- URL input, device selector, and other controls unaffected

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

- ❌ DPR emulation
- ❌ Authentication profiles/storageState
- ❌ Multi-preview optimization
- ❌ Frame rate adaptation
- ❌ Reconnection/retry UX

## Phase 2B-3: Interaction/Input Plane

Phase 2B-3 adds real user interaction:

### Input Commands

Extended protocol with typed input commands:
- `session.mouseMove` - Move mouse to position
- `session.mouseDown` - Press mouse button
- `session.mouseUp` - Release mouse button
- `session.mouseClick` - Click at position
- `session.mouseDoubleClick` - Double-click
- `session.wheel` - Scroll wheel
- `session.keyDown` - Press key
- `session.keyUp` - Release key
- `session.type` - Type text
- `session.touchStart` - Touch start
- `session.touchMove` - Touch move
- `session.touchEnd` - Touch end

### Coordinate Conversion

The `coordinateConversion.ts` utility handles mapping between:
- Canvas display coordinates
- Browser viewport CSS pixels
- Playwright page coordinates

### Canvas Surface

- Real HTMLCanvasElement handles pointer/wheel/keyboard events
- Events converted to backend-level input intent
- Backend forwards to companion via typed commands
- Companion maps to Playwright API calls

### Current Capabilities

- ✅ Mouse move/click/double-click
- ✅ Wheel scroll
- ✅ Keyboard input
- ✅ Text typing
- ✅ Touch (basic)
- ✅ Focus management
- ✅ Coordinate conversion
- ✅ Input validation

### Intentionally NOT Implemented Yet

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

## Test Counts

- **Existing tests:** 886 passed (Phase 2B-1/2B-2)
- **Companion tests:** 82 passed (Phase 2B-3)
- **Total:** 968 tests passed

## Validation Results

- ✅ TypeScript typecheck passes
- ✅ ESLint passes (0 errors)
- ✅ Prettier formatting passes
- ✅ Production build succeeds
- ✅ All unit tests pass (886)
- ✅ All companion tests pass (82)

## Remaining Limitations

- ❌ DPR emulation (deferred to future phase)
- ❌ Authentication profiles/storageState (deferred to future phase)
- ❌ Multi-preview optimization (deferred to future phase)
- ❌ Frame rate adaptation (deferred to future phase)
- ❌ Reconnection/retry UX (deferred to future phase)
- ❌ Hosted companion (deferred to future phase)

## Recommended Next Phase

**Phase 2C: Production Integration**

Integrate BrowserPreviewBackend into the DeviceLab workspace:
- Add `backendMode` selector to PreviewEntry
- Create "Connect Companion" dialog
- Wire BrowserPreviewBackend into PreviewWorkspace
- Add visual frame delivery with canvas rendering
- Integrate input handling into preview instances
- Test with real websites that block iframe embedding
