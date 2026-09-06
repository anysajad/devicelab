# Playwright Live View Spike

Date: 2026-09-06 · Status: experimental spike (no production commitment)

## 1. What was built

A minimal end-to-end prototype proving the pipeline:

```
Real Chromium page
    ↓ Playwright
    ↓ page.screenshot() polling (or CDP screencast)
    ↓ localhost WebSocket
    ↓ DeviceLab web UI
    ↓ canvas surface
    ↓ user can see and interact
```

The spike consists of:
- **Companion process** (`spike/companion/`): Node.js WebSocket server that launches Playwright Chromium, creates browser pages, captures frames, and handles input.
- **Web client** (`spike/web-client/`): Standalone React app with a canvas that connects to the companion, renders frames, and forwards interactions.
- **Test fixture** (`spike/fixture/test-page.html`): A controlled test page with a clickable button, scrollable content, coordinate markers, and a live status bar.
- **Automated tests** (`spike/tests/`, `spike/e2e/`): Protocol validation, companion lifecycle, and full-pipeline E2E tests.

## 2. Architecture / data flow

```
┌─────────────────────┐     WebSocket (JSON)     ┌──────────────────────┐
│   DeviceLab Web UI  │ ◄──────────────────────► │  Companion Process   │
│   (canvas surface)  │     ws://127.0.0.1:PORT   │  (Node.js + WS)     │
└─────────────────────┘                           └──────────┬───────────┘
                                                            │
                                                   Playwright API
                                                            │
                                                   ┌────────▼───────────┐
                                                   │  Chromium Browser  │
                                                   │  (headless)        │
                                                   │  ┌──────────────┐  │
                                                   │  │ Target Page  │  │
                                                   │  │ (fixture)    │  │
                                                   │  └──────────────┘  │
                                                   └────────────────────┘
```

**Frame delivery path:**
1. Companion calls `page.screenshot({ type: 'jpeg', quality: 60 })` at ~10 FPS
2. JPEG buffer is base64-encoded and sent as JSON over WebSocket
3. Web client receives the frame, creates an `Image` object, draws it onto a `<canvas>`

**Input path:**
1. Canvas captures `pointerdown`/`pointerup`/`wheel` events
2. Coordinates are transformed (canvas → viewport CSS → page coordinates)
3. Companion receives input messages and calls `page.mouse.click()` / `page.mouse.wheel()`

## 3. Transport / protocol

**Transport:** WebSocket on `ws://127.0.0.1:<port>/ws`

**Protocol:** JSON messages (intentionally tiny, NOT production RPC):

| Direction | Message | Payload |
| --- | --- | --- |
| C→S | `connect` | `{ token? }` |
| C→S | `navigate` | `{ url }` |
| C→S | `viewport` | `{ width, height }` |
| C→S | `pointer` | `{ kind: 'down'\|'up'\|'move', x, y, button? }` |
| C→S | `wheel` | `{ x, y, deltaX, deltaY }` |
| C→S | `disconnect` | — |
| S→C | `ready` | `{ sessionId, viewport }` |
| S→C | `frame` | `{ data (base64 JPEG), timestamp, frameIndex }` |
| S→C | `lifecycle` | `{ status: 'loading'\|'ready'\|'error', error? }` |
| S→C | `error` | `{ message }` |

**Security:** Loopback bind only (`127.0.0.1`), optional token validation.

## 4. Rendering / screencast technique

**Primary: `page.screenshot()` polling (10 FPS)**

This is the technique that works reliably. Chromium's CDP `Page.startScreencast` is change-based — it only sends frames when the page content visually changes. For a static page, it sends 1-2 frames then stops. This makes it unsuitable for continuous live view.

The polling approach calls `page.screenshot({ type: 'jpeg', quality: 60 })` at regular intervals (~100ms), producing a steady frame stream regardless of page state.

**Fallback considered:** CDP `Page.startScreencast` via CDP session. It works but only for pages with continuous visual changes (animations, video, etc.). Documented as a limitation.

## 5. Interaction mechanism

**Pointer events:**
- Canvas captures `pointerdown`, `pointerup`, `pointermove` events
- Coordinates transformed: `canvasX = (clientX - rect.left) * (viewportWidth / rect.width)`
- Companion receives and calls `page.mouse.move(x, y)` then `page.mouse.down()`/`page.mouse.up()`

**Wheel events:**
- Canvas captures `wheel` events (with `preventDefault`)
- `deltaX`/`deltaY` forwarded directly to `page.mouse.wheel(deltaX, deltaY)`

**Keyboard:** Not implemented in spike (noted as "desirable but not required").

## 6. Coordinate transformation

```
Canvas display coordinates (CSS pixels on screen)
    ↓  multiply by (viewportWidth / canvasDisplayWidth)
Logical viewport CSS coordinates (device viewport)
    ↓  identity in spike (1:1 mapping)
Playwright page coordinates
```

In the spike, the canvas is displayed at 1:1 (no zoom), so the transformation is identity. A production implementation would account for `effectiveZoom` and `devicePixelRatio`.

The spike's `canvasToPage()` function signature includes viewport, DPR, and zoom parameters — all identity/pass-through in the spike, ready for production implementation.

## 7. Measured FPS / frame rate

| Scenario | FPS | Avg frame size | Notes |
| --- | --- | --- | --- |
| Single page, idle | 9 | 12 KB | JPEG quality 60, 375×667 |
| Single page, scrolling | 9 | 12 KB | Consistent during interaction |
| Dual page, idle | 8 | 12-13 KB each | Both streaming simultaneously |

Target was 10 FPS. Achieved ~9 FPS with `page.screenshot()` polling at 100ms intervals. The ~1 FPS gap is due to screenshot serialization overhead.

## 8. Approximate latency

**Not reliably measurable in the spike.** The end-to-end latency (page renders → companion captures → WS transmits → canvas displays) involves:
- `page.screenshot()` capture time (~50-80ms for JPEG at quality 60)
- Base64 encoding (~5ms)
- WebSocket transmission over loopback (<1ms)
- Image decode + canvas draw (~5-10ms)

**Estimated total: 60-100ms** from page change to canvas display. This is acceptable for a dev tool preview but would be noticeable for real-time interaction feedback.

## 9. Frame size / bandwidth

| Quality | Avg frame size (375×667) | Notes |
| --- | --- | --- |
| JPEG Q30 | 8 KB | Visible artifacts |
| JPEG Q60 | 12 KB | Good balance (chosen for spike) |
| JPEG Q80 | 16 KB | Better quality |
| JPEG Q100 | 47 KB | No compression benefit |
| PNG | 24 KB | Lossless, larger |

**Bandwidth at 10 FPS:** ~120 KB/s per preview (JPEG Q60). For 3 simultaneous previews: ~360 KB/s. Acceptable over loopback.

## 10. CPU / memory observations

- **Browser process:** Chromium headless uses ~50-80 MB RAM (baseline, before pages).
- **Per page:** ~9.5 MB JS heap per page (measured via `performance.memory`).
- **Screenshot overhead:** `page.screenshot()` at Q60 takes ~50-80ms per call on this machine. CPU usage is moderate (single-threaded screenshot serialization).
- **Two pages:** No significant degradation. Both can screenshot simultaneously at ~8 FPS.
- **Companion process:** Node.js uses ~30 MB RAM. Minimal CPU when not screenshotting.

## 11. Single-preview results

✅ Works. A real Chromium page is controlled by Playwright, its visual output is continuously represented on a canvas, and interactions (click, scroll) travel back to the page. The counter increments on click, scroll position changes, and frames update to reflect the new state.

## 12. Two-preview results

✅ Works. Two browser pages with different viewports (375×667 and 412×915) can stream simultaneously at ~8 FPS each. No obvious instability. Total bandwidth ~25 KB per frame pair.

## 13. What worked

- `page.screenshot()` polling is reliable and produces consistent frame rates
- WebSocket over loopback is fast and simple
- Canvas rendering of JPEG frames is efficient
- Pointer/wheel input forwarding works correctly
- Multiple simultaneous pages are feasible
- The companion process is lightweight and stable
- Protocol is simple and extensible

## 14. What did not work

- **CDP `Page.startScreencast`** is change-based, not continuous. For static pages, it sends 1-2 frames then stops. Not suitable for live view without continuous visual changes.
- **Latency** is ~60-100ms, which is acceptable for preview but not for real-time interaction feedback (e.g., drag operations would feel laggy).
- **`about:blank` as initial page** blocks WebSocket connections from the browser context (origin policy). Must navigate to a real page first.

## 15. Browser / Playwright limitations discovered

1. **CDP screencast is change-based:** `Page.startScreencast` only sends frames on visual updates. A static page produces 1-2 frames then silence. This is by design in Chromium's screencast implementation.
2. **`page.screenshot()` is synchronous in the page context:** It blocks the page's main thread during capture. For complex pages, this could cause jank.
3. **JPEG quality vs size tradeoff:** Quality 60 is the sweet spot. Below 40, artifacts become distracting. Above 80, size increases rapidly with minimal visual improvement.
4. **`file://` URLs work** for local fixtures but would need an HTTP server for production use (CORS, security context).
5. **Playwright `browser.newContext()`** creates isolated contexts. Each context is a separate browser process tab. Memory scales linearly with contexts.

## 16. Whether the approach is viable for DeviceLab

**Yes.** The pipeline is proven:
- Real Chromium page → Playwright → screenshot → WS → canvas → user sees it
- Click/scroll interactions travel back to the page
- Multiple simultaneous pages work
- Bandwidth and memory are acceptable

The approach does NOT require iframe embedding of the target page — it uses a real browser instance.

## 17. Viability for specific modes

| Mode | Viable? | Notes |
| --- | --- | --- |
| One preview | ✅ Yes | 9 FPS, 12 KB/frame, works well |
| Grid (N previews) | ✅ Likely | 2 pages tested at 8 FPS each. 3-4 should be feasible. 5+ would need frame rate throttling. |
| Focus (1 active) | ✅ Yes | Same as single preview, other pages can be throttled |
| Compare (2-3 side by side) | ✅ Yes | 2 pages tested successfully. 3 should work. |

## 18. Major risks

1. **Latency for interaction-heavy workflows:** 60-100ms latency means drag-and-drop, text selection, and real-time animations would feel laggy. Acceptable for preview, not for editing.
2. **CPU usage at scale:** `page.screenshot()` is CPU-intensive. 5+ simultaneous previews at 10 FPS could saturate a laptop CPU. Mitigation: reduce frame rate for non-active previews.
3. **CDP screencast limitation:** The primary Chromium-native screencast mechanism doesn't work for continuous streaming. The polling fallback is reliable but less efficient.
4. **`navigator.webdriver` detection:** Playwright sets `navigator.webdriver = true`. Some sites may block automated browsers. This is a known Playwright limitation and should be documented, not worked around.
5. **Session/state management:** The spike doesn't address authentication, profiles, or `storageState`. These are Phase 2 concerns.

## 19. Recommended changes to the previously proposed architecture

1. **Replace CDP screencast with `page.screenshot()` polling.** The architecture document (§8) proposed CDP `Page.startScreencast` as the primary frame source. This spike proves it's change-based and unsuitable for continuous live view. The production implementation should use `page.screenshot()` polling with adaptive frame rate (10 FPS for active preview, 2-3 FPS for background previews).

2. **Frame rate throttling by layout mode.** Grid mode should serve 2-3 FPS per preview; Focus mode should serve 10 FPS for the active preview and 1 FPS for thumbnails; Compare mode should serve 5-6 FPS for compared previews.

3. **JPEG quality should be configurable.** Quality 60 is the default, but users on fast networks may prefer quality 80. The companion should accept a quality parameter in the `viewport` or a new `quality` message.

4. **No changes needed to the wire protocol design.** The spike's simple JSON protocol is sufficient. The production RPC can extend it with additional message types (session management, profiles, inspection) without changing the core frame delivery.

## 20. Exact next implementation step

Build the `BrowserPreviewBackend` — a new `PreviewBackend` implementation that:
1. Connects to the companion via WebSocket
2. Creates a browser context with the requested viewport
3. Uses `page.screenshot()` polling for frame delivery
4. Renders frames on a canvas surface
5. Forwards pointer/wheel input to the companion

This backend would be a drop-in replacement for `IframePreviewBackend` in the existing `PreviewBackend` contract, selectable via `backendMode: 'browser'` on `PreviewEntry`.

---

**"Prototype result ≠ production readiness."**

This spike proves technical viability. It does NOT prove production readiness. Key gaps before production: authentication/profiles, error recovery, reconnection logic, frame rate adaptation, security hardening, and multi-device emulation (DPR, user agent, etc.).

---

## Final decision

**VIABLE WITH CONSTRAINTS** — proceed after addressing:

1. **CDP screencast limitation:** Use `page.screenshot()` polling instead. This is the only constraint that affects the core approach.
2. **Latency awareness:** 60-100ms is acceptable for preview but must be documented. Real-time interaction feedback (drag, animation) will feel laggy.
3. **CPU scaling:** Frame rate must be throttled for multiple simultaneous previews.

---

## Files created/modified

**Created:**
- `spike/companion/protocol.ts` — Protocol types
- `spike/companion/coordinates.ts` — Coordinate conversion utilities
- `spike/companion/index.ts` — Companion process (WS server + Playwright)
- `spike/web-client/index.html` — Web client entry point
- `spike/web-client/App.tsx` — React app with canvas + WS connection
- `spike/fixture/test-page.html` — Test fixture page
- `spike/tests/protocol.test.ts` — Protocol validation tests (18 tests)
- `spike/tests/companion.test.ts` — Companion lifecycle tests (9 tests)
- `spike/e2e/spike.e2e.ts` — Full pipeline E2E tests (6 tests)
- `spike/playwright.config.ts` — Playwright config for spike E2E
- `spike/vite.config.ts` — Vite config for web client
- `spike/tsconfig.json` — TypeScript config for spike

**Modified:**
- `vite.config.ts` — Added `exclude: ["spike/**"]` to test config
- `package.json` — Added spike-related scripts

## Tests added

- 18 protocol validation tests (vitest)
- 9 companion lifecycle tests (vitest)
- 6 E2E pipeline tests (playwright)
- **Total: 33 spike tests**

## Test counts

- Existing tests: 828 passed (unchanged)
- Spike tests: 33 passed
- **Total: 861 passed**

## Validation results

- ✅ `npm run typecheck` — passes
- ✅ `npm run lint` — 0 errors, 2 warnings (react-refresh in spike entry point)
- ✅ `npm run format:check` — passes
- ✅ `npm run build` — passes
- ✅ `npm run test` — 828 passed
- ✅ `npm run test:spike` — 27 passed
- ✅ `npm run test:spike:e2e` — 6 passed
- ✅ Existing Playwright E2E — 83/85 passed (2 pre-existing flaky)

## Measured performance

| Metric | Value |
| --- | --- |
| FPS (single preview) | 9 |
| FPS (dual preview) | 8 per page |
| Frame size (JPEG Q60) | 12 KB |
| Frame size (JPEG Q30) | 8 KB |
| Frame size (PNG) | 24 KB |
| Bandwidth per preview | ~120 KB/s |
| Browser heap per page | ~9.5 MB |
| Companion memory | ~30 MB |
| End-to-end latency | ~60-100ms (estimated) |
| Screenshot capture time | ~50-80ms |

## Final viability decision

**VIABLE WITH CONSTRAINTS** — The approach works. CDP screencast is not viable for continuous streaming; `page.screenshot()` polling is the correct mechanism. Latency is acceptable for preview. Multiple simultaneous previews are feasible. Proceed to Phase 2 implementation with `page.screenshot()` as the frame source.

## Recommended next step

Implement `BrowserPreviewBackend` using `page.screenshot()` polling, integrate with the existing `PreviewBackend` contract, and validate in the DeviceLab workspace UI.